import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  moderateMetadata,
  ALLOWED_AMBIGUOUS_TERMS,
} from '../src/services/moderation/metadataModerator.ts';
import {
  VisualModerator,
  evaluateSkinToneHeuristic,
  detectImageMagicBytes,
} from '../src/services/moderation/visualModerator.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
import { rebuildCatalog } from '../scripts/rebuild-catalog.ts';

// Helper para criar buffer de imagem PNG válido
function createMinimalPng(options = {}) {
  const { skinPixels = 0, totalPixels = 100 } = options;
  // Assinatura PNG de 8 bytes
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: 10x10 pixels, RGBA (colorType 6)
  const width = 10;
  const height = 10;
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type 6: RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from('IHDR', 'ascii'),
    ihdrData,
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // CRC dummy
  ]);

  // IDAT chunk vazio ou com dados mínimos
  const idat = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('IDAT', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);

  // IEND chunk
  const iend = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('IEND', 'ascii'),
    Buffer.from([0xae, 0x42, 0x60, 0x82]),
  ]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

describe('Moderação de Conteúdo e NSFW (Content Moderation)', () => {
  describe('Moderação de Metadados: Indicadores Adultos da Steam', () => {
    it('deve bloquear imediatamente wallpaper com rating Mature da Steam', () => {
      const item = {
        id: '1001',
        title: 'Cyberpunk Neon Alley',
        description: 'Cenário cyberpunk urbano',
        tags: ['Cyberpunk', 'City'],
        rating: 'Mature',
      };
      const decision = moderateMetadata(item);
      assert.equal(decision.status, 'blocked');
      assert.ok(decision.reasons.some((r) => r.category === 'steam_rating'));
      assert.ok(decision.reasons.some((r) => r.matchedTerm === 'Mature'));
    });

    it('deve bloquear wallpaper com rating Questionable da Steam', () => {
      const item = {
        id: '1002',
        title: 'Fantasy Sorceress',
        description: 'Personagem mágica',
        tags: ['Fantasy'],
        rating: 'Questionable',
      };
      const decision = moderateMetadata(item);
      assert.equal(decision.status, 'blocked');
      assert.ok(decision.reasons.some((r) => r.category === 'steam_rating'));
      assert.ok(decision.reasons.some((r) => r.matchedTerm === 'Questionable'));
    });

    it('deve bloquear se a tag Mature ou Questionable estiver presente nas tags', () => {
      const item = {
        id: '1003',
        title: 'Anime Girl Sunset',
        description: 'Paisagem com garota no entardecer',
        tags: ['Anime', 'Mature', 'Sunset'],
        rating: 'Everyone',
      };
      const decision = moderateMetadata(item);
      assert.equal(decision.status, 'blocked');
      assert.ok(decision.metadataMatches.some((m) => m.includes('Mature')));
    });
  });

  describe('Moderação de Metadados: Palavras-chave NSFW no Título, Descrição e Tags', () => {
    it('deve bloquear termos explicitamente NSFW no título', () => {
      const testCases = [
        'D.Va 18+ NSFW Wallpaper',
        'Anime Hentai Scene 4K',
        'R-18 Illustration Collection',
        'Ecchi Room Loop',
        'Lewd waifu animated',
        'Pure Uncensored Nudity',
      ];

      for (const title of testCases) {
        const decision = moderateMetadata({
          id: '2001',
          title,
          description: 'Wallpaper de alta qualidade',
          tags: ['Anime'],
          rating: 'Everyone',
        });
        assert.equal(decision.status, 'blocked', `Título "${title}" deveria ter sido bloqueado`);
        assert.ok(decision.reasons.some((r) => r.category === 'metadata_keyword'));
      }
    });

    it('deve bloquear termos NSFW em ideogramas orientais no título ou descrição', () => {
      const testCases = [
        { title: '无修 4K 动态壁纸', desc: 'Anime wallpaper' },
        { title: 'Cyberpunk City', desc: '18禁 成人向けコンテンツ' },
        { title: 'Fantasy World', desc: '露点福利姬' },
      ];

      for (const tc of testCases) {
        const decision = moderateMetadata({
          id: '2002',
          title: tc.title,
          description: tc.desc,
          tags: ['Anime'],
          rating: 'Everyone',
        });
        assert.equal(decision.status, 'blocked');
        assert.ok(decision.reasons.some((r) => r.category === 'metadata_keyword'));
      }
    });

    it('deve bloquear se tags temáticas contiverem termos adultos restritos', () => {
      const decision = moderateMetadata({
        id: '2003',
        title: 'Cottontail Art',
        description: 'Belo cenário artístico',
        tags: ['Wallpaper', 'Hentai', 'CGI'],
        rating: 'Everyone',
      });
      assert.equal(decision.status, 'blocked');
      assert.ok(decision.reasons.some((r) => r.triggerField === 'tags'));
    });
  });

  describe('Moderação de Metadados: Termos Permitidos e Falsos Positivos Óbvios', () => {
    it('não deve bloquear termos genéricos legítimos como anime, girl, romance, art', () => {
      for (const term of ALLOWED_AMBIGUOUS_TERMS) {
        const decision = moderateMetadata({
          id: '3001',
          title: `Beautiful ${term} in autumn scenery 4K`,
          description: `This is a high quality ${term} artwork for desktop customization.`,
          tags: [term, 'Wallpaper', 'Relaxing'],
          rating: 'Everyone',
        });
        assert.equal(
          decision.status,
          'safe',
          `Termo permitido "${term}" foi incorretamente bloqueado!`
        );
        assert.equal(decision.reasons.length, 0);
      }
    });

    it('não deve disparar em palavras legítimas que contêm substrings coincidentes', () => {
      const legitimateCases = [
        'Classic Retrowave Drive', // contém "ass"
        'Passionate Piano Symphony', // contém "ass"
        'Documentary Nature Loop', // contém "cum"
        'Circumstellar Dust Spectrum', // contém "cum"
        'Titanium Spaceship Orbit', // contém "tit"
      ];

      for (const title of legitimateCases) {
        const decision = moderateMetadata({
          id: '3002',
          title,
          description: 'A soothing and elegant wallpaper for linux desktop.',
          tags: ['Music', 'Space', 'Technology'],
          rating: 'Everyone',
        });
        assert.equal(decision.status, 'safe', `Título legítimo "${title}" foi bloqueado!`);
      }
    });

    it('deve aceitar placeholders estruturais chineses com XXX na descrição', () => {
      const decision = moderateMetadata({
        id: '3003',
        title: 'Elaina Window View',
        description: '请务必注意命名格式：如将mpkg命名为例如：夜莺Night——XXX。有条件可以单独开分区。',
        tags: ['Anime', 'Landscape'],
        rating: 'Everyone',
      });
      assert.equal(decision.status, 'safe');
    });
  });

  describe('Moderação Visual: Classificação de Imagens e Download Seguro', () => {
    it('deve validar magic bytes de JPEG, PNG e WebP e rejeitar desconhecidos', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const webpBuffer = Buffer.from('RIFF1234WEBPtest', 'ascii');
      const textBuffer = Buffer.from('<!DOCTYPE html><html>', 'ascii');

      assert.equal(detectImageMagicBytes(pngBuffer), 'png');
      assert.equal(detectImageMagicBytes(jpegBuffer), 'jpeg');
      assert.equal(detectImageMagicBytes(webpBuffer), 'webp');
      assert.equal(detectImageMagicBytes(textBuffer), 'unknown');
    });

    it('deve classificar como blocked quando classificador acusar probabilidade NSFW alta', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'wg-mod-'));
      const moderator = new VisualModerator({
        cacheFilePath: join(tmpDir, 'cache.json'),
        customClassifier: async () => ({
          safe: 0.10,
          nsfw: 0.90,
          uncertainty: 0.10,
        }),
      });

      const buffer = createMinimalPng();
      const result = await moderator.classifyBuffer(buffer, 'test-item-nsfw');

      assert.equal(result.status, 'blocked');
      assert.ok(result.reasons.some((r) => r.category === 'visual_analysis'));
    });

    it('deve classificar como review quando classificação for incerta ou limítrofe', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'wg-mod-'));
      const moderator = new VisualModerator({
        cacheFilePath: join(tmpDir, 'cache.json'),
        customClassifier: async () => ({
          safe: 0.40,
          nsfw: 0.45,
          uncertainty: 0.60,
        }),
      });

      const buffer = createMinimalPng();
      const result = await moderator.classifyBuffer(buffer, 'test-item-uncertain');

      assert.equal(result.status, 'review');
      assert.ok(result.reasons.some((r) => r.category === 'visual_analysis'));
    });

    it('deve adotar Fail-Closed (status review) em caso de falha de download ou host inseguro', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'wg-mod-'));
      const moderator = new VisualModerator({
        cacheFilePath: join(tmpDir, 'cache.json'),
        fetchImpl: async () => {
          throw new Error('Network timeout simulado');
        },
      });

      // Teste com URL que falha
      const result = await moderator.classifyImageUrl(
        'https://images.steamusercontent.com/ugc/123/fail/',
        'item-timeout'
      );

      // Nunca pode aprovar item cuja imagem não pôde ser baixada/verificada
      assert.equal(result.status, 'review');
      assert.ok(result.reasons.some((r) => r.category === 'download_failure'));
    });

    it('deve armazenar em cache e reutilizar resultado na segunda consulta', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'wg-mod-'));
      let classifierCalls = 0;
      const moderator = new VisualModerator({
        cacheFilePath: join(tmpDir, 'cache.json'),
        customClassifier: async () => {
          classifierCalls++;
          return { safe: 0.95, nsfw: 0.05, uncertainty: 0.05 };
        },
      });

      const buffer = createMinimalPng();
      const res1 = await moderator.classifyBuffer(buffer, 'item-cache');
      assert.equal(res1.source, 'analysis');
      assert.equal(classifierCalls, 1);

      const res2 = await moderator.classifyBuffer(buffer, 'item-cache');
      assert.equal(res2.source, 'cache');
      assert.equal(classifierCalls, 1); // Não chamou classificador novamente
    });
  });

  describe('Pipeline Completo e Exclusão do Catálogo Público', () => {
    it('pipeline unificado deve vetar item tanto por metadados quanto por visual', async () => {
      const pipeline = new ModerationPipeline({
        skipVisualAnalysis: true,
      });

      const badMetadata = {
        id: '4001',
        title: 'Explicit NSFW Girl',
        description: 'desc',
        tags: ['Anime'],
        rating: 'Everyone',
        previewUrl: 'https://example.com/p.jpg',
        author: { name: 'Author' },
        resolution: '1920x1080',
        aspectRatio: '16:9',
        type: 'Scene',
        createdAt: '2024-01-01',
      };

      const decision = await pipeline.evaluateItem(badMetadata);
      assert.equal(decision.status, 'blocked');
    });

    it('rebuildCatalog deve sanitizar catálogo existente criando backup e quarentena', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'wg-rebuild-'));
      const testCatalogPath = join(tmpDir, 'catalog.json');
      const backupDir = join(tmpDir, 'backups');
      const quarantinePath = join(tmpDir, 'quarantine.json');

      const sampleCatalog = [
        {
          id: '5001',
          title: 'Clean Anime Landscape',
          description: 'Belo pôr do sol',
          tags: ['Anime', 'Landscape'],
          rating: 'Everyone',
          previewUrl: 'https://images.steamusercontent.com/ugc/1/A/',
          author: { name: 'Artist1' },
          resolution: '1920x1080',
          aspectRatio: '16:9',
          type: 'Scene',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          stats: { views: 100, subscriptions: 50 },
          steamUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=5001',
          steamClientUri: 'steam://url/CommunityFilePage/5001',
        },
        {
          id: '5002',
          title: 'Adult 18+ NSFW Character',
          description: 'Conteúdo explícito',
          tags: ['Mature', 'CGI'],
          rating: 'Mature',
          previewUrl: 'https://images.steamusercontent.com/ugc/2/B/',
          author: { name: 'Artist2' },
          resolution: '1920x1080',
          aspectRatio: '16:9',
          type: 'Scene',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          stats: { views: 500, subscriptions: 200 },
          steamUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=5002',
          steamClientUri: 'steam://url/CommunityFilePage/5002',
        },
        {
          id: '5003',
          title: 'Questionable Posed Model',
          description: 'Modelo em pose sugestiva',
          tags: ['Girls'],
          rating: 'Questionable',
          previewUrl: 'https://images.steamusercontent.com/ugc/3/C/',
          author: { name: 'Artist3' },
          resolution: '2560x1440',
          aspectRatio: '16:9',
          type: 'Scene',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          stats: { views: 300, subscriptions: 100 },
          steamUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=5003',
          steamClientUri: 'steam://url/CommunityFilePage/5003',
        },
      ];

      writeFileSync(testCatalogPath, JSON.stringify(sampleCatalog, null, 2), 'utf-8');

      // Executa a reconstrução e sanitização
      const result = await rebuildCatalog({
        catalogPath: testCatalogPath,
        backupDir,
        quarantinePath,
        skipVisualAnalysis: true,
      });

      assert.equal(result.totalOriginal, 3);
      assert.equal(result.approvedCount, 1);
      assert.equal(result.quarantinedCount, 2);
      assert.ok(existsSync(result.backupPath), 'Arquivo de backup deve existir');
      assert.ok(existsSync(quarantinePath), 'Relatório de quarentena deve existir');

      // Verifica que o catálogo foi atualizado em disco apenas com itens aprovados
      const sanitized = JSON.parse(readFileSync(testCatalogPath, 'utf-8'));
      assert.equal(sanitized.length, 1);
      assert.equal(sanitized[0].id, '5001');

      // Verifica que os shards gerados contêm apenas o item aprovado
      const manifestPath = join(tmpDir, 'catalog', 'manifest.json');
      assert.ok(existsSync(manifestPath), 'manifest.json deve ser gerado');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      assert.equal(manifest.totalItems, 1);
      assert.equal(manifest.shards.length, 1);
      assert.deepEqual(Object.keys(manifest.itemToPage), ['5001']);

      const indexPath = join(tmpDir, 'catalog', 'index.json');
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      assert.equal(index.length, 1);
      assert.equal(index[0].id, '5001');

      const page1Path = join(tmpDir, 'catalog', 'pages', '000001.json');
      const page1 = JSON.parse(readFileSync(page1Path, 'utf-8'));
      assert.equal(page1.length, 1);
      assert.equal(page1[0].id, '5001');
    });
  });
});
