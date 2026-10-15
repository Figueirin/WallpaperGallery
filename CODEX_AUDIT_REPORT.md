# CODEX_AUDIT_REPORT

Data: 14/10/2026 (America/Sao_Paulo). Repositório local `WallpaperGallery`, branch `main`, base inicial `5223d37`. Sem fetch; referências de origin são apenas snapshots locais. Relatório independente realizado antes de confrontar o documento do Claude.

## Resumo executivo

Confirmamos bloqueadores de integridade e autorização: cron com push automático, mistura de mock em gravação real, consultas Steam invertidas, undefined na escrita Firestore, fallback de configuração e catálogo demonstrativo sem identificação. Esses bloqueadores foram corrigidos localmente. A escrita foi exercitada com fakes estritos, sem inicializar banco remoto: 200 documentos, idempotência, preservação de stats, renovação de lote e recuperação após falha parcial.

**Não está validado para produção. Nenhuma primeira coleta foi autorizada ou executada.** Os 95 testes, typecheck e build passam, mas faltam validação de navegador, ambiente remoto, cobertura histórica, paginação acima de 300 itens e decisões operacionais. Não trocamos Firestore Spark de arquitetura.

## Reconhecimento e inventário

Antes de editar, examinamos a árvore de arquivos, documentação, scripts, workflows, componentes, regras/índices e histórico relevante. Não havia AGENTS.md encontrado no workspace. Working tree inicial: sete arquivos com uma linha vazia adicional, listados no changelog; todos preservados. HEAD inicial 5223d37; histórico relevante: 055d879 introduziu automação JSON, e911964 sincronizador Firestore, 8e89268 provider/regras, 2a3efc5 configuração Firebase. Não alteramos commits anteriores.

| Área | Inventário e fluxo |
|---|---|
| Frontend | React 19, TS 5.7, Vite 6, Tailwind 4; galeria, filtros, detalhe, mídia, recomendações, scroll progressivo. |
| Dados | IWallpaperDataProvider → filtro/ordenação/paginação em memória → componentes. Antes mock tentava JSON real e caía em sintético; agora mock/catalog/firestore são explícitos. |
| JSON | Steam QueryFiles → normalização → merge → lock/arquivo temporário/rename. Mock separado; metadados ausentes preservados como desconhecidos. |
| Firestore | Steam → até 200 itens → getAll/compare → batches condicionais → status. Cliente somente leitura conforme regras locais. |
| Recursos | Catálogo legado 3 exemplos agora marcados; mock de 16 itens e três arquivos de vídeo locais. Nenhuma mídia real gerada/baixada. |
| Execução | Node 24.22.0 existente; dependências e package-lock intactos; nenhuma instalação necessária. |
| Ferramentas | Testes Node, typecheck frontend/Vite/scripts, Vite build. Sem configuração de lint. |
| Workflows | Ambos só workflow_dispatch de validações offline; contents:read, npm ci, timeout/concurrency. Sem secrets, schedule, push ou sincronização real. |

Baseline local: npm test reportou seis arquivos aprovados, build passou com JS de 879,95 kB e aviso de chunk. A execução final usa test-isolation=none para relatar casos individuais, com preloader que impede rede e remove credenciais. Não consideramos o resultado inicial prova de cobertura da persistência.

## Achados independentes e correções

P0: bloqueios na função e CLI impedem mock real, chave ausente, projeto implícito e execução sem confirmação. Confirmação operacional exige a frase expressa e flag; não equivale a permissão dada ao agente. Os workflows não têm mais caminho de escrita. Steam usa enum nomeado. Serialização e persistência foram separadas da inicialização para testar o caminho efetivo de batch com fake.

P1: merge compara conteúdo completo e preserva stats ausentes; catálogo inválido não é substituído; escrita atômica com lock evita corrupção concorrente local. Normalização não inventa data, resolução ou thumbnail. Itens indisponíveis retornados são filtrados. Rede Steam tem timeout/retry finitos e erros sem corpo HTTP/URL privada. Provider compartilha carga, valida documentos e propaga erros; App descarta respostas obsoletas. Mídias aceitam HTTPS ou caminhos locais restritos; demo exige HTTPS e sandbox sem same-origin. Links Steam derivam do ID e ficam indisponíveis em mock.

