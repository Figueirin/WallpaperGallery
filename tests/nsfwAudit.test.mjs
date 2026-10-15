// Caracterização de auditoria: os casos "LACUNA" demonstram defeitos atuais,
// não são critérios de aceitação da política NSFW. Ver CODEX_NSFW_AUDIT.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moderateMetadata } from '../src/services/moderation/metadataModerator.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
import { validateManualBlacklist, loadManualBlacklist } from '../src/services/moderation/blacklist.ts';
import { normalizeSteamWorkshopItem, main as syncMain, REAL_SYNC_AUTHORIZATION } from '../scripts/sync-workshop.ts';
import { rebuildCatalog } from '../scripts/rebuild-catalog.ts';
import { createCatalogShards, writeCatalogShardsSync } from '../src/utils/catalogSharder.ts';

const fixture = (id = '100', extra = {}) => ({
  ...normalizeSteamWorkshopItem({ publishedfileid: id, title: 'Paisagem', tags: [{ tag: 'Everyone' }], time_created: 1700000000 }), ...extra,
});
function setup(items, blocked = []) {
  const root = mkdtempSync(join(tmpdir(), 'wg-nsfw-audit-'));
  const catalogPath = join(root, 'catalog.json');
  const blacklistPath = join(root, 'blocked.json');
  writeFileSync(catalogPath, JSON.stringify(items));
  writeFileSync(blacklistPath, JSON.stringify({ blockedIds: blocked }));
  return { root, catalogPath, blacklistPath, backupDir: join(root, 'backups'), quarantinePath: join(root, 'quarantine.json') };
}
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const status = (text, field = 'title') => moderateMetadata(fixture('100', { [field]: field === 'tags' ? [text] : text })).status;

test('NSFW auditoria: ratings, campos, case, NFKD e franquias legítimas usam o moderador de produção', () => {
  for (const rating of ['Mature', 'Questionable', ' MATURE ', 'qUeStIoNaBlE']) assert.equal(moderateMetadata(fixture('100', { rating })).status, 'blocked');
  for (const term of ['hentai', 'PoRn', 'NSFW', 'héntai', 'ｈｅｎｔａｉ']) {
    for (const field of ['title', 'description', 'tags']) assert.equal(status(term, field), 'blocked', `${field}:${term}`);
  }
  for (const title of ['Anime girl', 'D.Va Overwatch', 'Genshin Impact Raiden Shogun', 'Honkai Star Rail Kafka', 'NieR Automata 2B', 'Final Fantasy Tifa', 'Cyberpunk 2077', 'Nissan Skyline R34']) assert.equal(status(title), 'safe', title);
});

test('LACUNA NSFW: Rule 34 em quatro grafias passa em todos os campos', () => {
  for (const term of ['rule34', 'rule 34', 'rule-34', 'r34', 'RULE34', 'ｒｕｌｅ３４']) {
    for (const field of ['title', 'description', 'tags']) assert.equal(status(term, field), 'safe', `${field}:${term}`);
  }
});

test('LACUNA NSFW: termos explícitos, separadores e Unicode escapam; XXX difere por campo', () => {
  for (const term of ['nude', 'naked', 'pornography', 'nudez', 'sexo explícito', '18+', 'r 18', 'r_18', 'r—18', 'art_nsfw', 'hen\u200btai', '無修正', '야동']) assert.equal(status(term), 'safe', term);
  assert.equal(status('xxx'), 'blocked');
  assert.equal(status('xxx', 'tags'), 'safe');
  assert.equal(status('ｴﾛ'), 'safe'); // normalização asiática não é aplicada ao matcher asiático
  assert.equal(status('エロ'), 'blocked');
});

test('LACUNA NSFW: negação e ideograma ambíguo geram falsos positivos; exceção XXX vale pelo texto inteiro', () => {
  assert.equal(status('No NSFW content'), 'blocked');
  assert.equal(status('成人の日 landscape'), 'blocked');
  assert.equal(status('XXX wallpaper. Exemplo -XXX- de nome de arquivo.'), 'safe');
});

