import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { persistWallpapers, serializeDocument, syncWallpapersToFirestore } from '../scripts/sync-firestore.ts';
import { fetchSteamWorkshopWallpapers, normalizeSteamWorkshopItem, mergeWallpapers, REAL_SYNC_AUTHORIZATION, STEAM_QUERY } from '../scripts/sync-workshop.ts';
import { safeMediaUrl, steamLinks } from '../src/utils/safeUrls.ts';
import { extractYouTubeVideoId } from '../src/utils/mediaFormats.ts';

const item = (id = '123') => normalizeSteamWorkshopItem({ publishedfileid: id, title: 'Fixture', subscriptions: 10 });
function database({ failCommit = 0, seed = [] } = {}) {
  const docs = new Map(seed.map(v => [v.id, serializeDocument(v)]));
  const commits = [], writes = [];
  let metadata;
  return {
    docs, commits, writes,
    get metadata() { return metadata; },
    collection(name) { return { doc(id) { return { name, id, async set(value) { metadata = value; } }; } }; },
    async getAll(...refs) { return refs.map(ref => ({ exists: docs.has(ref.id), data: () => docs.get(ref.id) })); },
    batch() {
      let committed = false;
      const pending = [];
      return {
        set(ref, value) {
          assert.equal(committed, false, 'Batch já consumido');
          function validate(v) {
            assert.notEqual(v, undefined, 'Firestore rejeita undefined');
            if (v && typeof v === 'object') Object.values(v).forEach(validate);
          }
          validate(value); pending.push([ref, structuredClone(value)]);
        },
        async commit() {
          assert.equal(committed, false); committed = true;
          commits.push(pending.length);
          if (commits.length === failCommit) throw new Error('Falha simulada');
          for (const [ref, value] of pending) { docs.set(ref.id, value); writes.push(ref.id); }
        },
      };
    },
  };
}

test('caminho de escrita: 200 payloads Steam incompletos sem undefined, idempotência e estatísticas', async () => {
  const db = database();
  const input = Array.from({ length: 200 }, (_, i) => item(String(i + 1)));
  assert.equal((await persistWallpapers(db, input)).insertedCount, 200);
  assert.equal(db.writes.length, 200);
  assert.equal((await persistWallpapers(db, input)).unchangedCount, 200);
  assert.equal(db.writes.length, 200);
  const changed = { ...input[0], title: 'Novo título', stats: { views: 50, subscriptions: undefined } };
  assert.equal((await persistWallpapers(db, [changed])).updatedCount, 1);
  assert.equal(db.docs.get('1').stats.subscriptions, 10);
  assert.equal(db.docs.get('1').stats.views, 50);
  assert.equal(db.metadata.lastRunCount, 1);
  assert.equal(db.metadata.totalWallpapersInCatalog, undefined);
});

test('401 itens renovam batch; falha parcial não publica status completed e reexecução converge', async () => {
  const db = database({ failCommit: 2 });
  const input = Array.from({ length: 401 }, (_, i) => item(String(i + 1)));
  await assert.rejects(persistWallpapers(db, input), /simulada/);
  assert.deepEqual(db.commits, [400, 1]);
  assert.equal(db.metadata, undefined);
  assert.equal(db.docs.size, 400);
  const retry = await persistWallpapers(db, input);
  assert.equal(retry.unchangedCount, 400);
  assert.equal(retry.insertedCount, 1);
  assert.equal(db.docs.size, 401);
});

test('modo real bloqueia falta de autorização, mocks, chave e projeto antes de rede', async () => {
  await assert.rejects(syncWallpapersToFirestore({ dryRun: false }), /Autorização/);
  await assert.rejects(syncWallpapersToFirestore({ dryRun: false, authorization: REAL_SYNC_AUTHORIZATION, useMockData: true }), /simulados/);
  await assert.rejects(syncWallpapersToFirestore({ dryRun: false, authorization: REAL_SYNC_AUTHORIZATION }), /STEAM_API_KEY/);
  await assert.rejects(syncWallpapersToFirestore({ dryRun: false, authorization: REAL_SYNC_AUTHORIZATION, apiKey: 'fixture' }), /PROJECT_ID/);
  const db = database();
  await assert.rejects(persistWallpapers(db, [{ ...item(), isSimulated: true }]), /simulado/);
  assert.equal(db.writes.length, 0);
  for (const limit of [-1, 0, NaN, Infinity, 1.5]) await assert.rejects(syncWallpapersToFirestore({ limit, useMockData: true }), /inteiro/);
});