Achados adicionais ao registro WG:

| ID | Evidência | Impacto e tratamento |
|---|---|---|
| CX-01 | src/utils/recommendations.ts, candidates; teste com ID repetido real | O teste anterior afirmava ausência de duplicatas usando entrada sem repetição. Implementação podia devolver ID duplicado. Dedup por Map e regressão adicionados. |
| CX-02 | src/App.tsx, decodeURIComponent/hashchange | URI malformada podia derrubar inicialização; alterações de hash não atualizavam navegação. Decode protegido e listener com cleanup. Sem teste em navegador. |
| CX-03 | src/utils/filterWallpapers.ts, safePage/safePageSize | Infinity ou fração inferior a 1 podia gerar slices vazios/tamanho zero. Agora finitos e pelo menos 1 antes de floor. |
| CX-04 | src/services/firestoreProvider.ts, docToWallpaper; src/utils/validateWallpaper.ts | Cast e defaults ocultavam documentos inválidos e inventavam metadados. Validação explícita; cache só publicado após validar todo snapshot. |
| CX-05 | scripts/sync-firestore.ts, snapshots de persistWallpapers | Reutilizar documento simulado anterior poderia preservar campos enriquecidos falsos em merge real. Agora rejeita coleção contaminada antes de enfileirar batches; teste negativo adicionado. |
| CX-06 | src/utils/mediaFormats.ts, extractYouTubeVideoId | Regex original aceitava domínio enganoso contendo youtube.com no caminho. Parser verifica hostname, HTTPS e ID completo. |

## Confronto dos 40 achados do Claude

O arquivo nominal `WALLPAPERGALLERY_AUDIT_REPORT.md` não estava no repositório. Encontramos o relatório completo fornecido pelo usuário em `../auditoriaclaude.md`, com o mesmo título e WG-01 a WG-40. Ele foi lido após a análise independente; não foi alterado. Classificações abaixo descrevem a evidência **no estado inicial**, e a última coluna diferencia correção e pendência atuais. Referências apontam código atual; o baseline pode ser consultado por `git show 5223d37:caminho`. Nenhum achado estava já corrigido no baseline, e nenhum foi considerado falso positivo integral; alguns exageravam impacto ou dependiam de configuração não conhecida.

