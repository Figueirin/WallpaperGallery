# CODEX_CHANGELOG

Data: 14/10/2026, America/Sao_Paulo. Base: `5223d37`, branch `main`.

## Estado inicial e preservação

Havia alterações preexistentes em sete arquivos, cada uma com uma linha em branco adicional ao final: `.github/workflows/sync-firestore.yml`, `docs/FIREBASE_MIGRATION_GUIDE.md`, `firebase.json`, `firestore.indexes.json`, `firestore.rules`, `scripts/sync-firestore.ts` e `tests/firestoreSync.test.mjs`. Elas foram preservadas no working tree e excluídas dos commits do Codex por staging seletivo. Nenhuma alteração funcional foi feita nos três arquivos de configuração/regras/índices Firebase. O `.env` real não foi editado; sua permissão 0644 permanece decisão do proprietário.

## Arquivos e finalidade

| Arquivos | Alteração |
|---|---|
| `scripts/sync-workshop.ts` | Enum Steam, validação CLI, confirmação real, mock separado, remoção de fallback, normalização determinística, merge de conteúdo/stats, timeout/retry, filtro de indisponíveis, dedup, proteção do catálogo com lock/rename. |
| `scripts/sync-firestore.ts` | Confirmação também na função, proibição de mock real, destino explícito/conta compatível, sem ADC; serialização, getAll, comparação canônica, lotes novos, status sem total fictício, encerramento do app. |
| `.github/workflows/sync-catalog.yml`, `.github/workflows/sync-firestore.yml` | Somente validação offline manual; sem cron, secrets ou push; permissões read, npm ci estrito, timeout e concurrency, Node 24. |
| `src/utils/validateWallpaper.ts`, `src/utils/safeUrls.ts` | Validação de dados, esquemas de mídia e geração de links Steam apenas a partir de IDs reais. |
| `src/services/providerFactory.ts`, `src/services/mockProvider.ts` | Fontes mock/catalog/firestore explícitas, erro sem fallback sintético, catálogo validado. |
| `src/services/firestoreProvider.ts` | Promise compartilhada e recuperável, validação de documentos, erros propagados, itens sem subscriptions incluídos, erro explícito acima de 300. |
| `src/App.tsx` | Erro de configuração apresentado pelo fluxo de erro existente, versão de requisição, trava de paginação, dedup, decode seguro, hashchange, aviso de demonstração, detalhe keyed por ID. |
| `src/components/WallpaperCard.tsx` | Selo de demonstração, links Steam derivados/ocultos para mock, botão de título nativo, foco com preview. |
| `src/components/WallpaperDetailView.tsx` | Limpa estado antigo, trata data ausente, sinaliza demonstração, restringe links e remonta mídia por ID. |
| `src/components/WallpaperMedia.tsx` | Validação de URLs, sandbox sem same-origin, referrer reduzido, remoção de permissões YouTube desnecessárias, proteção de promises de play obsoletas, retry por remontagem. |
| `src/utils/mediaFormats.ts` | Parser de URL YouTube por hostname e ID completo; rejeita hosts falsos. |
| `src/utils/filterWallpapers.ts`, `src/utils/recommendations.ts` | Paginação finita/positiva e deduplicação real das recomendações por ID. |
| `public/data/catalog.json` | Três exemplos marcados `isSimulated: true`; conteúdo preservado, sem apresentá-los como reais. |
| `index.html` | Referrer-Policy via meta no-referrer. |
| `package.json`, `tsconfig.scripts.json` | Test runner offline com contagem individual e typecheck dos scripts; nenhuma dependência nova, lockfile intacto. |
| `tests/helpers/offline.mjs` | Bloqueio de fetch/HTTP/HTTPS/TCP/TLS e remoção de credenciais do ambiente dos testes. |
| `tests/syncSafety.test.mjs` | Escrita de 200/401 itens com fake estrito, idempotência, falha parcial, autorização, mock, catálogo corrompido, parâmetros e transporte. |
| `tests/providers.test.mjs` | Concorrência/retry do provider, limite de catálogo, dados sem subscriptions, erro e contaminação da fonte JSON. |
| `tests/catalogSync.test.mjs`, `tests/firestoreSync.test.mjs`, `tests/recommendations.test.mjs` | Expectativas corrigidas para metadados ausentes e configuração explícita, regressão de duplicatas. Nenhum teste foi desativado. |
| `.env.example`, `README.md`, `STEAM_API_SETUP.md`, `docs/FIREBASE_MIGRATION_GUIDE.md`, `PROJECT_CONTEXT.md` | Comandos revisados, limites e autorização descritos, registro antigo identificado como histórico. |
| `CODEX_AUDIT_REPORT.md`, `CODEX_CHANGELOG.md` | Auditoria independente, confronto dos 40 achados, evidências, decisões e validação. |

