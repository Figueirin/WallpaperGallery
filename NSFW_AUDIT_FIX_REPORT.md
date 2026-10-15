# WallpaperGallery — Relatório de Correções Pós-Auditoria NSFW

## 1. Visão Geral

Este documento consolida as correções arquiteturais, lógicas e operacionais implementadas no **WallpaperGallery** após a auditoria independente documentada em `docs/CODEX_NSFW_AUDIT.md`.

Todas as lacunas comprovadas (**N-01** a **N-09**) foram sanadas integralmente, preservando os pilares do projeto:
- **Arquitetura JSON-First**: estática, atômica e desacoplada de serviços externos em tempo de execução.
- **Moderação Gratuita e Local**: sem dependência de APIs pagas, modelos pesados de visão computacional ou bibliotecas nativas complexas.
- **Integridade Transacional**: sincronização e reconstrução com pré-validação, locking e rollback automático.
- **Política de Classificação Fiel**: preservação da distinção entre classificações explícitas e metadados ausentes, sem coerções artificiais.

---

## 2. Problemas Corrigidos (N-01 a N-09)

### N-01 — Bloqueio Completo de Variações de Rule 34
- **Causa Raiz**: O moderador anterior não reconhecia `rule34`, `rule 34`, `rule-34`, `r34` nem suas variantes em caixa alta ou caracteres Unicode full-width.
- **Correção Implementada**: Adicionada correspondência estrita para `rule[\s\-_—–]*34` e `r[\s\-_—–]*34` em `RESTRICTED_TERMS_REGEX` e `R34_REGEX`, cobrindo título, descrição e tags. Adicionada salvaguarda automotiva para referências legítimas como `Nissan Skyline R34`, `GT-R R34`, `BNR34` e `ER34`.

### N-02 — Termos Explícitos, Delimitadores e Limites de Regex
- **Causa Raiz**: Termos explícitos fundamentais (`nude`, `naked`, `pornography`, `nudez`, `sexo explícito`) não constavam na lista restrita. O marcador `18+` falhava devido ao limite de palavra `\b` logo após o símbolo `+`. Separadores como `_`, `—` (em-dash) e `–` (en-dash) não eram uniformizados, permitindo evasões como `art_nsfw` e `r—18`. A tag `xxx` era ignorada devido a assimetria na validação.
- **Correção Implementada**:
  - Incorporação dos termos ausentes ao `RESTRICTED_TERMS_REGEX`.
  - Reestruturação do padrão `PLUS_EIGHTEEN_REGEX` para `(?:^|[^\w])18\s*\+(?=[^\w]|$)`, garantindo detecção de `18+` isolado com qualquer delimitador não-alfanumérico.
  - Normalização de `_` para espaço e suporte abrangente a hifens e travessões (`-`, `—`, `–`).
  - Unificação da validação de texto entre títulos, descrições e tags, bloqueando `xxx` uniformemente nos três campos.

### N-03 — Política de Classificação Estrita e Suporte a 'Unrated'
- **Causa Raiz**: O normalizador atribuía arbitrariamente `'Everyone'` a wallpapers sem tags de classificação da Steam. Em caso de tags conflitantes, `'Everyone'` podia sobrepor `'Mature'`.
- **Correção Implementada**:
  - Adicionado o valor `'Unrated'` à união de tipos `WallpaperAgeRating` em `src/types/wallpaper.ts` e ao validador `isWallpaperItem`.
  - Wallpapers sem classificação explícita da Steam agora recebem `'Unrated'`, permitindo a publicação apenas se aprovados pelos demais filtros textuais e pela blacklist.
  - Resolução de conflito estrita na normalização: `Mature` > `Questionable` > `Everyone`.

### N-04 — Purga de Blacklist e Metadados Reprovados na Sincronização Incremental
- **Causa Raiz**: O script de sincronização avaliava apenas os itens recém-coletados da Steam. Wallpapers já persistidos no catálogo que entrassem na blacklist ou violassem novos critérios de moderação continuavam publicados indefinidamente após o merge.
- **Correção Implementada**: A moderação completa (`ModerationPipeline`) foi movida para executar **após o merge** (`finalWallpapers = merged`), garantindo que tanto novos itens quanto itens legados sejam expurgados do catálogo público se reprovados pela moderação.

### N-05 — Atomicidade e Rollback na Geração de Shards e Reconstrução Offline
- **Causa Raiz**: A substituição de shards e do catálogo monolítico ocorria de forma sequencial e não-atômica. Erros durante a escrita deixavam o manifesto e as páginas em estados incompatíveis entre si. Erros de deleção de shards obsoletos eram engolidos silenciosamente.
- **Correção Implementada**:
  - `catalogSharder.ts`: Escrita em diretório de staging temporário (`.staging.<pid>.<time>`), promovendo os arquivos com backup e mecanismo de rollback (`restoreRollback`) em bloco caso ocorra falha.
  - `rebuild-catalog.ts` e `sync-workshop.ts`: Verificação preventiva do lock de shards (`catalog.lock`) antes de alterar qualquer arquivo consolidado. Em falha durante a publicação dos shards, o arquivo `catalog.json` é restaurado a partir do backup prévio.
  - Erros de remoção de arquivos e shards obsoletos são propagados rigorosamente.

