# Preparação pré-deploy — WallpaperGallery

> Registro histórico anterior ao deploy. A hospedagem atual usa Workers + Static Assets + Workers Builds, e o catálogo passou a ser o provider padrão. Consulte o [guia atual](CLOUDFLARE_WORKERS_DEPLOY.md) e a [migração](CATALOG_DEFAULT_MIGRATION_REPORT.md).

Data: **15/10/2026**, America/Sao_Paulo. Base inspecionada: **`248cb54`**, branch **`main`**. Parecer: **PRONTO COM RESSALVAS**.

O repositório está preparado para conexão ao Cloudflare Pages, com documentação atualizada e CI de validação. Não houve deploy nem alteração remota. Antes de publicar, o proprietário precisa configurar o provider `catalog` e Node 24 nos ambientes Production e Preview. A configuração do host e a abertura direta das rotas precisarão ser confirmadas no primeiro deploy.

## 1. Estado inicial e escopo

Antes das edições, foram inspecionados status/branch, README, package/lockfile, `.gitignore`, `.env.example`, Vite, workflows, factory de providers, configuração/clientes/scripts Firebase e catálogo.

A única alteração local preexistente era uma linha em branco adicional em `docs/CATALOG_EXPANSION_REPORT.md`. Foi preservada e não pertence ao commit desta tarefa.

O catálogo tem **979 IDs únicos, zero itens simulados, 40 shards e pageSize 25**. As páginas têm 25 itens, exceto a última, com 4. O README ainda descrevia Firestore como arquitetura principal, três itens simulados no consolidado e primeira sincronização pendente; também apontava para `docs/README.md`, que não existe.

Nenhum componente, provider, script de publicação, dependência ou formato do catálogo foi alterado. Não houve nova auditoria geral nem correção do core.

## 2. Arquivos da tarefa

| Arquivo | Alteração |
| --- | --- |
| `README.md` | Reescrito para o catálogo atual, execução, validação, arquitetura, moderação, dados, independência, licença e deploy. Links locais corrigidos. |
| `.env.example` | Comentários esclarecem que `catalog` dispensa Steam/Firebase e deve ser definido em Production e Preview. Mantidos os placeholders e o padrão local `mock`. |
| `.github/workflows/ci.yml` | Novo CI automático de validação para PRs e pushes em `main`/`dev`. |
| `docs/PREDEPLOY_REPOSITORY_REPORT.md` | Este relatório. |

Os relatórios anteriores continuam como registros históricos. Nenhum arquivo foi removido.

## 3. Firebase/Firestore: manter nesta etapa

