// Segunda auditoria: expectativas de recuperação desejada. Falhas demonstram
// problemas pendentes; não converter as expectativas para aceitar corrupção.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createCatalogShards, writeCatalogShardsSync } from '../src/utils/catalogSharder.ts';
import { normalizeSteamWorkshopItem, normalizeRating, main as syncMain, REAL_SYNC_AUTHORIZATION } from '../scripts/sync-workshop.ts';
import { rebuildCatalog } from '../scripts/rebuild-catalog.ts';
import { moderateMetadata } from '../src/services/moderation/metadataModerator.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
import { StaticCatalogProvider } from '../src/services/staticCatalogProvider.ts';

const fixture = (id, extra = {}) => ({ ...normalizeSteamWorkshopItem({ publishedfileid: String(id), title: 'Paisagem', tags: [{ tag: 'Everyone' }] }), ...extra });
const dataset = (count, offset = 100) => Array.from({ length: count }, (_, i) => fixture(offset + i));
const parse = path => JSON.parse(fs.readFileSync(path, 'utf8'));
function setup(items = dataset(26)) {
  const root = fs.mkdtempSync(join(tmpdir(), 'wg-nsfw-reaudit-'));
  const pub = join(root, 'public/data'); fs.mkdirSync(pub, { recursive: true });
  const catalogPath = join(pub, 'catalog.json'), dir = join(pub, 'catalog');
  const blacklistPath = join(root, 'config/blocked-wallpapers.json'); fs.mkdirSync(join(root, 'config'));
  fs.writeFileSync(blacklistPath, JSON.stringify({ blockedIds: [] }));
  fs.writeFileSync(catalogPath, JSON.stringify(items));
  writeCatalogShardsSync(dir, createCatalogShards(items));
  return { root, pub, catalogPath, dir, blacklistPath, backupDir: join(root, 'backups'), quarantinePath: join(root, 'quarantine.json') };
}
function snapshot(root) {
  const result = {};
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.json')) {
        const bytes = fs.readFileSync(path);
        result[relative(root, path)] = { hash: createHash('sha256').update(bytes).digest('hex'), content: bytes.toString('utf8') };
      }
    }
  }
  if (fs.existsSync(root)) visit(root);
  return result;
}
function assertSnapshot(root, before) {
  const after = snapshot(root);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'Mesmo conjunto de arquivos JSON após rollback');
  for (const path of Object.keys(before)) assert.equal(after[path].hash, before[path].hash, `Hash divergente: ${path}`);
}
async function hook(method, callback, operation) {
  const original = fs[method];
  fs[method] = (...args) => callback(original, ...args);
  syncBuiltinESMExports();
  try { return await operation(); }
  finally { fs[method] = original; syncBuiltinESMExports(); }
}
function transientFault(method, match, operation) {
  let hit = false;
  return hook(method, (original, ...args) => {
    if (!hit && match(...args)) { hit = true; const error = new Error(`REAUDIT transient ${method}`); error.code = 'EIO'; throw error; }
    return original(...args);
  }, async () => { try { return await operation(); } finally { assert.ok(hit, 'Falha precisa ser exercitada'); } });
}
async function readUsingProvider(paths) {
  const provider = new StaticCatalogProvider({ baseUrl: 'https://offline.invalid/', fetchImpl: async url => {
    const name = new URL(String(url)).pathname.replace(/^\//, '');
    try { return Response.json(parse(join(paths.root, 'public', name))); }
    catch { return new Response('', { status: 404 }); }
  } });
  return provider.getWallpapers({ pageSize: 100 });
}
async function runSync(paths, raw, operation = fn => fn()) {
  const before = { cwd: process.cwd(), argv: process.argv, fetch: globalThis.fetch, key: process.env.STEAM_API_KEY, auth: process.env.WALLPAPER_SYNC_AUTHORIZATION };
  try {
    process.chdir(paths.root); process.argv = [process.execPath, 'offline-reaudit', '--authorize-real-sync', '--mode=popular'];
    process.env.STEAM_API_KEY = 'fake-offline-key'; process.env.WALLPAPER_SYNC_AUTHORIZATION = REAL_SYNC_AUTHORIZATION;
    globalThis.fetch = async () => Response.json({ response: { publishedfiledetails: raw } });
    return await operation(() => syncMain());
  } finally {
    process.chdir(before.cwd); process.argv = before.argv; globalThis.fetch = before.fetch;
    for (const [key, value] of [['STEAM_API_KEY', before.key], ['WALLPAPER_SYNC_AUTHORIZATION', before.auth]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
const incoming = [{ publishedfileid: '900', title: 'Novo', tags: [{ tag: 'Everyone' }] }];

test('reaudit política: Unrated/ausente permitido; rating restritivo, texto e blacklist prevalecem', () => {
  for (const rating of [undefined, 'Unrated', 'Everyone']) {
    assert.equal(moderateMetadata(fixture('100', { rating })).status, 'safe');
    assert.equal(moderateMetadata(fixture('100', { rating, title: '18+' })).status, 'blocked');
    const pipeline = new ModerationPipeline({ manualBlacklist: new Set(['100']) });
    assert.equal(pipeline.evaluateItem(fixture('100', { rating })).status, 'blocked');
  }
  for (const tags of [['Everyone', 'Unrated', 'Questionable'], ['Mature', 'Everyone'], ['Questionable', 'Everyone', 'Mature']]) {
    const rating = normalizeRating(tags);
    assert.equal(rating, tags.includes('Mature') ? 'Mature' : 'Questionable');
    assert.equal(moderateMetadata(fixture('100', { rating })).status, 'blocked');
  }
});

test('reaudit texto: padrões adultos nos três campos e exceção Skyline sem liberar rule34', () => {
  for (const marker of ['rule34', 'rule 34', 'rule-34', 'r34', '18+', 'nude', 'naked', 'nudez', 'sexo explícito', 'xxx', 'ｒｕｌｅ３４']) {
    for (const field of ['title', 'description', 'tags']) {
      assert.equal(moderateMetadata(fixture('100', { [field]: field === 'tags' ? [marker] : marker })).status, 'blocked', `${field}:${marker}`);
    }
  }
  assert.equal(moderateMetadata(fixture('100', { title: 'Nissan Skyline R34' })).status, 'safe');
  assert.equal(moderateMetadata(fixture('100', { title: 'Nissan Skyline R34 rule34' })).status, 'blocked');
});

for (const name of ['index.json', 'pages/000001.json', 'pages/000002.json']) {
  test(`reaudit rollback: falha transitória promovendo ${name} restaura hashes e provider`, async () => {
    const paths = setup(); const before = snapshot(paths.pub);
    await transientFault('renameSync', (src, dest) => String(src).includes('.catalog_tmp_') && dest === join(paths.dir, name), async () => {
      assert.throws(() => writeCatalogShardsSync(paths.dir, createCatalogShards(dataset(26, 500))), /REAUDIT/);
    });
    assertSnapshot(paths.pub, before);
    assert.equal((await readUsingProvider(paths)).total, 26);

  });
}

test('reaudit rollback: falha no staging não modifica geração anterior', async () => {
  const paths = setup(); const before = snapshot(paths.pub);
  await transientFault('writeFileSync', path => String(path).includes('.catalog_tmp_') && String(path).endsWith('index.json'), async () => {
    assert.throws(() => writeCatalogShardsSync(paths.dir, createCatalogShards(dataset(2, 500))), /REAUDIT/);
  });
  assertSnapshot(paths.pub, before);
});

test('reaudit rollback: falha de limpeza de shard obsoleto restaura geração anterior', async () => {
  const paths = setup(); const before = snapshot(paths.pub);
  await transientFault('unlinkSync', path => path === join(paths.dir, 'pages/000002.json'), async () => {
    assert.throws(() => writeCatalogShardsSync(paths.dir, createCatalogShards(dataset(1, 500))), /REAUDIT/);
  });
  assertSnapshot(paths.pub, before);
});

test('reaudit N05: expansão com falha não deve deixar páginas novas após rollback', async () => {
  const paths = setup(dataset(1)); const before = snapshot(paths.pub);
  await transientFault('renameSync', (src, dest) => String(src).includes('.catalog_tmp_') && dest === join(paths.dir, 'pages/000003.json'), async () => {
    assert.throws(() => writeCatalogShardsSync(paths.dir, createCatalogShards(dataset(51, 500))), /REAUDIT/);

  });
  assertSnapshot(paths.pub, before);
});

test('reaudit N05: falha de backup de página deve abortar antes da promoção e preservar provider', async () => {
  const paths = setup(); const before = snapshot(paths.pub);
  await hook('copyFileSync', (original, src, dest, ...rest) => {
    if (src === join(paths.dir, 'pages/000001.json') && String(dest).includes('.catalog_rollback_')) throw new Error('REAUDIT backup');
    return original(src, dest, ...rest);
  }, async () => {
    let hit = false;
    await hook('renameSync', (original, src, dest, ...rest) => {
      if (!hit && String(src).includes('.catalog_tmp_') && dest === join(paths.dir, 'pages/000002.json')) { hit = true; throw new Error('REAUDIT promotion'); }
      return original(src, dest, ...rest);
    }, async () => { assert.throws(() => writeCatalogShardsSync(paths.dir, createCatalogShards(dataset(26, 500))), /REAUDIT/); });
  });
  const result = await readUsingProvider(paths);
  assert.deepEqual(result.items.map(item => item.id), dataset(26).map(item => item.id), 'Provider deve continuar retornando os IDs da geração anterior');
  assertSnapshot(paths.pub, before);
});

test('reaudit rebuild: falha transitória em página restaura consolidado e shards e preserva backup', async () => {
  const paths = setup(); const before = snapshot(paths.pub);
  fs.writeFileSync(paths.blacklistPath, JSON.stringify({ blockedIds: ['100'] }));
  await transientFault('renameSync', (src, dest) => String(src).includes('.catalog_tmp_') && dest === join(paths.dir, 'pages/000001.json'), async () => {
    await assert.rejects(rebuildCatalog(paths), /REAUDIT/);
  });
  assertSnapshot(paths.pub, before);
  assert.equal(fs.readdirSync(paths.backupDir).length, 1);
  assert.equal(fs.readFileSync(join(paths.backupDir, fs.readdirSync(paths.backupDir)[0]), 'utf8'), before['catalog.json'].content);
  assert.equal((await readUsingProvider(paths)).total, 26);

});

test('reaudit N05: sync com catálogo vazio deve restaurar vazio se falhar promoção dos shards', async () => {
  const paths = setup([]); const before = snapshot(paths.pub);
  await runSync(paths, incoming, fn => transientFault('renameSync', (src, dest) => String(src).includes('.catalog_tmp_') && dest === join(paths.dir, 'index.json'), async () => {
    await assert.rejects(fn(), /REAUDIT/);
  }));
  assertSnapshot(paths.pub, before);
});

test('reaudit N05: sync não deve desfazer rebuild concluído entre leitura e aquisição do lock', async () => {
  const paths = setup(dataset(1));
  fs.writeFileSync(paths.blacklistPath, JSON.stringify({ blockedIds: ['100'] }));
  let competed = false, competitor, afterCompetitor;
  await runSync(paths, incoming, fn => hook('openSync', (original, path, ...rest) => {
    if (!competed && path === `${paths.catalogPath}.lock`) {
      competed = true;
      // rebuildCatalog executa seu corpo síncrono antes de resolver a Promise.
      competitor = rebuildCatalog(paths);
      afterCompetitor = snapshot(paths.pub);
    }
    return original(path, ...rest);
  }, async () => { await assert.rejects(fn(), /alterado por outro processo/); }));
  await competitor;
  assert.ok(competed);
  assertSnapshot(paths.pub, afterCompetitor);
});

test('reaudit N09: placeholder chinês não deve esconder outra ocorrência XXX', () => {
  assert.equal(moderateMetadata(fixture('100', { title: '例如：夜莺——XXX。 XXX wallpaper' })).status, 'blocked');
});