### N-06 — Validação Rígida da Blacklist e Exigência de Arquivo
- **Causa Raiz**: IDs com strings inválidas (`'abc'`, `'-1'`, `'1e6'`, `'0'`) eram tolerados pelo carregador da blacklist. A ausência do arquivo `blocked-wallpapers.json` retornava um Set vazio sem alertar o pipeline, desativando silenciosamente o controle editorial.
- **Correção Implementada**:
  - Validação regex estrita de string decimal positiva (`/^[1-9]\d*$/`) para todos os IDs bloqueados, preservando formato string para evitar estouro de precisão numérica com `uint64`.
  - Rejeição de duplicatas (inclusive após trim) e strings vazias.
  - Exigência obrigatória (`required: true` por padrão) do arquivo de blacklist nos fluxos de produção e rebuild, falhando explicitamente se ausente ou corrompido.

### N-07 — Rejeição Precoce de Itens Simulados e Estrutura Inválida
- **Causa Raiz**: Itens contendo `isSimulated: true` ou esquemas inválidos eram aceitos pelo moderador e gravados em `catalog.json`, falhando apenas posteriormente no particionador.
- **Correção Implementada**: Adicionada fase de pré-validação estrita em `rebuild-catalog.ts` e `sync-workshop.ts` que inspeciona `isWallpaperItem(item)` e rejeita categoricamente `item.isSimulated === true` antes de qualquer alteração física em arquivos públicos.

### N-08 — Isolamento e Advertência Arquitetural do Caminho Firestore
- **Causa Raiz**: O script de sincronização legado `sync:firestore` persistia documentos no Firestore sem acionar o `ModerationPipeline`.
- **Correção Implementada**: Inserida documentação explícita e banner de aviso arquitetural em `scripts/sync-firestore.ts`, registrando que a sincronização Firestore é legada, não moderada e secundária, reforçando a primazia da arquitetura JSON-First estática.

### N-09 — Isolamento Contextual da Exceção XXX e Proteção Cultural CJK
- **Causa Raiz**: Qualquer ocorrência de `-XXX-` em títulos/descrições desativava globalmente a detecção de `XXX` em todo o campo. O caractere asiático `成人` bloqueava termos culturais inofensivos como `成人の日` (Coming of Age Day).
- **Correção Implementada**:
  - `stripXxxPlaceholders`: Substitui apenas as ocorrências pontuais de placeholders estruturais (ex: `夜莺Night——XXX`, `-XXX-`, `例如：...XXX`), preservando ocorrências isoladas de `XXX` que continuam bloqueadas.
  - Salvaguarda cultural: O termo `成人の日` é protegido antes da avaliação de ideogramas orientais restritos.

---

## 3. Matriz de Arquivos Modificados

| Arquivo | Responsabilidade |
|---|---|
| `src/types/wallpaper.ts` | Adiciona `'Unrated'` à união de tipos `WallpaperAgeRating`. |
| `src/utils/validateWallpaper.ts` | Valida `'Unrated'` como classificação etária aceita no schema. |
| `src/services/moderation/blacklist.ts` | Validação de IDs decimais positivos estritos, preservação de `uint64` e exigência de arquivo obrigatório. |
| `src/services/moderation/metadataModerator.ts` | Normalização Unicode NFKD, remoção de zero-width, regexes de Rule 34, R-18, termos explícitos, 18+, salvaguardas culturais e automotivas, e tratamento local de placeholders XXX. |
| `src/utils/catalogSharder.ts` | Gravação transacional em staging com promoção atômica, rollback automático e propagação de erros. |
| `scripts/rebuild-catalog.ts` | Pré-validação de itens/simulados, verificação prévia de lock e rollback de `catalog.json` em falhas de shards. |
| `scripts/sync-workshop.ts` | Moderação pós-merge (expurgo de itens legados reprovados), normalização de `'Unrated'`, resolução restritiva de ratings e rollback de publicação. |
| `scripts/sync-firestore.ts` | Registro e isolamento arquitetural da rota legada não moderada. |
| `tests/catalogSync.test.mjs` | Ajuste dos testes de normalização para refletir `'Unrated'`. |
| `tests/moderation.test.mjs` | Ajuste dos testes de ausência de classificação e validação da exigência de arquivo de blacklist. |
| `tests/nsfwAudit.test.mjs` | Verificação completa de todas as 13 asserções de segurança e regressões da auditoria. |

---

## 4. Política Definitiva de Moderação