| ID | Classificação | Prioridade independente | Código/evidência | Impacto verificado | Tratamento atual/proposto |
|---|---|---|---|---|---|
| WG-01 | CONFIRMADO | P0 | [scripts/sync-firestore.ts:152](scripts/sync-firestore.ts#L152) | Baseline main inferia mock pela ausência de chave; dryRun:false aceitava mock. Risco de contaminar banco real. | Corrigido: confirmação na função e CLI, mock proibido, projeto/chave explícitos, conteúdo simulado rejeitado inclusive se já existente. |
| WG-02 | CONFIRMADO | P0 | [.github/workflows/sync-catalog.yml:3](.github/workflows/sync-catalog.yml#L3) | Baseline tinha cron e push com contents:write; publicação futura poderia habilitar coleta automática. | Corrigido localmente: somente dispatch de testes offline, contents:read, sem secrets ou push. Estado remoto não inspecionado. |
| WG-03 | CONFIRMADO | P0 | [scripts/sync-workshop.ts:29](scripts/sync-workshop.ts#L29) | Baseline usava 1 como popular e 0 como recente. Enum oficial Valve confirma inversão. | Corrigido: constantes 0 popular / 1 recente em ambos os sincronizadores; teste inspeciona URL gerada. |
| WG-04 | CONFIRMADO | P0 | [scripts/sync-firestore.ts:103](scripts/sync-firestore.ts#L103) | Normalização produz campos opcionais undefined; baseline fazia batch.set do objeto sem sanitização. | Corrigido: remoção recursiva e rejeição de números não finitos, fake recusa undefined aninhado. |
| WG-05 | CONFIRMADO | P0 | [public/data/catalog.json:32](public/data/catalog.json#L32) | Três exemplos do gerador eram versionados sem sinalizar simulação. | Corrigido: marcados, provider mock explícito com 16 exemplos, badges, links Steam desativados para simulados; catalog real rejeita legado simulado. |
| WG-06 | CONFIRMADO | P0 | [scripts/sync-workshop.ts:505](scripts/sync-workshop.ts#L505) | Baseline sem chave gerava demonstração no catálogo real. | Corrigido: erro, mock somente explícito em demo-catalog.json, bloqueio de mistura e sobrescrita do destino real por mock. |
| WG-07 | PARCIALMENTE CONFIRMADO | P2 | [scripts/sync-workshop.ts:311](scripts/sync-workshop.ts#L311) | Sem cursor/checkpoint; topo popular+recente não garante cobertura histórica. Dizer impossível para qualquer catálogo extrapola a evidência. | Pendente cursor e checkpoint. CLI inicial limitada; não há promessa de catálogo completo. |
| WG-08 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:567](scripts/sync-workshop.ts#L567) | Baseline erro de JSON zerava existingCatalog e sobrescrevia arquivo. | Corrigido: aborta, teste subprocesso verifica bytes originais preservados. |
| WG-09 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:285](scripts/sync-workshop.ts#L285) | Spread de stats undefined apagava valores anteriores. | Corrigido no merge JSON e escrita Firestore; testes preservam subscriptions ausente e atualizam views. |
| WG-10 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:207](scripts/sync-workshop.ts#L207) | Baseline usava now() para criação ausente; mudava a cada execução. | Corrigido: string vazia representa ausência, detalhe mostra Não informada; normalização e idempotência testadas. |
| WG-11 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:373](scripts/sync-workshop.ts#L373) | Baseline ignorava result, banned, visibility. Catálogo incremental retém removidos. | Parcial: resultados retornados indisponíveis são filtrados, AppID divergente rejeitado. Tombstones/revalidação de antigos dependem de política; ausência em página não prova remoção. |
| WG-12 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:342](scripts/sync-workshop.ts#L342) | Sem timeout/retry, falha perdia páginas em memória. | Parcial: 15s, três tentativas para rede/429/5xx, backoff, falha 403 imediata. Não salva páginas/checkpoint; arquivo anterior preservado. |
| WG-13 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:110](scripts/sync-workshop.ts#L110) | Substring Music Video virava tipo Video; resolução/thumbnail eram inventadas. | Corrigido para tipo Video exato, resolução Não informada/Other e preview ausente vazio. Scene e Everyone ainda são defaults do modelo legado; ver limitações. |
| WG-14 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:482](scripts/sync-workshop.ts#L482) | --key aparecia na CLI e no guia; expõe chave no shell/ps. | Corrigido: flag rejeitada e removida dos exemplos operacionais. |
| WG-15 | CONFIRMADO | P1 | [scripts/sync-firestore.ts:124](scripts/sync-firestore.ts#L124) | Baseline só fazia set; contava tudo como inserido apesar da documentação. | Corrigido: getAll, comparação canônica, escrita condicional, inserted/updated/unchanged; status custa uma escrita por execução. |
| WG-16 | CONFIRMADO | P1 | [src/services/firestoreProvider.ts:44](src/services/firestoreProvider.ts#L44) | Metadata e listagem podiam chamar getDocs enquanto a primeira carga ainda estava em curso. | Corrigido: promise compartilhada; fake de concorrência confirma uma carga, com nova tentativa após falha. |
| WG-17 | CONFIRMADO | P2 | [src/services/firestoreProvider.ts:73](src/services/firestoreProvider.ts#L73) | limit(300) truncava silenciosamente; orderBy excluía documentos sem subscriptions. | Parcial: sem orderBy remoto, detecta 301 e falha explicitamente. Paginação global real continua pendente. |
| WG-18 | CONFIRMADO | P2 | [firestore.rules:13](firestore.rules#L13) | Leitura pública permite consumo abusivo de cota. Não prova configuração remota ou cobrança. | Pendente App Check/observabilidade e decisão operacional. Regras locais mantidas, sem implantação. |
| WG-19 | CONFIRMADO | P1 | [src/components/WallpaperMedia.tsx:277](src/components/WallpaperMedia.tsx#L277) | URL Web sem validação e allow-scripts+allow-same-origin criavam risco condicional, especialmente mesma origem. | Corrigido: apenas HTTPS para demo, sandbox allow-scripts sem same-origin, no-referrer. Não alegamos exploit demonstrado nem allowlist definida. |
| WG-20 | CONFIRMADO | P1 | [src/App.tsx:64](src/App.tsx#L64) | Busca e loadMore atualizavam estado sem verificar obsolescência. | Corrigido por versão invalidada no debounce e cleanup, trava síncrona loadMore e dedup. Build/typecheck; interação em navegador ainda não testada. |
| WG-21 | CONFIRMADO | P1 | [tests/syncSafety.test.mjs:45](tests/syncSafety.test.mjs#L45) | Baseline só exercitava simulação, sem escrita ou provider. | Parcial: novos fakes estritos cobrem persistência e provider; componentes/App e regras no emulador continuam sem testes de integração. |
| WG-22 | PARCIALMENTE CONFIRMADO | P1 | [scripts/sync-firestore.ts:136](scripts/sync-firestore.ts#L136) | Batch era reutilizado após commit, porém teto de 200 tornava o ramo de 400 inalcançável na CLI. Não bloqueava a primeira carga por esse motivo. | Corrigido preventivamente no helper: novo batch; 401 itens e falha do segundo commit testados. |
| WG-23 | CONFIRMADO | P1 | [.github/workflows/sync-firestore.yml:4](.github/workflows/sync-firestore.yml#L4) | Inputs eram interpolados no shell; exploração exigia permissão de dispatch. | Corrigido pela remoção de inputs e operação real: workflow só valida offline. |
| WG-24 | CONFIRMADO | P3 | [.github/workflows/sync-firestore.yml:13](.github/workflows/sync-firestore.yml#L13) | Baseline npm ci || npm install, sem timeout/concurrency, actions por tag. | Parcial: npm ci estrito, timeout, concurrency, sem persistência de credenciais. Tags @v4 ainda não fixadas por SHA. |
| WG-25 | CONFIRMADO | P0 | [docs/FIREBASE_MIGRATION_GUIDE.md:43](docs/FIREBASE_MIGRATION_GUIDE.md#L43) | Comando antigo omitia flag de autorização; dry-run imprimia sugestão igualmente incompleta. | Corrigido: comando inclui flag e explica confirmação no ambiente, destino e autorização do proprietário ainda ausente. |
| WG-26 | CONFIRMADO | P1 | [scripts/sync-firestore.ts:167](scripts/sync-firestore.ts#L167) | totalWallpapersInCatalog era tamanho do lote; ADC implícito sem destino rígido. | Corrigido: lastRunCount, projeto obrigatório comparado à conta, app dedicado e deleteApp em finally, sem ADC. |
| WG-27 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:32](scripts/sync-workshop.ts#L32) | Importar sincronizadores carregava .env real inclusive em testes. | Corrigido: load só no main; subprocessos de teste rodam em pasta temporária e com bloqueio de rede, sem .env local. |
| WG-28 | INCONCLUSIVO | P3 | [scripts/sync-workshop.ts:327](scripts/sync-workshop.ts#L327) | Chave na query é confirmada; vazamento efetivo por erros/proxies não demonstrado. | Mitigado: sem corpo HTTP nos erros, falhas de transporte e CLI genéricas, --key rejeitado. Query privada ainda é necessária no transporte atual. |
| WG-29 | CONFIRMADO | P3 | [tsconfig.scripts.json:18](tsconfig.scripts.json#L18) | Build baseline não incluía scripts; nenhum lint configurado. | Parcial: typecheck inclui scripts, sem novas dependências. Lint dedicado permanece ausente. |
| WG-30 | CONFIRMADO | P3 | [src/services/providerFactory.ts:10](src/services/providerFactory.ts#L10) | SDK cliente importado mesmo no mock; build baseline 879,95 kB. | Pendente code splitting; build final 881,45 kB (aprox. 240,83 kB gzip). Sem alteração de dependências. |
| WG-31 | PARCIALMENTE CONFIRMADO | P3 | [index.html:4](index.html#L4) | Sem meta CSP/Referrer; ausência isolada não demonstra vulnerabilidade, e headers do host não foram inspecionados. | Referrer no-referrer implementado. CSP completa depende do host e domínios de mídia; pendente. |
| WG-32 | CONFIRMADO | P3 | [src/components/WallpaperCard.tsx:119](src/components/WallpaperCard.tsx#L119) | Article role button continha links; hover era mouse-only. | Corrigido: botão nativo no título, artigo sem role button, foco ativa preview, links independentes. A11y/touch no navegador não validados. |
| WG-33 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:581](scripts/sync-workshop.ts#L581) | writeFileSync direto podia produzir arquivo parcial ou perder atualizações concorrentes. | Corrigido: lock exclusivo + checagem de alteração + temporário + rename. Crash pode deixar lock para inspeção manual. |
| WG-34 | CONFIRMADO | P3 | [src/components/WallpaperMedia.tsx:111](src/components/WallpaperMedia.tsx#L111) | Fallback de erro desmontava video; retry acessava ref nula. | Corrigido: limpa erro e deixa React remontar player; reprodução permanece por controles. Media keyed por ID no detalhe. |
| WG-35 | CONFIRMADO | P1 | [scripts/sync-workshop.ts:38](scripts/sync-workshop.ts#L38) | parseInt/Math.min aceitavam entradas negativas, NaN e fracionárias. | Corrigido: inteiro positivo estrito; teto 200 mantido no Firestore; argumentos desconhecidos rejeitados. |
| WG-36 | PARCIALMENTE CONFIRMADO | P3 | [src/App.tsx:36](src/App.tsx#L36) | Links por pathname requerem fallback no host; firebase.json não define hosting. Não havia escolha de hosting, então falta de rewrite não prova deploy quebrado. | Pendente definir host e rewrite SPA; decode malformado e hashchange corrigidos sem provisionar hosting. |
| WG-37 | CONFIRMADO | Informativo | [STEAM_API_SETUP.md:3](STEAM_API_SETUP.md#L3) | Hex no histórico é placeholder de documentação, não prova de segredo. | Sem incidente constatado. Guia atual evita exemplo com aparência de chave real. |
| WG-38 | CONFIRMADO | Informativo | [CODEX_CHANGELOG.md:7](CODEX_CHANGELOG.md#L7) | Sete arquivos tinham somente linha em branco adicional no início. | Preservados fora dos commits do Codex usando staging seletivo; continuam no working tree. |
| WG-39 | CONFIRMADO | P3 | [README.md:15](README.md#L15) | README quase vazio e guias prometiam 20 itens/automação diária e cursor inexistente. | Corrigido: guias atuais reescritos; PROJECT_CONTEXT identificado como histórico; limites e fontes documentados. |
| WG-40 | CONFIRMADO | Informativo | [CODEX_CHANGELOG.md:7](CODEX_CHANGELOG.md#L7) | stat local confirma modo 0644 do .env. Risco depende de usuários/grupos da máquina. | Não alterado pela proibição de modificar .env real. Proprietário pode decidir chmod 600; conteúdo nunca impresso. |

Classificações iniciais: 35 CONFIRMADO, 4 PARCIALMENTE CONFIRMADO, 1 INCONCLUSIVO.

## Validação, segurança e limitações

95/95 testes aprovados, 28 suites. Typecheck inclui scripts e build aprovou. Fakes de banco recusam undefined e batch já consumido; uma execução idêntica não regrava documentos. Após falha simulada no segundo lote de 401, reexecutar grava só o restante. Testes de provider comprovam carga compartilhada e propagação de erros; transporte usa Response sintética para 429, 403, 503, resposta inválida, dedup e itens indisponíveis. CLI é exercitada em diretório temporário, sem .env real.

A validação offline de 200 itens retorna isDryRun:true. Persistência é **simulada por fake**, não validada em Firebase nem em emulador. Não há teste DOM/RTL/Playwright: corridas de React e comportamento de mídia foram corrigidos por inspeção e compilação, sem reivindicar validação de interação. Emulador de regras, responsividade e contraste não foram executados.

Busca por valores privados conhecidos foi feita em memória, sem imprimi-los: zero ocorrências na árvore versionável e no histórico local; zero arquivos secretos rastreados e blocos de chave privada na árvore. O .env é ignorado e não foi editado. Permissão 0644 é remanescente. Não foi feita auditoria de dependências por rede ou varredura garantida de todos os padrões possíveis de segredo.

Não foram executados push, PR, sincronização Steam, getDocs remoto, gravação Firebase, implantação, alteração de IAM, faturamento, workflows remotos ou ativação de cron. O SDK cliente nos testes apenas constrói referências e os transportes são substituídos. Consultas de rede desta auditoria limitaram-se a documentação pública; nenhum segredo foi enviado.

## Riscos e decisões pendentes

1. Cursor/checkpoint para cobertura histórica Steam e recuperação de páginas ainda não existem. O status Firestore é da execução concluída, não cursor. Após falha preservamos catálogo local anterior; em Firestore reexecutar converge, mas não há transação entre batches/status nem lease distribuído. Executar um sincronizador por vez.
2. O frontend da fase inicial suporta até 300 documentos; 301 gera erro explícito. Paginação remota exige definir busca e filtros globais, que hoje dependem do catálogo carregado. Não ampliamos silenciosamente leituras para um catálogo grande.
3. Não removemos itens antigos por ausência em uma página. Decidir tombstones/revalidação de removidos, banidos e privados antes de prometer catálogo atualizado integralmente.
4. Scene e Everyone seguem defaults legados quando tags faltam; taxonomia Unknown e política de conteúdo Mature/Questionable precisam definição. Datas/resolução/imagem ausentes já não são fabricadas. Estatísticas invalidas causam falha, sem dados inventados.
5. O catálogo JSON legado é demonstração marcada e rejeitada por VITE_DATA_PROVIDER=catalog; o padrão agora mostra os 16 mocks sinalizados. Arquivar/substituir esses três exemplos antes de uma exportação real nesse destino. Firestore não depende desse arquivo.
6. Projeto Spark, regras implantadas, índices, menor privilégio da conta e IAM/WIF não foram verificados. Leitura pública pode esgotar cota; App Check/observabilidade dependem do proprietário. Cache por instância não evita consumo entre visitantes.
7. Hosting e rewrite SPA não foram escolhidos. Referrer restrito implementado; CSP completa e allowlist de domínios de demo dependem das origens aceitas. Iframes com sandbox podem perder funções de terceiros, deliberadamente sem liberar same-origin.
8. Actions ainda usam @v4; fixação por SHA permanece. Bundle final 881,45 kB (240,83 kB gzip) mantém aviso >500 kB. Lazy loading, lint e testes de navegador são próximos trabalhos de qualidade, sem dependências adicionadas nesta auditoria.
9. A primeira sincronização exige autorização expressa do proprietário e validação do destino/configuração. A frase constar no código ou documentação não concede essa autorização. Não reivindicamos sistema pronto para produção.

## Fontes públicas e evidências locais

O enum 0=RankedByVote e 1=RankedByPublicationDate foi conferido na [documentação oficial ISteamUGC](https://partner.steamgames.com/doc/api/ISteamUGC#EUGCQuery) e no [header da Valve](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/public/steam/isteamugc.h). Não confirmamos respostas reais de QueryFiles, limites operacionais da chave nem acesso de conta a endpoints.

A [documentação oficial de cotas Firestore](https://firebase.google.com/docs/firestore/quotas) informa franquias de 50 mil leituras/dia e 20 mil escritas/dia. Para o lote inicial, o código limita até 200 leituras de comparação e até 200 gravações de itens, além de status; não se trata de um orçamento diário global ou garantia de capacidade. Regras de acesso público exigem acompanhamento operacional. Firestore Spark foi preservado.

Para lista de arquivos, comandos executados, commits locais e checklist de segurança, veja [CODEX_CHANGELOG.md](CODEX_CHANGELOG.md).