test('LACUNA NSFW: normalização Steam converte tag de rating ausente/desconhecida em Everyone', () => {
  assert.equal(moderateMetadata(fixture('100', { rating: undefined })).status, 'blocked');
  for (const tags of [[], [{ tag: 'Unrated' }], [{ tag: ' Mature ' }]]) {
    const item = normalizeSteamWorkshopItem({ publishedfileid: '100', title: 'Paisagem', tags });
    assert.equal(item.rating, 'Everyone');
    assert.equal(moderateMetadata(item).status, 'safe');
  }
  const item = normalizeSteamWorkshopItem({ publishedfileid: '100', title: 'Paisagem', file_description: 'hentai', tags: [{ tag: 'Everyone' }] });
  assert.equal(moderateMetadata(item).reasons[0].triggerField, 'description');
});

test('NSFW auditoria: blacklist rejeita JSON inválido, duplicatas e números; preserva string uint64', () => {
  const paths = setup([]);
  writeFileSync(paths.blacklistPath, '{invalid');
  assert.throws(() => loadManualBlacklist(paths.blacklistPath), /JSON/);
  assert.throws(() => validateManualBlacklist({ blockedIds: ['100', ' 100 '] }), /duplicados/);
  assert.throws(() => validateManualBlacklist({ blockedIds: [100] }), /string/);
  const pipeline = new ModerationPipeline({ manualBlacklist: validateManualBlacklist({ blockedIds: ['18446744073709551615'] }) });
  assert.equal(pipeline.evaluateItem(fixture('18446744073709551615')).reasons[0].category, 'manual_blacklist');
});

test('LACUNA NSFW: IDs não numéricos são aceitos; blacklist ausente desabilita bloqueio silenciosamente', () => {
  assert.ok(validateManualBlacklist({ blockedIds: ['abc', '-1', '1e6', '0', '18446744073709551616'] }).has('abc'));
  assert.equal(moderateMetadata(fixture('abc')).status, 'safe');
  assert.equal(loadManualBlacklist(join(mkdtempSync(join(tmpdir(), 'wg-nsfw-missing-')), 'missing.json')).size, 0);
});

test('NSFW auditoria: rebuild remove item já publicado de todos os JSONs e shard obsoleto, preserva backup exato', async () => {
  const items = Array.from({ length: 25 }, (_, i) => fixture(String(100 + i)));
  const blocked = items.slice(1).map(item => item.id);
  const paths = setup(items, blocked);
  const before = readFileSync(paths.catalogPath, 'utf8');
  writeCatalogShardsSync(join(paths.root, 'catalog'), createCatalogShards(items));
  assert.equal(readdirSync(join(paths.root, 'catalog/pages')).length, 2);
  const result = await rebuildCatalog(paths);
  assert.equal(readFileSync(result.backupPath, 'utf8'), before);
  assert.deepEqual(read(paths.catalogPath), JSON.parse(JSON.stringify([items[0]])));
  assert.deepEqual(readdirSync(join(paths.root, 'catalog/pages')), ['000001.json']);
  const manifest = read(join(paths.root, 'catalog/manifest.json'));
  assert.equal(manifest.totalItems, 1);
  assert.equal(manifest.totalPages, 1);
  assert.deepEqual(Object.keys(manifest.itemToPage), ['100']);
  assert.deepEqual(read(join(paths.root, 'catalog/index.json')).map(item => item.id), ['100']);
  assert.deepEqual(read(join(paths.root, 'catalog/pages/000001.json')), JSON.parse(JSON.stringify([items[0]])));
  assert.equal(read(paths.quarantinePath).summary.blockedByBlacklist, 24);
});

test('LACUNA NSFW: falha no lock dos shards deixa catálogo novo e shards antigos com item bloqueado', async () => {
  const paths = setup([fixture('100'), fixture('200')], ['200']);
  writeCatalogShardsSync(join(paths.root, 'catalog'), createCatalogShards(read(paths.catalogPath)));
  writeFileSync(join(paths.root, 'catalog.lock'), 'fixture');
  await assert.rejects(rebuildCatalog(paths), /EEXIST/);
  assert.deepEqual(read(paths.catalogPath).map(item => item.id), ['100']);
  assert.equal(read(join(paths.root, 'catalog/manifest.json')).totalItems, 2);
  assert.ok(read(join(paths.root, 'catalog/pages/000001.json')).some(item => item.id === '200'));
  assert.equal(readdirSync(paths.backupDir).length, 1);
});

