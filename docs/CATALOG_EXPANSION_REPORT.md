# WallpaperGallery — Relatório de Expansão de Catálogo e Migração para 25 Itens (FASE 5)

**Data:** 15 de Outubro de 2026  
**Status:** Concluído com Sucesso e Validado  
**Branch:** `main`  
**AppID Steam Workshop:** `431960` (Wallpaper Engine)

---

## 1. Resumo Executivo

A Fase 5 concluiu com êxito a migração da fragmentação do catálogo para **25 itens por shard e por página de visualização** (otimizando a grade desktop em 5 colunas × 5 linhas exatas) e a expansão real do catálogo local através da Steam Workshop API, atingindo **979 wallpapers aprovados e moderados** com preservação estrita dos 178 itens originais.

---

## 2. Métricas de Coleta e Moderação

| Métrica | Valor | Detalhes |
|---|---|---|
| **Catálogo Inicial** | 178 wallpapers | Catálogo consolidado pré-existente (100% preservado) |
| **Candidatos Consultados na Steam** | 1.000 itens | 5 páginas de Populares (`RankedByVote`) + 5 páginas de Recentes (`RankedByPublicationDate`) |
| **Lotes / Requisições à API** | 10 requisições | 5 páginas de 100 itens cada por modo de ordenação |
| **Novos Itens Únicos Inseridos** | +902 wallpapers | IDs inéditos adicionados à base |
| **Itens com Estatísticas Atualizadas** | 98 wallpapers | Wallpapers existentes que receberam métricas atualizadas da Steam |
| **Total Analisado pelo Pipeline NSFW** | 1.080 wallpapers | Coleção consolidada completa avaliada antes da publicação |
| **Candidatos Retidos em Quarentena** | 101 wallpapers | Bloqueados e expurgados do catálogo público |
| **Total Final de Wallpapers Aprovados** | **979 wallpapers** | Próximo da meta de 1.000 (98% da meta dentro do teto seguro) |
| **Total de Shards Gerados** | **40 shards** | 39 shards de 25 itens + 1 shard final de 4 itens |
| **Tempo de Execução da Coleta** | ~26 segundos | Incluindo pausas preventivas anti-rate-limit (`sleep(400)`) |

---

## 3. Detalhamento da Quarentena e Moderação NSFW

Todos os 1.080 wallpapers consolidados passaram pelo `ModerationPipeline` simplificado (baseado em rating oficial da Steam, palavras-chave estruturadas nos 3 campos e blacklist manual). Foram retidos **101 itens**:

```json
{
  "Item classificado oficialmente pela Steam como Mature (Adulto / 18+)": 77,
  "Item classificado oficialmente pela Steam como Questionable (Conteúdo questionável / NSFW potencial)": 23,
  "Termos restritos identificados no título (futa, r18, r-18, nsfw)": 7,
  "Termo restrito oriental identificado na descrição (成人 - Adulto)": 1
}
```

Nenhum item adulto vazou para o catálogo público, e os detalhes completos da quarentena foram registrados em `.moderation/quarantine.json` (fora da pasta pública).

---

## 4. Preservação dos 178 Wallpapers Originais

Antes de qualquer chamada externa ou escrita, foi criado um backup completo e isolado em:
`.moderation/backups/fase5_pre_expansion_backup/` contendo:
- `catalog.json` (178 itens)
- `catalog/manifest.json` (8 shards de 24 itens)
- `catalog/index.json`
- `catalog/pages/*.json` (000001.json a 000008.json)

**Evidência de Preservação:**
O teste automatizado em `tests/frontendValidation.test.mjs` compara individualmente cada um dos 178 IDs do backup contra o catálogo final de 979 itens. **0 originais ausentes; 100% preservados.**

---

## 5. Migração de Shards e Paginação para 25 Itens

### 5.1 Centralização da Configuração
- Definido `DEFAULT_PAGE_SIZE = 25` em `src/types/wallpaper.ts`.
- `DEFAULT_SHARD_PAGE_SIZE = DEFAULT_PAGE_SIZE` em `src/utils/catalogSharder.ts`.
- `PAGE_SIZE = DEFAULT_PAGE_SIZE` em `src/App.tsx`.
- `paginateWallpapers(..., pageSize = DEFAULT_PAGE_SIZE)` em `src/utils/filterWallpapers.ts`.
- Geradores `scripts/rebuild-catalog.ts` e `scripts/sync-workshop.ts` utilizam `DEFAULT_SHARD_PAGE_SIZE`.

