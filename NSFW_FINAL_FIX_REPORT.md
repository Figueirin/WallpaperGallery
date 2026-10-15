# WallpaperGallery — Relatório Final de Correções (R-01 a R-05)

## 1. Visão Geral e Contexto

Este documento detalha as resoluções técnicas aplicadas para sanar as cinco regressões (**R-01** a **R-05**) identificadas na segunda auditoria independente realizada pelo Codex (`docs/CODEX_NSFW_REAUDIT.md`) sobre o commit `c6d6f73`.

Todas as regressões comprovadas foram resolvidas mantendo a integridade da arquitetura **JSON-First**, sem introdução de serviços externos, sem quebrar os comportamentos prévios (**N-01** a **N-09**) e sem alterar dados reais de produção ou chaves remotas.

---

## 2. Correção Detalhada de Cada Regressão

### R-01 — Concorrência entre Sincronização e Rebuild
- **Causa Raiz**: O script `scripts/sync-workshop.ts` detectava concorrência sob o lock, porém o bloco `catch` restaurava incondicionalmente a variável `originalDiskCatalog` em disco mesmo quando o próprio processo de sincronização **não havia chegado a modificar** `catalog.json`. Isso revertia e corrompia reconstruções concorrentes legítimas que já haviam sido concluídas com sucesso.
- **Correção**:
  - Introduzida a flag de estado `publicationStarted` em `scripts/sync-workshop.ts` e `scripts/rebuild-catalog.ts`.
  - O rollback do catálogo consolidado no `catch` é disparado **apenas e estritamente se** `publicationStarted === true` (isto é, após a execução bem-sucedida de `renameSync(tempPath, outputPath)`).
  - A verificação de concorrência sob o lock (`openSync`) compara os bytes atuais em disco com o snapshot original antes de qualquer escrita, abortando limpamente sem tocar nos arquivos modificados pelo processo concorrente.

### R-02 — Rollback com Catálogo Vazio
- **Causa Raiz**: Em `scripts/sync-workshop.ts`, o rollback no bloco `catch` utilizava a guarda `if (existsSync(outputPath) && originalDiskCatalog.length > 0)`. Quando o catálogo original em disco era válido porém vazio (`[]`), a condição avaliava como falsa, impedindo a restauração do estado original vazio após uma falha nos shards e deixando o catálogo com dados órfãos da nova geração abortada.
- **Correção**:
  - Implementado o rastreamento explícito de `hadOriginalDiskCatalog` (existência prévia do arquivo) e `originalRawBytes` (conteúdo exato em bytes/string) logo na etapa inicial de leitura.
  - No `catch`, se `publicationStarted === true`, a restauração agora distingue com precisão:
    1. Se o arquivo existia previamente (`hadOriginalDiskCatalog`), grava exatamente `originalRawBytes` (seja `[]` ou com *N* wallpapers).
    2. Se o arquivo não existia originalmente, remove o arquivo criado pela tentativa via `unlinkSync(outputPath)`.

### R-03 — Remoção de Shards Órfãos no Rollback
- **Causa Raiz**: Ao expandir o catálogo de 1 página (ex: 24 itens) para 3 páginas (ex: 50 itens), a promoção parcial gravava páginas novas em `public/data/catalog/pages/`. Se a promoção falhasse na página 3, o rollback restaurava o manifesto e a página 1 a partir do backup, mas deixava a página `000002.json` recém-criada órfã no disco público.
- **Correção**:
  - Em `src/utils/catalogSharder.ts`, o conjunto `originalPageFiles` registra todas as páginas preexistentes antes da promoção.
  - Durante o rollback em caso de falha de promoção, o diretório `pages` é varrido: qualquer arquivo de página que **não pertencia** ao conjunto `originalPageFiles` é removido imediatamente via `unlinkSync`.
  - As páginas preexistentes são então copiadas de volta a partir de `rollbackDir/pages/`.

### R-04 — Aborto Precoce em Falha de Backup e Preservação de Rollback
- **Causa Raiz**: A função `writeCatalogShardsSync` engolia silenciosamente erros com `try { copyFileSync(...) } catch {}` durante a preparação do diretório de backup em `rollbackDir`. Se uma página falhasse ao ser copiada para o backup, o processo prosseguia para a promoção mesmo sem ter como recuperá-la. Ademais, o bloco `finally` apagava incondicionalmente a pasta de rollback mesmo se a restauração tivesse falhado.
- **Correção**:
  - Removido o mascaramento de exceções na preparação do backup em `src/utils/catalogSharder.ts`. Se `copyFileSync` de qualquer página ou manifesto falhar, a operação aborta imediatamente antes de iniciar qualquer modificação nos arquivos públicos (`promotionStarted = false`).
  - No bloco `finally`, a pasta `rollbackDir` é preservada caso a recuperação não tenha sido concluída com êxito (`rollbackSucceeded = false`), permitindo auditoria e resgate manual.