test('Steam: enum, paginação, filtro de indisponíveis, dedup e retry sem rede', async () => {
  assert.deepEqual(STEAM_QUERY, { popular: 0, recent: 1 });
  const calls = [], pauses = [];
  const input = { publishedfileid: '1', title: 'Fixture', consumer_appid: 431960 };
  const result = await fetchSteamWorkshopWallpapers({ apiKey: 'fixture', pages: 2, sleep: async ms => pauses.push(ms), fetchImpl: async (url, options) => {
    calls.push(new URL(url)); assert.ok(options.signal);
    if (calls.length === 1) return new Response('', { status: 429 });
    return Response.json({ response: { publishedfiledetails: [input, input, { ...input, publishedfileid: '2', banned: true }, { ...input, publishedfileid: '3', visibility: 2 }, { ...input, publishedfileid: '4', result: 9 }] } });
  } });
  assert.equal(result.length, 1);
  assert.equal(calls[0].searchParams.get('query_type'), '0');
  assert.equal(calls.at(-1).searchParams.get('page'), '2');
  assert.ok(pauses.includes(500));
  await assert.rejects(fetchSteamWorkshopWallpapers({ apiKey: 'fixture', fetchImpl: async () => Response.json({}) }), /inválida/);
  let attempts = 0;
  await assert.rejects(fetchSteamWorkshopWallpapers({ apiKey: 'fixture', fetchImpl: async () => { attempts++; return new Response('SECRET MUST NOT BE LOGGED', { status: 403 }); } }), /HTTP 403/);
  assert.equal(attempts, 1);
});

test('merge preserva stats ausentes e detecta título; normalização é determinística', () => {
  const first = item();
  assert.deepEqual(item(), first);
  assert.equal(first.createdAt, '');
  assert.equal(first.previewUrl, '');
  assert.equal(first.resolution, 'Não informada');
  const merged = mergeWallpapers([first], [{ ...first, title: 'Alterado', stats: { views: 20, subscriptions: undefined } }]);
  assert.equal(merged.updated, 1);
  assert.equal(merged.merged[0].stats.subscriptions, 10);
  assert.equal(mergeWallpapers(merged.merged, merged.merged).unchanged, 1);
});

test('CLI falha sem autorização e preserva JSON corrompido; mock separado', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wg-audit-'));
  const file = join(directory, 'catalog.json'); writeFileSync(file, '{invalid');
  const run = args => spawnSync(process.execPath, ['--import', resolve('tests/helpers/offline.mjs'), resolve('scripts/sync-workshop.ts'), ...args], { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.notEqual(run(['--mode=all']).status, 0);
  assert.notEqual(run(['--mock-export', `--out=${file}`]).status, 0);
  assert.equal(readFileSync(file, 'utf8'), '{invalid');
  const demo = join(directory, 'demo.json');
  assert.equal(run(['--mock-export', `--out=${demo}`]).status, 0);
  assert.ok(JSON.parse(readFileSync(demo, 'utf8')).every(v => v.isSimulated));
});

test('URLs bloqueiam esquemas ativos e hosts YouTube falsos; Steam deriva somente IDs reais', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.test/a', '/\\evil.test', 'https://user:pass@example.com']) assert.equal(safeMediaUrl(url), undefined);
  assert.equal(extractYouTubeVideoId('https://evil.test/youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(steamLinks('123', true).web, undefined);
  assert.equal(steamLinks('javascript:foo').web, undefined);
});

test('gravação rejeita coleção contaminada e valores não finitos antes de persistir', async () => {
  const db = database({ seed: [{ ...item(), isSimulated: true }] });
  await assert.rejects(persistWallpapers(db, [item()]), /simulado existente/);
  assert.equal(db.writes.length, 0);
  assert.throws(() => serializeDocument({ stats: { views: NaN } }), /inválido/);
});

test('Steam limita tentativas transitórias e recusa parâmetros inválidos', async () => {
  let attempts = 0;
  await assert.rejects(fetchSteamWorkshopWallpapers({ apiKey: 'fixture', sleep: async () => {}, fetchImpl: async () => { attempts++; return new Response('', { status: 503 }); } }), /esgotadas/);
  assert.equal(attempts, 3);
  await assert.rejects(fetchSteamWorkshopWallpapers({ apiKey: 'fixture', pages: NaN }), /inteiro/);
});
