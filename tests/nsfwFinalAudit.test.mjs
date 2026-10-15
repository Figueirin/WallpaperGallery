// Escopo fechado: R-02, R-04 e R-05. Não altera os testes existentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { main as syncMain, normalizeSteamWorkshopItem, REAL_SYNC_AUTHORIZATION } from '../scripts/sync-workshop.ts';
import { createCatalogShards, writeCatalogShardsSync } from '../src/utils/catalogSharder.ts';
import { moderateMetadata } from '../src/services/moderation/metadataModerator.ts';

const fixture = id => normalizeSteamWorkshopItem({ publishedfileid: String(id), title: 'Paisagem', tags: [{ tag: 'Everyone' }] });
const dataset = count => Array.from({ length: count }, (_, i) => fixture(100 + i));
function setup(items) {
  const root = fs.mkdtempSync(join(tmpdir(), 'wg-final-audit-'));
  const pub = join(root, 'public/data'); fs.mkdirSync(pub, { recursive: true });
  fs.mkdirSync(join(root, 'config'));
  fs.writeFileSync(join(root, 'config/blocked-wallpapers.json'), '{"blockedIds":[]}');
  const catalogPath = join(pub, 'catalog.json'), dir = join(pub, 'catalog');
  if (items !== null) {
    fs.writeFileSync(catalogPath, '\t' + JSON.stringify(items, null, '\t').replace(/\n/g, '\r\n') + '\r\n');
    writeCatalogShardsSync(dir, createCatalogShards(items));
  }
  return { root, pub, catalogPath, dir };
}
function hashes(root) {
  const result = {};
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.json')) result[relative(root, path)] = createHash('sha256').update(fs.readFileSync(path)).digest('hex');
    }
  };
  if (fs.existsSync(root)) visit(root);
  return result;
}
async function hook(method, callback, operation) {
  const original = fs[method]; fs[method] = (...args) => callback(original, ...args); syncBuiltinESMExports();
  try { return await operation(); }
  finally { fs[method] = original; syncBuiltinESMExports(); }
}
async function syncOffline(paths, operation) {
  const previous = { cwd: process.cwd(), argv: process.argv, fetch: globalThis.fetch, key: process.env.STEAM_API_KEY, auth: process.env.WALLPAPER_SYNC_AUTHORIZATION };
  try {
    process.chdir(paths.root); process.argv = [process.execPath, 'final-audit-offline', '--authorize-real-sync', '--mode=popular'];
    process.env.STEAM_API_KEY = 'offline-fixture'; process.env.WALLPAPER_SYNC_AUTHORIZATION = REAL_SYNC_AUTHORIZATION;
    globalThis.fetch = async () => Response.json({ response: { publishedfiledetails: [{ publishedfileid: '900', title: 'Novo', tags: [{ tag: 'Everyone' }] }] } });
    return await operation(() => syncMain());
  } finally {
    process.chdir(previous.cwd); process.argv = previous.argv; globalThis.fetch = previous.fetch;
    for (const [key, value] of [['STEAM_API_KEY', previous.key], ['WALLPAPER_SYNC_AUTHORIZATION', previous.auth]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

for (const [name, items] of [['preenchido', dataset(2)], ['vazio', []], ['inexistente', null]]) {
  test(`final R02: rollback do catálogo ${name} preserva inventário e bytes originais`, async () => {
    const paths = setup(items), before = hashes(paths.pub);
    const originalBytes = fs.existsSync(paths.catalogPath) ? fs.readFileSync(paths.catalogPath) : null;
    let hit = false;
    await syncOffline(paths, run => hook('renameSync', (original, src, dest, ...rest) => {
      if (!hit && String(src).includes('.catalog_tmp_') && dest === join(paths.dir, 'index.json')) {
        hit = true; throw new Error('FINAL promotion');
      }
      return original(src, dest, ...rest);
    }, async () => { await assert.rejects(run(), /FINAL promotion/); }));
    assert.ok(hit);
    assert.deepEqual(hashes(paths.pub), before);
    if (originalBytes !== null) assert.deepEqual(fs.readFileSync(paths.catalogPath), originalBytes);
    else assert.equal(fs.existsSync(paths.catalogPath), false);
    assert.equal(fs.existsSync(`${paths.catalogPath}.lock`), false);
    assert.equal(fs.existsSync(`${paths.dir}.lock`), false);
  });
}

for (const file of ['manifest.json', 'index.json', 'pages/000001.json']) {
  test(`final R04: falha no backup de ${file} não permite promoção`, async () => {
    const paths = setup(dataset(25)), before = hashes(paths.pub);
    let hit = false, promotions = 0;
    await hook('copyFileSync', (original, src, dest, ...rest) => {
      if (!hit && src === join(paths.dir, file) && String(dest).includes('.catalog_rollback_')) {
        hit = true; throw new Error('FINAL backup');
      }
      return original(src, dest, ...rest);
    }, async () => {
      await hook('renameSync', (original, src, ...args) => {
        if (String(src).includes('.catalog_tmp_')) promotions++;
        return original(src, ...args);
      }, async () => { assert.throws(() => writeCatalogShardsSync(paths.dir, createCatalogShards([fixture('900')])), /FINAL backup/); });
    });
    assert.ok(hit); assert.equal(promotions, 0);
    assert.deepEqual(hashes(paths.pub), before);
  });
}

test('final R04: falha na recuperação preserva todos os arquivos do rollback para resgate', async () => {
  const paths = setup(dataset(25)), originalShardHashes = hashes(paths.dir);
  let promotionFailed = false, recoveryFailed = false;
  await hook('renameSync', (original, src, dest, ...rest) => {
    if (!promotionFailed && String(src).includes('.catalog_tmp_') && dest === join(paths.dir, 'index.json')) {
      promotionFailed = true; throw new Error('FINAL promotion');
    }
    return original(src, dest, ...rest);
  }, async () => {
    await hook('copyFileSync', (original, src, dest, ...rest) => {
      if (!recoveryFailed && String(src).includes('.catalog_rollback_') && dest === join(paths.dir, 'manifest.json')) {
        recoveryFailed = true; throw new Error('FINAL recovery');
      }
      return original(src, dest, ...rest);
    }, async () => { assert.throws(() => writeCatalogShardsSync(paths.dir, createCatalogShards([fixture('900')])), /FINAL promotion/); });
  });
  assert.ok(promotionFailed && recoveryFailed);
  const rollbackDirs = fs.readdirSync(paths.pub).filter(name => name.startsWith('.catalog_rollback_'));
  const candidates = rollbackDirs.map(name => join(paths.pub, name));
  const rollback = candidates.find(path => JSON.stringify(hashes(path)) === JSON.stringify(originalShardHashes));
  assert.ok(rollback, 'Backup completo da geração anterior deve permanecer disponível');
  assert.deepEqual(hashes(rollback), originalShardHashes);
  assert.equal(fs.existsSync(`${paths.dir}.lock`), false);
  // Resgate manual exclusivamente no fixture demonstra que o material preservado é suficiente.
  for (const file of Object.keys(originalShardHashes)) fs.copyFileSync(join(rollback, file), join(paths.dir, file));
  assert.deepEqual(hashes(paths.dir), originalShardHashes);
});

test('final R05: exemplos locais permitidos e XXX independente bloqueado nos três campos', () => {
  for (const field of ['title', 'description', 'tags']) {
    for (const text of ['夜莺Night——XXX', '-XXX-', '例如：arquivoXXX']) {
      const item = { ...fixture('100'), [field]: field === 'tags' ? [text] : text };
      assert.equal(moderateMetadata(item).status, 'safe', `${field}:${text}`);
    }
    for (const text of ['例如：夜莺——XXX。 XXX wallpaper', '例如：arquivoXXX。 XXX', 'XXX wallpaper. Exemplo -XXX-']) {
      const item = { ...fixture('100'), [field]: field === 'tags' ? [text] : text };
      assert.equal(moderateMetadata(item).status, 'blocked', `${field}:${text}`);
    }
  }
});