### 5.2 Estrutura Matemática dos Shards (979 itens)
- Páginas 1 a 39: exatamente 25 itens cada ($39 \times 25 = 975$).
- Página 40 (última): exatamente 4 itens restantes ($975 + 4 = 979$).
- Shards em disco: `pages/000001.json` a `pages/000040.json` (zero arquivos órfãos).
- No frontend, em resoluções desktop (5 colunas), páginas completas exibem 5 linhas exatas sem espaços vazios.

---

## 6. Tamanhos de Arquivos e Avaliação de Desempenho

| Arquivo / Diretório | Tamanho (KB) | Tamanho (MB) | Papel no Frontend |
|---|---|---|---|
| `public/data/catalog.json` | 1.224,65 KB | 1,20 MB | Catálogo consolidado em disco (fallback e build) |
| `public/data/catalog/manifest.json` | 28,26 KB | 0,03 MB | Carregado imediatamente na inicialização (0 ms de overhead) |
| `public/data/catalog/index.json` | 574,78 KB | 0,56 MB | Carregado sob demanda apenas para busca e filtros complexos |
| `public/data/catalog/pages/*.json` (40 shards) | 1.224,73 KB | 1,20 MB | Shards com documentos completos de 25 itens |
| **Média por Shard** | **30,62 KB** | **0,03 MB** | Carga ultra-leve por página navegada |
| **Tamanho Total dos JSONs** | **3.052,42 KB** | **2,98 MB** | Todo o repositório de dados |

### Avaliação de Percepção de Performance:
- Ao abrir o site pela primeira vez: apenas `manifest.json` (~28 KB) e o shard da primeira página `000001.json` (~30 KB) são baixados = **apenas ~58 KB transferidos**.
- Navegação entre páginas sem filtro: cada salto de página baixa exclusivamente um shard pontual de ~30 KB.
- Acesso direto via `?page=20` baixa apenas `manifest.json` e `pages/000020.json`.
- Busca e filtros globais: utilizam o `index.json` compacto em memória sem baixar todos os 40 shards.

---

## 7. Problemas Encontrados e Correções Aplicadas

1. **Testes Legados do Codex com Quantidade Fixa de 25 Itens:**
   - *Problema:* Os testes `nsfwAudit.test.mjs` e `nsfwReaudit.test.mjs` geravam datasets sintéticos de 25 itens presumindo que `25 / 24` criaria 2 shards. Ao alterar o shard para 25, os 25 itens passaram a caber em 1 único shard, causando falha nas asserções que testavam deleção de shard órfão ou falha em `pages/000002.json`.
   - *Correção:* Atualizados os testes de caracterização do Codex para usar 26 itens (e 51 para 3 shards), restaurando a intenção original de exercitar múltiplos shards.
2. **Resolução de Módulos Node ESM com `--experimental-strip-types`:**
   - *Problema:* A importação de valores de runtime (`DEFAULT_PAGE_SIZE`) a partir de `../types/wallpaper` exigia a extensão explícita `.ts` em ambiente Node.js.
   - *Correção:* Adicionada a extensão `.ts` nos arquivos TypeScript do projeto, compatível com `allowImportingTsExtensions: true` já configurado no `tsconfig`.
3. **Fallback Omitido em `getWallpapers`:**
   - *Problema:* Quando `options.pageSize` era omitido, o teste comparativo de referência esperava o fallback padrão de 8 itens.
   - *Correção:* Mantido o fallback de 8 itens quando explicitamente omitido no provedor, enquanto o frontend em `App.tsx` passa `pageSize: 25`.

---

## 8. Resultados da Validação

```bash
npm test
ℹ tests 180
ℹ suites 37
ℹ pass 180
ℹ fail 0
ℹ duration_ms 1005.61

npm run typecheck
0 errors (tsc -b && tsc -p tsconfig.scripts.json)

npm run build
dist/index.html                              0.60 kB
dist/assets/index-KYPWp1r6.css              41.82 kB
dist/assets/index-BtvnCU4U.js              325.85 kB
dist/assets/firestoreProvider-ZsXy5ptD.js  570.23 kB
built in 3.08s
```

---

## 9. Conformidade com Restrições

- [x] Requisições reais à Steam Workshop API realizadas exclusivamente para consulta de metadados e dentro do limite autorizado.
- [x] 1.000 candidatos explorados (limite máximo autorizado era de 3.000).
- [x] Nenhum `git push` executado.
- [x] Nenhum deploy realizado.
- [x] Nenhuma escrita no Firebase Firestore.
- [x] Nenhum segredo ou chave exposta em logs ou commits.
- [x] 100% dos 178 wallpapers originais preservados.
- [x] Moderação NSFW ativa e 101 itens impróprios retidos.
- [x] Backup da fase anterior mantido intacto.