O provider `catalog` funciona sem Firebase: sua criação retorna `StaticCatalogProvider` em [providerFactory.ts](../src/services/providerFactory.ts#L90); o módulo leve `firebaseEnv.ts` apenas consulta configuração. O SDK não é inicializado por esse caminho.

Pontos dependentes mantidos:

| Ponto | Uso e impacto de remoção |
| --- | --- |
| `src/services/providerFactory.ts` | Seleção opcional de Firestore e proxy lazy; remoção exige mudar a fábrica e contratos/testes. |
| `src/services/firestoreProvider.ts` | Implementação de consultas Firestore, carregada via import dinâmico. |
| `src/config/firebase.ts` | Inicialização do SDK cliente, usada pelo provider legado e testes. |
| `src/config/firebaseEnv.ts` | Verificação leve da configuração pública. |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json` | Configuração, regras e índices do caminho legado; não configuram hosting para este deploy. As regras locais proíbem escrita do cliente; não se verificou o estado de um projeto remoto. |
| `scripts/sync-firestore.ts` e comando `sync:firestore` | Script administrativo legado, com simulação offline e caminho real separado. O caminho real não aplica a política NSFW do sincronizador JSON; não é utilizado no deploy. |
| `firebase` e `firebase-admin` no package/lockfile | SDK cliente e administração. Excluir os pacotes quebraria imports e testes existentes. |
| `.env.example` e guia `docs/FIREBASE_MIGRATION_GUIDE.md` | Configuração de exemplo e documentação histórica do legado. |
| `.github/workflows/sync-firestore.yml` | Validação manual offline, mantida. |
| `tests/providers.test.mjs`, `tests/firestoreSync.test.mjs`, `tests/syncSafety.test.mjs` | Importam SDK/provider/scripts e verificam consultas, segurança e persistência com dependências substituídas. |

**Decisão:** preservar. A remoção envolve provider, scripts, testes, configuração e dependências; ultrapassa uma limpeza pequena. O catálogo de produção é independente desse caminho, logo não há motivo para ampliar o escopo agora. Uma futura remoção deve ser uma mudança separada e validada.

## 4. Bundle verificado

Build Vite de produção com `VITE_DATA_PROVIDER=catalog` e opção `--manifest`, que apenas acrescentou um manifesto de inspeção em `dist/.vite/manifest.json` ignorado pelo Git:

| Saída | Tamanho minificado | Gzip | Carregamento |
| --- | --- | --- | --- |
| `assets/index-CKijjF0H.js` | 324,61 kB | 94,80 kB | Principal |
| `assets/firestoreProvider-B40zZ_yw.js` | 570,23 kB | 149,24 kB | Dinâmico, provider Firestore |
| CSS principal | 41,78 kB | 7,76 kB | Principal |

O manifesto gerado registra Firestore em `dynamicImports`, sem import estático inicial; `dist/index.html` não o inclui em `modulepreload`. Os marcadores `@firebase/firestore` e `firestore.googleapis.com` aparecem apenas no chunk Firestore. O import ocorre no proxy lazy em [providerFactory.ts](../src/services/providerFactory.ts#L42), instanciado somente para `firestore`; o caminho `catalog` não chama o proxy.

Assim, o SDK Firebase não integra o JavaScript inicial do catálogo, embora seu chunk continue disponível no build. A configuração leve e o seletor de provider permanecem no principal. Não foi feita captura de rede em navegador hospedado; a conclusão vem do código e do grafo do bundle. O aviso Vite de chunk acima de 500 kB refere-se ao chunk lazy preservado; não foram adicionados ajustes artificiais de limite ou particionamento.

## 5. Workflows e branches

Novo [ci.yml](../.github/workflows/ci.yml): `pull_request` e pushes em `main`/`dev`; permissões somente `contents: read`, checkout sem persistir credenciais, Node 24, cache npm, timeout de 15 minutos e cancelamento de validações anteriores da mesma referência.

Etapas: `npm ci`, `npm test`, `npm run typecheck`, `npm run build`. Somente a etapa de build define `VITE_DATA_PROVIDER=catalog`. Não há secret, cron, sincronização, deploy, commit ou push. `npm ci` instala dependências do registro no runner; os testes bloqueiam rede pelo preloader existente `tests/helpers/offline.mjs`.

Os workflows manuais `sync-catalog.yml` e `sync-firestore.yml` foram mantidos sem alterações. Ambos validam offline; o segundo usa explicitamente `--mock-data`.

A estrutura do novo YAML foi revisada localmente; nenhum runner remoto foi acionado. Não havia parser YAML instalado no ambiente, e nenhum pacote adicional foi instalado para esta revisão.

Fluxo recomendado: **`main` → produção; `dev` → desenvolvimento/preview**. Não foram criadas branches nem alteradas configurações remotas. Branch protection fica para o proprietário após o CI estar disponível no GitHub.

## 6. Demonstrações preservadas por evidência de uso

| Arquivo | Evidência e decisão |
| --- | --- |
| `public/videos/preview-sample.mp4` | Referenciado por `mock-wallpapers.json` e pela geração simulada do script Firestore. Mantido. |
| `public/videos/preview-sample-2.mp4` | Referenciado em dois itens de `mock-wallpapers.json`. Mantido. |
| `public/videos/preview-sample.webm` | Referenciado por `mock-wallpapers.json`. Mantido. |
| `public/data/mock-wallpapers.json` | Importado por `mockProvider.ts` e usado por testes de filtros, recomendações e paginação. Mantido. |
| `public/data/legacy-simulated-samples.json` | Registro separado dos antigos itens simulados, não consumido pelo provider de produção; o sincronizador conhece esse destino de preservação. Mantido para não eliminar dados históricos nesta limpeza. |

Os exemplos continuam separados do catálogo real. Não há vídeo demonstrativo comprovadamente sem uso entre os arquivos solicitados.

## 7. Integridade e segurança do estado atual

Inspeção dos dados somente em leitura, usando `createCatalogShards` de produção em memória com os mesmos `generatedAt`, `appId` e `pageSize`: **manifesto, índice, conteúdo de cada página e inventário completo coincidem com o consolidado**. Nenhum shard extra. Os 45 JSONs em `public/data/` são válidos; os 14 JSONs dos backups locais também foram lidos e parseados com sucesso.

Foram comparados hashes SHA-256 de **66 arquivos protegidos** antes/depois: `.env`, alteração preexistente, dados públicos, vídeos e arquivos locais de moderação, incluindo backups. Todos permaneceram idênticos. Não houve sync nem rebuild real.

Verificação do repositório atual, sem auditoria do histórico:

- `.env`, `.env.local`, `.env.production`, extensões de chaves e `serviceAccountKey.json` estão ignorados; `.env.example` é a exceção versionada esperada.
- Nenhum arquivo privado `.env*` está versionado. O exemplo contém apenas placeholders e valores locais de exemplo.
- Busca nos 141 arquivos versionados existentes não encontrou valores privados locais nem padrões de chave privada, AWS ou tokens GitHub usados na verificação. O build também não contém os valores sensíveis locais verificados. Valores não foram exibidos.
- Os novos arquivos de documentação/CI não introduzem credenciais. Não há secrets no novo workflow.

Isso é uma verificação delimitada do estado atual, não uma prova universal de ausência de qualquer segredo ou auditoria do histórico. Não foram feitas chamadas Steam/Firebase, alterações de `.env`, exclusões de backups ou operações remotas.

## 8. Configuração exata recomendada — Cloudflare Pages

Para conectar **Figueirin/WallpaperGallery** posteriormente:

| Configuração | Valor |
| --- | --- |
| Production branch | `main` |
| Framework preset | React (Vite), se oferecido; confirmar os campos abaixo |
| Root directory | `/`, raiz do repositório, onde está `package.json` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production environment | `VITE_DATA_PROVIDER=catalog` e `NODE_VERSION=24` |
| Preview environment | `VITE_DATA_PROVIDER=catalog` e `NODE_VERSION=24` |
| Credenciais Steam/Firebase | Não necessárias para o catálogo estático |

**A variável crítica é `VITE_DATA_PROVIDER=catalog` em ambos os ambientes, antes do build.** O fallback da factory é `mock`; o host sem essa configuração publicaria a demonstração. `NODE_VERSION=24` mantém o build alinhado ao runtime local e ao CI. As variáveis `VITE_*` pertencem à compilação, não a um servidor de aplicação.

A combinação `npm run build`/`dist` corresponde ao [guia oficial React](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/); `NODE_VERSION` é suportado pela [configuração oficial de build image](https://developers.cloudflare.com/pages/configuration/build-image/).

A rota de detalhe usa `/wallpaper/:id` no frontend. O Cloudflare Pages tem fallback SPA para `index.html` quando não há `404.html` na raiz, conforme [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/). Essa condição foi confirmada em `public/` e `dist/`; não foi necessário criar router ou `_redirects`. Ao publicar, confirmar abertura direta e recarga de uma URL real de detalhe, além de navegação, busca e carregamento dos JSONs. Essa validação em host permanece pendente porque não houve deploy.

## 9. SEO, licença e metadados do GitHub

Mantidos `title`, description, OG/Twitter textuais, JSON-LD sem URL inventada e favicon existente. `robots.txt` contém `Allow: /`. Nenhum canonical, sitemap, domínio ou imagem social fictícia foi criado.

Pendências após definir a URL pública: domínio; canonical e URLs absolutas coerentes; sitemap; imagem social real e respectiva URL; validação do fallback de detalhes e das respostas do host. Proteção de branches e confirmação do CI no GitHub também são ações posteriores do proprietário.

**Licença:** nenhum arquivo de licença foi encontrado e nenhum foi adicionado. Recomenda-se **MIT se o proprietário quiser permitir reutilização ampla**, conforme o [resumo e texto da MIT](https://choosealicense.com/licenses/mit/). Se quiser apenas tornar o código visível sem conceder uma licença geral de reutilização, manter sem licença por enquanto; isso não concede as permissões amplas de uma licença aberta, conforme [No License](https://choosealicense.com/no-permission/). A decisão é do proprietário e não licencia conteúdos de terceiros.

Metadados sugeridos, sem aplicar settings remotos:

- **Description:** Galeria para descobrir wallpapers do Wallpaper Engine disponíveis na Steam Workshop.
- **Topics:** `wallpaper-engine`, `steam-workshop`, `wallpapers`, `react`, `typescript`, `vite`, `tailwindcss`.
- **Homepage:** preencher com a URL após o primeiro deploy.

## 10. Validação e parecer final

| Verificação | Resultado |
| --- | --- |
| `npm test` | **189 aprovados**, 37 suites; zero falhas, skips, cancelados ou todo. |
| `npm run typecheck` | Aprovado. |
| `VITE_DATA_PROVIDER=catalog npm run build -- --manifest` | Aprovado; mesma compilação do comando de build, com manifesto de inspeção adicional em `dist/`. Aviso do chunk lazy Firebase descrito acima. |
| Comparação em memória com sharder de produção | Manifesto, índice, 40 páginas e inventário idênticos. |
| JSONs atuais e backups | Todos os 59 arquivos inspecionados são parseáveis. |
| Hashes dos arquivos protegidos | 66/66 preservados. |
| Links locais do novo README | Válidos, incluindo este relatório. |
| Código/testes/dependências de produção | Sem alterações. Nenhum teste removido, relaxado ou acrescentado para mudanças documentais. |

As dependências locais já estavam instaladas e foram utilizadas; não foi repetido `npm ci` localmente. O CI novo executará a instalação pelo lockfile quando enviado e acionado pelo proprietário. Aprovação local não é uma execução remota do workflow.

**PRONTO COM RESSALVAS:** a preparação local está concluída e não foi identificado bloqueio técnico nesta tarefa. A publicação depende da configuração explícita do Pages, especialmente `catalog` em Production/Preview, e da validação funcional após o primeiro deploy. Licença e identidade pública permanecem decisões do proprietário; Firebase pode ser removido em etapa separada se o legado for abandonado. Não há necessidade de alterar o core para iniciar essa próxima etapa.

A tarefa termina com commit local dos quatro arquivos indicados, sem push. A alteração preexistente em `docs/CATALOG_EXPANSION_REPORT.md` permanece fora desse commit.
