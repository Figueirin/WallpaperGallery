# Firestore Spark — arquitetura e operação controlada

## Estado verificável

A arquitetura escolhida foi mantida: Steam → sincronizador Node/Admin SDK → coleção `wallpapers` → provider Firebase Client → React. Mídia permanece em URLs externas; não armazenamos binários no banco. `.env` e contas de serviço são locais e ignorados pelo Git. Nenhuma configuração do console, regra, índice, IAM ou faturamento foi alterada ou validada remotamente.

As regras locais permitem leitura pública de `wallpapers` e `sync_metadata`, negam escrita pelo cliente e negam outras coleções. O Admin SDK não depende dessas regras para autorizar escrita: requer conta dedicada com privilégio mínimo, a ser revisada pelo proprietário. Não há ADC implícito. `FIREBASE_PROJECT_ID` explícito deve coincidir com `project_id` da conta de serviço.

## Custos e limites

A [cota gratuita oficial](https://firebase.google.com/docs/firestore/quotas) inclui 50.000 leituras e 20.000 gravações por dia, 1 GiB de armazenamento e 10 GiB de transferência por mês. Esses limites não são garantia de disponibilidade, e devem ser verificados no console do projeto antes da primeira execução. Nenhum plano pago foi ativado.

O frontend da fase inicial lê no máximo 301 documentos: suporta até 300 e informa erro se houver mais, evitando resultados silenciosamente truncados. A ordenação é local e inclui documentos sem `stats.subscriptions`. Uma promise compartilhada evita duplicar a leitura inicial por concorrência. O cache vive na instância do provider e não é compartilhado entre visitantes nem abas. Para 200 itens, estime cerca de 200 leituras por carga inicial; revisitas e abas novas voltam a consumir cota.

A sincronização consulta os documentos de entrada com `getAll`, compara o conteúdo e grava somente novos/alterados. Para até 200 entradas há até 200 leituras de comparação, até 200 escritas de documentos e uma escrita de status por execução bem-sucedida. Estatísticas novas causam escrita mesmo sem mudança de `time_updated`. Dados ausentes não apagam estatísticas anteriores. A contagem de status é do lote, não do total da coleção.

Os batches são renovados após 400 operações. A CLI mantém teto de 200; o helper foi testado com 401 para exercitar dois commits. A operação inteira não é atômica entre batches/status. Se houver falha parcial, não publica novo status `completed`; reexecutar converge pelo conteúdo já gravado. O status antigo não representa confirmação da tentativa que falhou. Não existe checkpoint de cursor, exclusão de itens removidos, lease distribuído ou controle global de consumo diário. Não execute sincronizadores concorrentes.

## Configuração pelo proprietário — pendente

Confirmar projeto, região, plano Spark sem faturamento, regras/índices implantados e conta dedicada com acesso mínimo. Não siga estas instruções como autorização para implantar recursos nesta sessão.

Cliente: `VITE_DATA_PROVIDER=firestore`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID` e demais campos públicos do exemplo. Ausência de configuração causa erro explícito; não há fallback para mock.

Backend: `STEAM_API_KEY`, `FIREBASE_PROJECT_ID` e uma de `FIREBASE_SERVICE_ACCOUNT_PATH` ou `FIREBASE_SERVICE_ACCOUNT_KEY`. Nunca use prefixo `VITE_` em segredos privados. A conta deve pertencer ao destino explícito. Arquivos de chave não devem ser versionados.

## Validação autorizada nesta auditoria

```bash
npm test
npm run typecheck
npm run build
npm run sync:firestore -- --mock-data --limit=200
```

Dry-run exige mock explícito, não acessa Steam nem inicializa Admin SDK. `insertedCount` nesse modo representa escritas planejadas, não dados persistidos. Os testes de escrita usam fake estrito, não um banco real ou emulador.

## Primeira sincronização — NÃO executada e ainda NÃO autorizada

Somente após o proprietário enviar `AUTORIZO A PRIMEIRA SINCRONIZAÇÃO DE 200 WALLPAPERS.`, configurar `WALLPAPER_SYNC_AUTHORIZATION` com a frase exata no ambiente e validar o destino/credenciais, o comando será:

```bash
npm run sync:firestore -- --real --authorize-real-sync --limit=200
```

`--real` sem flag e confirmação, sem chave, sem projeto ou com `--mock-data` falha. A mesma proteção existe na função exportada, independentemente da CLI. Nenhum workflow permite operações reais.

Após a execução expressamente autorizada, o proprietário deverá verificar os documentos e status no destino esperado. Essa validação real permanece pendente. Não houve implantação nem operação remota nesta auditoria.

## Decisões pendentes

Paginação remota deve definir semântica para pesquisa/filtros globais antes de ultrapassar 300 itens. Cobertura histórica por cursor, política de itens removidos/privados, App Check, CSP/hosting, IAM/WIF e observabilidade exigem trabalho adicional. Firestore Spark continua a arquitetura; não foi substituído por shards JSON.
