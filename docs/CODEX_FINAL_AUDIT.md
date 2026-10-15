# Auditoria final de regressões — WallpaperGallery

**Veredito: APROVADO.**

Data: 15/10/2026, America/Sao_Paulo. Commit verificado: **`484b093`**, branch `main`. Escopo fechado: **R-01 a R-05** da [segunda auditoria](CODEX_NSFW_REAUDIT.md). Relatório confrontado: [NSFW_FINAL_FIX_REPORT.md](../NSFW_FINAL_FIX_REPORT.md).

As cinco regressões foram corrigidas nos cenários auditados. Os **158 testes existentes passaram**, sem skips/todos, e **oito testes adicionais** de cobertura necessária também passaram. Não foi reproduzido defeito relevante de integridade diretamente relacionado a essas correções.

**Recomendação:** encerrar esta etapa de estabilização R-01 a R-05 e avançar para a validação funcional local do frontend com os **178 wallpapers reais**. Esta aprovação não executa nem autoriza sincronização real, acesso ao Firebase, deploy ou push.

## 1. Estado inicial e método

O HEAD local corresponde ao commit solicitado. Inspecionamos histórico, diff das quatro implementações alteradas, relatório do Gemini e testes. Não havia AGENTS.md encontrado no workspace. Havia uma alteração preexistente em `NSFW_FINAL_FIX_REPORT.md`: uma linha em branco adicional ao final; foi preservada integralmente.

Nenhum código de produção nem teste existente foi alterado. Foram criados somente este relatório e [tests/nsfwFinalAudit.test.mjs](../tests/nsfwFinalAudit.test.mjs). As validações usam código de produção com filesystem real em diretórios temporários e injeção pontual de falhas de I/O. O transporte Steam é substituído por Response sintética; cwd temporário sem `.env` e credenciais fictícias. Hooks, cwd, argumentos e variáveis temporárias são restaurados em finally.

Comparamos inventário de caminhos JSON, hashes SHA-256 e, quando aplicável, bytes originais. O teste de recuperação incompleta verifica que o backup completo continua disponível e permite restaurar o fixture manualmente. Não se pressupõe que todo erro duplo de I/O possa ser reparado automaticamente.

## 2. Resultado individual

| Regressão | Resultado | Evidência e verificação |
|---|---|---|
| **R-01 — sync não desfaz rebuild concluído** | **CORRIGIDO** | `publicationStarted` só passa a true depois de substituir o consolidado. O guard compara snapshot e estado atual sob o lock; se outro rebuild já concluiu, aborta sem restaurar conteúdo antigo. O cenário determinístico original passou, preservando inventário e hashes da geração do rebuild. O rebuild também recebeu guard e flag. |
| **R-02 — preenchido, vazio ou inexistente** | **CORRIGIDO** | Existência prévia é separada da quantidade de itens. O sync preserva `originalRawBytes`, restaura também `[]` e remove o consolidado criado pela tentativa se antes não existia. Três testes adicionais injetaram falha na promoção do índice e confirmaram inventário idêntico, bytes exatos para arquivos existentes e ausência do arquivo na primeira publicação abortada. |
| **R-03 — páginas órfãs** | **CORRIGIDO** | `originalPageFiles` registra o inventário anterior. Em rollback, páginas novas são removidas e antigas restauradas. O teste de expansão de uma para três páginas com falha na terceira passou comparando todos os caminhos e hashes, sem página 2 órfã. |
| **R-04 — backup e falha de recuperação** | **CORRIGIDO** | Erros no preparo do backup propagam antes de `promotionStarted`. Falhas de cópia de manifesto, índice e página foram testadas separadamente: zero promoções e JSONs anteriores intactos. Uma falha adicional na própria recuperação manteve o rollback completo, confirmado por hashes e resgate manual no fixture. |
| **R-05 — placeholder XXX** | **CORRIGIDO** | Regex não guloso e limitado por pontuação CJK impede que o exemplo consuma a ocorrência XXX seguinte. O cenário nominal bloqueia; placeholders legítimos e ocorrências independentes foram testados em título, descrição e tags. As regras anteriores de moderação continuam passando na suíte existente. |

