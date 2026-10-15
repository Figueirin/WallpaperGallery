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
  validateManualBlacklist,
  loadManualBlacklist,
} from '../src/services/moderation/blacklist.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
import { rebuildCatalog } from '../scripts/rebuild-catalog.ts';

describe('Moderação de Conteúdo Simplificada (Simplified Content Moderation)', () => {
  describe('1. Classificação Etária da Steam (Mature e Questionable)', () => {
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
      assert.ok(decision.reasons.some((r) => r.category === 'steam_rating'));
    });
  });

  describe('2. Classificação Etária Ausente ou Desconhecida (Permitida se passar pelos outros filtros)', () => {
    it('deve permitir wallpaper se a classificação etária rating for indefinida / ausente, desde que passe nos outros filtros', () => {
      const item = {
        id: '1101',
        title: 'Unknown Rating Wallpaper',
        description: 'Sem rating mas com conteudo limpo',
        tags: ['Nature'],
      };
      const decision = moderateMetadata(item);
      assert.equal(decision.status, 'safe');
      assert.equal(decision.reasons.length, 0);
    });

    it('deve permitir se a classificação etária for string vazia ou Unrated, desde que passe nos outros filtros', () => {
      const emptyRating = moderateMetadata({
        id: '1102',
        title: 'Empty Rating Wallpaper',
        description: 'Rating vazio e conteudo limpo',
        tags: ['Nature'],
        rating: '   ',
      });
      assert.equal(emptyRating.status, 'safe');

      const unrated = moderateMetadata({
        id: '1103',
        title: 'Unrated Wallpaper',
        description: 'Rating unrated e conteudo limpo',
        tags: ['Art'],
        rating: 'Unrated',
      });
      assert.equal(unrated.status, 'safe');
    });

    it('deve bloquear wallpaper com rating ausente se contiver termos proibidos', () => {
      const decision = moderateMetadata({
        id: '1104',
        title: 'Hentai Wallpaper Without Rating',
        description: 'Sem rating porem com conteudo adulto',
        tags: ['Anime'],
      });
      assert.equal(decision.status, 'blocked');
      assert.ok(decision.reasons.some((r) => r.category === 'metadata_keyword'));
    });

    it('deve bloquear se metadados essenciais estiverem ausentes (ex: ID ou Título vazio)', () => {
      const noId = moderateMetadata({
        id: '',
        title: 'Valid Title',
        tags: ['Art'],
        rating: 'Everyone',
      });
      assert.equal(noId.status, 'blocked');
      assert.ok(noId.reasons.some((r) => r.category === 'invalid_metadata'));

      const noTitle = moderateMetadata({
        id: '1104',
        title: '   ',
        tags: ['Art'],
        rating: 'Everyone',
      });
      assert.equal(noTitle.status, 'blocked');
      assert.ok(noTitle.reasons.some((r) => r.category === 'invalid_metadata'));
    });
  });

  describe('3. Moderação Textual: Palavras-chave NSFW (Título, Descrição e Tags)', () => {
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

  describe('4. Prevenção de Falsos Positivos Textuais', () => {
    it('não deve bloquear termos genéricos legítimos como anime, girl, romance, art, cosplay, waifu', () => {
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

  describe('5. Blacklist Manual de Wallpapers (config/blocked-wallpapers.json)', () => {
    it('deve bloquear wallpaper listado na blacklist manual mesmo com rating Everyone e conteúdo limpo', () => {
      const blacklist = new Set(['99990001', '99990002']);
      const pipeline = new ModerationPipeline({ manualBlacklist: blacklist });

      const decision = pipeline.evaluateItem({
        id: '99990001',
        title: 'Clean Nature Landscape',
        description: 'Belo wallpaper de natureza',
        tags: ['Nature', 'Relaxing'],
        rating: 'Everyone',
      });

      assert.equal(decision.status, 'blocked');
      assert.ok(decision.reasons.some((r) => r.category === 'manual_blacklist'));
      assert.ok(decision.reasons.some((r) => r.matchedTerm === '99990001'));
    });

    it('deve comparar IDs estritamente como strings', () => {
      const blacklist = new Set(['00123456']);
      const pipeline = new ModerationPipeline({ manualBlacklist: blacklist });

      const decision = pipeline.evaluateItem({
        id: '00123456',
        title: 'String Match Test',
        description: 'desc',
        tags: ['Anime'],
        rating: 'Everyone',
      });

      assert.equal(decision.status, 'blocked');
      assert.ok(decision.reasons.some((r) => r.category === 'manual_blacklist'));
    });

    it('deve aprovar wallpaper seguro cujo ID não consta na blacklist', () => {
      const blacklist = new Set(['99990001']);
      const pipeline = new ModerationPipeline({ manualBlacklist: blacklist });

      const decision = pipeline.evaluateItem({
        id: '99990099',
        title: 'Cozy Mountain Sunrise',
        description: 'Amanhecer aconchegante nas montanhas',
        tags: ['Nature', 'Sunrise'],
        rating: 'Everyone',
      });

      assert.equal(decision.status, 'safe');
      assert.equal(decision.reasons.length, 0);
    });

    it('deve validar estrutura correta da blacklist e retornar Set de IDs', () => {
      const validConfig = {
        blockedIds: ['100', '200', '300'],
      };
      const set = validateManualBlacklist(validConfig);
      assert.equal(set.size, 3);
      assert.ok(set.has('100'));
      assert.ok(set.has('200'));
      assert.ok(set.has('300'));
    });

    it('deve rejeitar blacklist com IDs duplicados apresentando erro explícito', () => {
      const invalidConfig = {
        blockedIds: ['100', '200', '100', '300'],
      };
      assert.throws(
        () => validateManualBlacklist(invalidConfig),
        /Blacklist manual contém IDs duplicados: 100/
      );
    });

    it('deve rejeitar blacklist com estrutura inválida ou tipos incorretos', () => {
      assert.throws(() => validateManualBlacklist(null), /deve ser um objeto JSON/);
      assert.throws(() => validateManualBlacklist([]), /deve ser um objeto JSON/);
      assert.throws(() => validateManualBlacklist({}), /"blockedIds" ausente ou não é um array/);
      assert.throws(
        () => validateManualBlacklist({ blockedIds: [123] }),
        /esperado string/
      );
      assert.throws(
        () => validateManualBlacklist({ blockedIds: ['   '] }),
        /não pode ser vazio/
      );
    });

    it('deve lançar erro se arquivo de blacklist não existir por padrão ou retornar Set vazio se required: false', () => {
      assert.throws(() => loadManualBlacklist('/non-existent-path/blocked.json'), /não encontrado/);
      const emptySet = loadManualBlacklist('/non-existent-path/blocked.json', { required: false });
      assert.equal(emptySet.size, 0);

      const tmpDir = mkdtempSync(join(tmpdir(), 'wg-bl-'));
      const testBlacklistPath = join(tmpDir, 'blocked-wallpapers.json');
      writeFileSync(
        testBlacklistPath,
        JSON.stringify({ blockedIds: ['8881', '8882'] }, null, 2),
        'utf-8'
      );

      const loaded = loadManualBlacklist(testBlacklistPath);
      assert.equal(loaded.size, 2);
      assert.ok(loaded.has('8881'));
      assert.ok(loaded.has('8882'));
    });
  });

  describe('6. Reconstrução Offline do Catálogo (rebuildCatalog) e Consistência dos Shards', () => {
    it('deve sanitizar catálogo existente expurgando itens bloqueados por rating, blacklist e metadados', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'wg-rebuild-simple-'));
      const testCatalogPath = join(tmpDir, 'catalog.json');
      const backupDir = join(tmpDir, 'backups');
      const quarantinePath = join(tmpDir, 'quarantine.json');
      const blacklistPath = join(tmpDir, 'blocked-wallpapers.json');

      writeFileSync(
        blacklistPath,
        JSON.stringify({ blockedIds: ['5004'] }, null, 2),
        'utf-8'
      );

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
        {
          id: '5004',
          title: 'Manual Blacklisted Clean Wallpaper',
          description: 'Item bloqueado na blacklist manual',
          tags: ['Technology'],
          rating: 'Everyone',
          previewUrl: 'https://images.steamusercontent.com/ugc/4/D/',
          author: { name: 'Artist4' },
          resolution: '1920x1080',
          aspectRatio: '16:9',
          type: 'Scene',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          stats: { views: 200, subscriptions: 80 },
          steamUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=5004',
          steamClientUri: 'steam://url/CommunityFilePage/5004',
        },
      ];

      writeFileSync(testCatalogPath, JSON.stringify(sampleCatalog, null, 2), 'utf-8');

      // Executa a reconstrução e sanitização (sem necessidade de flags visuais)
      const result = await rebuildCatalog({
        catalogPath: testCatalogPath,
        backupDir,
        quarantinePath,
        blacklistPath,
      });

      assert.equal(result.totalOriginal, 4);
      assert.equal(result.approvedCount, 1);
      assert.equal(result.quarantinedCount, 3);
      assert.ok(existsSync(result.backupPath), 'Arquivo de backup deve existir');
      assert.ok(existsSync(quarantinePath), 'Relatório de quarentena deve existir');

      // Verifica que o relatório de quarentena detalhou os motivos
      const quarantine = JSON.parse(readFileSync(quarantinePath, 'utf-8'));
      assert.equal(quarantine.summary.totalAnalyzed, 4);
      assert.equal(quarantine.summary.approvedCount, 1);
      assert.equal(quarantine.summary.blockedCount, 3);
      assert.equal(quarantine.summary.blockedByBlacklist, 1);
      assert.equal(quarantine.summary.blockedBySteamRating, 2);

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