## Testes e resultados

Inicial: `npm test` sem falhas, porém este ambiente reportou seis arquivos em vez dos casos individuais; não usamos essa contagem como evidência de cobertura. Build inicial aprovado, JS 879,95 kB, aviso de chunk acima de 500 kB. Node/npm não estavam no PATH inicial; usamos a instalação existente Node 24.22.0 em `~/.nvm`, sem instalar pacotes.

Final: **95 testes, 28 suites, 95 aprovados, zero falhas**, executados com rede bloqueada, fakes e fixtures. `npm run typecheck` aprovado para frontend, Vite e scripts. `npm run build` aprovado: JS 881,45 kB (240,83 kB gzip), aviso de tamanho permanece. Não há lint configurado, portanto nenhum resultado de lint é reivindicado.

`npm run sync:firestore -- --mock-data --limit=200`: aprovado, 200 itens simulados, `isDryRun: true`; zero gravações. Contador de inserções nesse modo é planejamento. CLI mock do JSON foi testada em diretório temporário; corrupção do catálogo preservou bytes originais. Fake de persistência rejeita undefined aninhado e reutilização de batch; falha no segundo commit seguida de reexecução resulta em 401 documentos íntegros sem duplicação. O provider usa SDK só para construir referências locais; getDocs/getDoc de teste são fakes.

Não executados: Steam real, Firebase real, emulador de regras, browser/Playwright, lint inexistente, npm audit/outdated, fetch Git ou workflows remotos. Build/typecheck não equivalem a validação visual ou em produção.

## Commits locais

1. `0ec41df` — `fix(sync): guard real operations and validate offline writes`.
2. `ba1dc6c` — `fix(gallery): separate data sources and reject stale results`.
3. `0d922f2` — `fix(sync): reject malformed normalized Steam metadata` (valida payload normalizado antes de qualquer catálogo; regressão para estatística inválida).
4. Commit desta documentação: `docs(audit): record independent findings and operating limits`. O hash pode ser obtido por `git log -1 --oneline`, evitando autorreferência no conteúdo do próprio commit.

Os diffs staged foram revisados e `git diff --cached --check` não encontrou erros. O diff do working tree contém as linhas em branco preexistentes; não foram removidas para satisfazer o check.

## Decisões e trabalho pendentes

Firestore Spark mantido, sem mudanças arquiteturais grandes. Pendentes: cursor/checkpoint de varredura histórica, paginação remota com busca/filtros globais, política de itens removidos/privados e classificação desconhecida, IAM/WIF, App Check, CSP/hosting e rewrite SPA, SHA das actions, lint, bundle e testes de navegador. Antes de usar `VITE_DATA_PROVIDER=catalog`, arquivar/substituir os três exemplos sinalizados por dados reais; atualmente a validação rejeita esse catálogo propositalmente.

## Checklist de segurança

- [x] Sem push, PR remoto, rebase ou alteração do histórico existente.
- [x] Sem coleta Steam real, gravação remota Firebase, implantação ou alteração de faturamento.
- [x] Sem ativação/execução de automação externa.
- [x] Sem edição do `.env` real ou exposição de valores secretos.
- [x] Busca exata por valores privados conhecidos: zero ocorrências na árvore versionável e histórico; zero blocos de chave privada e zero arquivos secretos rastreados. Esta busca não garante ausência de todo segredo desconhecido.
- [x] Workflows locais sem eventos automáticos, secrets ou permissões de escrita.
- [x] Testes offline, build e typecheck aprovados.
- [x] Trabalho preexistente preservado fora dos commits.
- [ ] Autorização expressa para primeira sincronização real de 200 wallpapers — **não concedida nesta sessão**.
- [ ] Configuração remota, regras implantadas e privilégios mínimos — **não verificados**.
- [ ] Validação em produção — **não realizada**.