Referências R-01: [scripts/sync-workshop.ts:661](../scripts/sync-workshop.ts#L661), [scripts/sync-workshop.ts:669](../scripts/sync-workshop.ts#L669), [scripts/sync-workshop.ts:686](../scripts/sync-workshop.ts#L686), [scripts/rebuild-catalog.ts:156](../scripts/rebuild-catalog.ts#L156), [tests/nsfwReaudit.test.mjs:184](../tests/nsfwReaudit.test.mjs#L184).

Referências R-02: [scripts/sync-workshop.ts:564](../scripts/sync-workshop.ts#L564), [scripts/sync-workshop.ts:688](../scripts/sync-workshop.ts#L688), [tests/nsfwFinalAudit.test.mjs:59](../tests/nsfwFinalAudit.test.mjs#L59).

Referências R-03: [src/utils/catalogSharder.ts:242](../src/utils/catalogSharder.ts#L242), [src/utils/catalogSharder.ts:342](../src/utils/catalogSharder.ts#L342), [tests/nsfwReaudit.test.mjs:139](../tests/nsfwReaudit.test.mjs#L139).

Referências R-04: [src/utils/catalogSharder.ts:289](../src/utils/catalogSharder.ts#L289), [src/utils/catalogSharder.ts:294](../src/utils/catalogSharder.ts#L294), [src/utils/catalogSharder.ts:351](../src/utils/catalogSharder.ts#L351), [src/utils/catalogSharder.ts:365](../src/utils/catalogSharder.ts#L365), [tests/nsfwFinalAudit.test.mjs:79](../tests/nsfwFinalAudit.test.mjs#L79), [tests/nsfwFinalAudit.test.mjs:99](../tests/nsfwFinalAudit.test.mjs#L99).

Referências R-05: [src/services/moderation/metadataModerator.ts:72](../src/services/moderation/metadataModerator.ts#L72), [tests/nsfwReaudit.test.mjs:202](../tests/nsfwReaudit.test.mjs#L202), [tests/nsfwFinalAudit.test.mjs:127](../tests/nsfwFinalAudit.test.mjs#L127).

## 3. Matriz de falhas exercitadas

| Cenário | Resultado observado |
|---|---|
| Sync encontra rebuild concluído entre leitura e lock | Guard aborta; não desfaz o rebuild; mesmos JSONs e hashes. |
| Falha no staging do índice | Geração anterior intacta. |
| Falha na promoção do índice dos shards | Rollback restaura a geração anterior. |
| Falha na promoção da primeira ou segunda página | Inventário/hashes restaurados; provider de produção continua funcionando. |
| Falha de limpeza de shard obsoleto | Erro propagado e geração anterior restaurada. |
| Falha na página 3 durante expansão de uma para três páginas | Páginas novas removidas; caminhos e hashes originais recuperados. |
| Rebuild falha na promoção de página | Consolidado e shards recuperados; backup do consolidado preservado byte a byte. |
| Sync falha na promoção com consolidado preenchido | Bytes originais com tabs/CRLF preservados, além dos hashes de todos os JSONs. |
| Sync falha na promoção com consolidado `[]` | Arquivo vazio original restaurado byte a byte. |
| Sync falha na primeira publicação sem consolidado/shards anteriores | Nenhum arquivo JSON da tentativa permanece publicado. Diretórios vazios não contam como corrupção de catálogo. |
| Falha na cópia para backup de manifesto, índice ou primeira página | Aborto sem executar rename de promoção; geração anterior intacta. |
| Falha na promoção seguida de falha na restauração do manifesto | Erro de recuperação registrado; backup completo preservado. Resgate manual no fixture recompõe exatamente os hashes originais. |

No último cenário, não alegamos recuperação automática concluída ou disponibilidade imediata da geração publicada: a própria restauração recebeu um erro injetado. O requisito R-04 é preservar os arquivos necessários ao resgate, e isso foi demonstrado. Não se reprova por ausência de atomicidade absoluta ou por falha persistente de armazenamento.

A criação/preparação dos shards continua usando staging local. Os locks não transformam vários arquivos numa única operação atômica, mas as guardas e a recuperação testada atendem ao escopo pessoal definido nesta missão.

## 4. Testes e comparação com a versão anterior

| Comando/verificação | Resultado |
|---|---|
| `npm test`, antes de acrescentar cobertura | **158 aprovados**, 36 suites, zero falhas, skips ou todos. |
| Oito testes complementares | **8 aprovados**, cobrindo R-02, R-04 e R-05. |
| `npm test`, incluindo complementares | **166 aprovados**, 36 suites, zero falhas, skips ou todos. Exit code 0. |
| `npm run typecheck` | Aprovado, sem erros. |
| `npm run build` | Aprovado; permanece aviso conhecido de chunk Firestore de aproximadamente 570 kB, fora do escopo destas regressões. |

Os oito casos adicionais não substituem testes existentes. Chamam `syncMain`, `writeCatalogShardsSync`, normalizador, particionador e moderador reais; somente transporte e operações específicas de filesystem recebem substituições para simular falhas.

### Preservação das expectativas

`git diff c6d6f73 484b093 -- tests/` mostra somente a inclusão de `tests/nsfwReaudit.test.mjs`. Esse arquivo havia sido criado sem commit na segunda auditoria; portanto não existe blob dele no commit pai para uma comparação Git direta. Essa limitação não foi ocultada.

A comparação manual com os casos e asserções registrados na segunda auditoria confirma os mesmos **13 casos**: inventário e hashes continuam sendo comparados, IDs esperados pelo provider são preservados, a intercalação sync/rebuild permanece, e a expectativa do placeholder é `blocked`. Nenhum caso foi removido ou convertido em aprovação de corrupção. Os demais testes já rastreados não foram modificados por esse commit.

O arquivo atual também foi comparado ao blob de `484b093`, sem diferenças. SHA-256 de `tests/nsfwReaudit.test.mjs`: `e924461367b06ea586844a6d75ab0c64b3029b084fe5a61c418d3c2c29ed4691`.

O teste de backup continua esperando aborto; após a correção, a falha de promoção secundária nem precisa ser atingida, pois o erro de backup já interrompe o fluxo. Os testes complementares verificam isso explicitamente com contador de promoções igual a zero. Não foi necessário enfraquecer expectativa para ficar verde.

## 5. Estado dos dados reais — somente leitura

Usamos o gerador de shards em memória, com o generatedAt e pageSize existentes, para comparar as estruturas. Não executamos sync ou rebuild sobre dados reais.

| Verificação | Resultado |
|---|---|
| Consolidado | **178 itens, 178 IDs únicos**. |
| Manifesto | totalItems 178, totalPages 8; igual à estrutura recalculada. |
| Índice | Igual ao índice recalculado. |
| Páginas | 24, 24, 24, 24, 24, 24, 24 e 10 itens; total 178. |
| Conteúdo por ID | Payload idêntico entre consolidado e páginas. |
| Shards obsoletos | Nenhum. |
| Simulados na fonte real | Zero. |
| Backups anteriores | Dois JSONs válidos, com 200 e 178 itens; conteúdo preservado por hash. |

Foram preservados por hash: `.env`, código de produção, scripts, testes existentes, arquivos públicos, backups e a modificação preexistente do relatório do Gemini. Nenhum segredo foi impresso. O build atualiza apenas seus artefatos ignorados em dist/.

## 6. Problemas remanescentes comprovados e recomendação

**Nenhum problema relevante reproduzível permaneceu dentro do escopo R-01 a R-05.** Não reabrimos achados antigos de outros fluxos nem buscamos novas refatorações ou otimizações.

É adequado **avançar para a validação funcional do frontend com o catálogo real atual**. Isso deve validar galeria, busca, filtros, detalhes e mídia como próxima etapa, sem confundir aprovação das regressões de catálogo com validação visual já realizada.

Futuras sincronizações continuam dependendo de autorização específica. Não houve chamada Steam real, acesso/escrita Firebase, execução de workflow, deploy, push, alteração de `.env`, edição do catálogo ou exclusão de backups reais. Nenhum commit foi criado, e nenhuma correção automática foi aplicada.