### R-05 — Delimitação Estrita de Placeholders Chineses XXX
- **Causa Raiz**: Em `src/services/moderation/metadataModerator.ts`, a expressão `/例如[：:][^.\n]*xxx/gi` utilizava `[^.\n]*`, que é gulosa e parava apenas em quebras de linha ou pontos ocidentais, ignorando o ponto final chinês `。` e pontuações CJK. Como resultado, em títulos como `例如：夜莺——XXX。 XXX wallpaper`, a expressão consumia até a segunda ocorrência independente de `XXX`, aprovando indevidamente conteúdo restrito.
- **Correção**:
  - A regex em `stripXxxPlaceholders` foi refinada para `/例如[：:][^.\n。，、；！？!?]*?xxx\b/gi`.
  - A busca agora é não-gulosa (`*?`) e respeita os limites de sentenças chinesas e ocidentais (`。`, `，`, `、`, `；`, `！`, `？`, `!`, `?`, `.`, `,`), preservando ocorrências isoladas de `XXX` em outras sentenças e bloqueando-as adequadamente.

---

## 3. Matriz de Arquivos Modificados

| Arquivo | Regressões Tratadas | Responsabilidade |
|---|---|---|
| `src/services/moderation/metadataModerator.ts` | **R-05** | Delimitação pontual e não-gulosa do placeholder `例如` contra pontuações CJK. |
| `src/utils/catalogSharder.ts` | **R-03, R-04** | Aborto pré-promoção em falha de backup, expurgo de páginas órfãs no rollback e preservação de `rollbackDir` em falhas. |
| `scripts/sync-workshop.ts` | **R-01, R-02** | Flag `publicationStarted`, rollback fiel a `originalRawBytes` (incluindo `[]` e inexistência) e guarda contra sobrescrita de rebuild concluído. |
| `scripts/rebuild-catalog.ts` | **R-01** | Flag `publicationStarted` e detecção de alteração externa sob o lock de escrita. |

---

## 4. Evidências de Testes e Validação Completa

### 1. Testes Automatizados (`npm test`)
Execução de toda a suíte de testes do projeto, incluindo os testes de auditoria (`tests/nsfwAudit.test.mjs`) e os novos testes de reauditoria (`tests/nsfwReaudit.test.mjs`):

```text
✔ reaudit política: Unrated/ausente permitido; rating restritivo, texto e blacklist prevalecem (0.77ms)
✔ reaudit texto: padrões adultos nos três campos e exceção Skyline sem liberar rule34 (1.23ms)
✔ reaudit rollback: falha transitória promovendo index.json restaura hashes e provider (11.93ms)
✔ reaudit rollback: falha transitória promovendo pages/000001.json restaura hashes e provider (7.07ms)
✔ reaudit rollback: falha transitória promovendo pages/000002.json restaura hashes e provider (9.79ms)
✔ reaudit rollback: falha no staging não modifica geração anterior (6.53ms)
✔ reaudit rollback: falha de limpeza de shard obsoleto restaura geração anterior (11.04ms)
✔ reaudit N05: expansão com falha não deve deixar páginas novas após rollback (7.14ms) [R-03 CORRIGIDO]
✔ reaudit N05: falha de backup de página deve abortar antes da promoção e preservar provider (6.64ms) [R-04 CORRIGIDO]
✔ reaudit rebuild: falha transitória em página restaura consolidado e shards e preserva backup (9.45ms)
✔ reaudit N05: sync com catálogo vazio deve restaurar vazio se falhar promoção dos shards (6.15ms) [R-02 CORRIGIDO]
✔ reaudit N05: sync não deve desfazer rebuild concluído entre leitura e aquisição do lock (6.17ms) [R-01 CORRIGIDO]
✔ reaudit N09: placeholder chinês não deve esconder outra ocorrência XXX (0.31ms) [R-05 CORRIGIDO]

ℹ tests 158
ℹ suites 36
ℹ pass 158
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 889.84ms
```

- **Total**: 158 aprovados, 0 falhas, 0 pendentes.

### 2. Verificação de Tipos (`npm run typecheck`)
- TypeScript compiler (`tsc -b && tsc -p tsconfig.scripts.json`): **0 erros**.

### 3. Build de Produção (`npm run build`)
- Compilação Vite e Rollup concluídos com sucesso (**0 erros**).

---

## 5. Limitações Remanescentes e Salvaguardas

1. **Escopo Semântico de Texto**: O sistema não implementa análise sintática de linguagem natural completa (ex: negações compostas como `Not NSFW`). Casos ambíguos ou evasões extremas sem metadados declarados devem ser endereçados via blacklist manual (`config/blocked-wallpapers.json`).
2. **Caminho Firestore**: O script `scripts/sync-firestore.ts` permanece catalogado como secundário e legado. A fonte primária de dados do aplicativo é 100% JSON-First estática.
3. **Ambiente Remoto Inviolado**:
   - Nenhuma chamada real à Steam Web API foi executada.
   - Nenhuma conexão ou escrita ao Firestore foi disparada.
   - Nenhum comando `git push` foi realizado.
   - O catálogo real (`public/data/catalog.json`) permanece intacto com seus 178 wallpapers legítimos originais.