| Cenário | Classificação / Condição | Decisão | Racional |
|---|---|---|---|
| Rating Steam | `Mature` | **Bloqueado** | Conteúdo adulto sinalizado na origem. |
| Rating Steam | `Questionable` | **Bloqueado** | Conteúdo limítrofe sinalizado na origem. |
| Rating Steam | `Everyone` | **Permitido** (se aprovado em texto e blacklist) | Conteúdo geral. |
| Rating Steam | Ausente / Desconhecido (`'Unrated'`) | **Permitido** (se aprovado em texto e blacklist) | Não presume malícia; submete a todas as regras textuais e manuais. |
| Blacklist Manual | ID presente em `config/blocked-wallpapers.json` | **Bloqueado sempre** | Decisão editorial determinística e irrevogável. |
| Regras Textuais | Termo NSFW, Rule 34, R-18, 18+, termos explícitos em título, descrição ou tags | **Bloqueado** | Proteção textual em profundidade. |
| Exceção Automotiva | Ocorrência de R34 acompanhada de termos automotivos (`nissan`, `skyline`, `gt-r`, etc.) | **Permitido** (se aprovado em texto e blacklist) | Previne falso positivo em franquias e modelos clássicos. |
| Exceção Cultural | Ocorrência de `成人の日` | **Permitido** (se aprovado em texto e blacklist) | Previne falso positivo em feriado cultural tradicional japonês. |

---

## 5. Estratégia de Publicação Transacional

Para garantir que o catálogo consolidado (`catalog.json`) e o particionamento (`manifest.json`, `index.json`, `pages/*.json`) permaneçam sempre em paridade absoluta:

1. **Pré-validação**: todos os itens aprovados são validados em memória antes de abrir arquivos ou locks de escrita.
2. **Locking Preventivo**: ambos os locks (`catalog.lock` e `catalog.json.lock`) são verificados antecipadamente com `O_EXCL` (`flag: 'wx'`).
3. **Staging e Promoção Atômica**:
   - O arquivo monolítico é escrito com sufixo `.tmp` e promovido via `renameSync`.
   - Os shards são gerados em pasta de staging temporária e copiados para o destino final com registro de backup.
4. **Mecanismo de Rollback**:
   - Se ocorrer qualquer exceção durante a movimentação dos shards, o arquivo consolidado `catalog.json` é restaurado a partir de seu backup prévio, e os shards parciais são revertidos.
   - Nenhuma pasta ou shard órfão é mantido silenciosamente.

---

## 6. Resultados dos Testes de Regressão e Validação

### Testes Automatizados (`npm test`)
- **Total de Testes**: 145 aprovados (0 falhas, 0 pendentes).
- **Total de Suítes**: 36 suítes.
- **Tempo de Execução**: ~889 ms.
- **Suítes em Destaque**:
  - `tests/nsfwAudit.test.mjs`: 13 asserções especializadas cobrindo N-01 até N-09 com 100% de aprovação.
  - `tests/moderation.test.mjs`: Cobertura completa de regras textuais, blacklist manual e rebuild offline.
  - `tests/catalogSync.test.mjs`: Normalização de ratings e merge de coleções.
  - `tests/shardedCatalog.test.mjs`: Consistência transacional dos shards e provider estático.

### Verificação de Tipos (`npm run typecheck`)
- TypeScript compiler (`tsc -b && tsc -p tsconfig.scripts.json`): **0 erros**.

### Build de Produção (`npm run build`)
- Compilação Vite e empacotamento de assets: **Sucesso (0 erros)**.

---

## 7. Limitações Remanescentes e Garantias de Segurança

1. **Moderação Baseada em Metadados**: O sistema baseia-se exclusivamente em sinais da Steam (idade/tags), análise de metadados textuais e blacklist manual. Não há análise visual por visão computacional, o que mantém o pipeline ultraleve, determinístico e com custo de infraestrutura zero.
2. **Evasão Adversarial Não Convencional**: Tentativas deliberadas de ofuscação não previstas em Unicode ou imagens com metadados completamente limpos não serão detectadas pelo filtro textual. O mecanismo de contingência para esses casos é a inserção rápida do `PublishedFileID` na blacklist manual (`config/blocked-wallpapers.json`), seguida de `npm run moderate:rebuild`.
3. **Não Interferência em Ambientes Remotos**:
   - Nenhuma chamada à Steam Web API foi executada durante o desenvolvimento e os testes (fixtures locais isolados em diretórios temporários).
   - Nenhuma gravação no Firebase Firestore foi realizada.
   - Nenhum comando `git push` foi executado.

---

## 8. Identificação do Commit Local

- **Commit**: `9c6207a` (e commit subsequente de consolidação)
- **Mensagem**: `fix(moderation): resolve post-audit issues N-01 through N-09`
- **Branch**: `main`
- **Data**: 2026-10-15
- **Status Remoto**: Nenhuma alteração enviada ao GitHub (`git push` não executado).