test('LACUNA NSFW: rebuild mantém simulado e altera consolidado antes da validação final falhar', async () => {
  const paths = setup([fixture('100'), fixture('200', { isSimulated: true })]);
  await assert.rejects(rebuildCatalog(paths), /simulado/);
  assert.ok(read(paths.catalogPath).some(item => item.isSimulated));
  assert.equal(existsSync(join(paths.root, 'catalog/manifest.json')), false);
});

test('LACUNA NSFW: sync JSON com transporte fake preserva ID antigo bloqueado e descarta somente novo bloqueado', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wg-nsfw-sync-'));
  mkdirSync(join(root, 'config'), { recursive: true });
  mkdirSync(join(root, 'public/data'), { recursive: true });
  writeFileSync(join(root, 'config/blocked-wallpapers.json'), JSON.stringify({ blockedIds: ['100', '300'] }));
  writeFileSync(join(root, 'public/data/catalog.json'), JSON.stringify([fixture('100')]));
  const previous = { cwd: process.cwd(), argv: process.argv, fetch: globalThis.fetch, key: process.env.STEAM_API_KEY, auth: process.env.WALLPAPER_SYNC_AUTHORIZATION };
  let requests = 0;
  try {
    process.chdir(root);
    process.argv = [process.execPath, 'audit-offline', '--authorize-real-sync', '--mode=popular'];
    process.env.STEAM_API_KEY = 'offline-fixture';
    process.env.WALLPAPER_SYNC_AUTHORIZATION = REAL_SYNC_AUTHORIZATION;
    globalThis.fetch = async () => {
      requests++;
      return Response.json({ response: { publishedfiledetails: ['200', '300'].map(id => ({ publishedfileid: id, title: 'Paisagem', tags: [{ tag: 'Everyone' }] })) } });
    };
    await syncMain();
    assert.equal(requests, 1);
    assert.deepEqual(read(join(root, 'public/data/catalog.json')).map(item => item.id), ['100', '200']);
    assert.ok(read(join(root, 'public/data/catalog/manifest.json')).itemToPage['100']);
  } finally {
    process.chdir(previous.cwd); process.argv = previous.argv; globalThis.fetch = previous.fetch;
    for (const [key, value] of [['STEAM_API_KEY', previous.key], ['WALLPAPER_SYNC_AUTHORIZATION', previous.auth]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('LACUNA NSFW: falha ao mover página ocorre depois da troca de manifesto e índice', () => {
  const paths = setup([]);
  const shardedDir = join(paths.root, 'catalog');
  const oldItems = Array.from({ length: 25 }, (_, i) => fixture(String(100 + i)));
  writeCatalogShardsSync(shardedDir, createCatalogShards(oldItems));
  // Conflito de destino controlado no fixture, sem mocks do escritor de produção.
  // A página 2 antiga continua sendo um arquivo JSON acessível.
  const next = createCatalogShards([fixture('100')]);
  unlinkSync(join(shardedDir, 'pages/000001.json'));
  mkdirSync(join(shardedDir, 'pages/000001.json'));
  assert.throws(() => writeCatalogShardsSync(shardedDir, next));
  assert.equal(read(join(shardedDir, 'manifest.json')).totalItems, 1);
  assert.equal(read(join(shardedDir, 'index.json')).length, 1);
  assert.equal(read(join(shardedDir, 'pages/000002.json')).length, 1);
  assert.ok(existsSync(join(shardedDir, 'pages/000002.json')));
});

test('NSFW auditoria: rebuild com blacklist inválida aborta e preserva publicações anteriores', async () => {
  const paths = setup([fixture('100')]);
  const shardedDir = join(paths.root, 'catalog');
  writeCatalogShardsSync(shardedDir, createCatalogShards(read(paths.catalogPath)));
  const beforeCatalog = readFileSync(paths.catalogPath, 'utf8');
  const beforeManifest = readFileSync(join(shardedDir, 'manifest.json'), 'utf8');
  writeFileSync(paths.blacklistPath, '{invalid');
  await assert.rejects(rebuildCatalog(paths), /JSON/);
  assert.equal(readFileSync(paths.catalogPath, 'utf8'), beforeCatalog);
  assert.equal(readFileSync(join(shardedDir, 'manifest.json'), 'utf8'), beforeManifest);
});
