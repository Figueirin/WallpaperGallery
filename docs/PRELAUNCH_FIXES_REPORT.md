# WallpaperGallery — correções pré-lançamento

Data: 15/10/2026, America/Sao_Paulo. Base: **dd952e7**, branch `main`.

## 1. Resultado e estado real

| Tema | Resultado |
|---|---|
| Autores | **Ocultados quando não resolvidos**. Nomes públicos existentes são exibidos. Resolução em lotes preparada e testada com fixtures; nenhum nome real foi consultado nesta tarefa. |
| Botão Steam | **Removido** o botão de cliente externo nos cards e nas duas áreas dos detalhes. A ação web oficial permanece. |
| Multiplataforma | Referências exclusivas de Linux removidas da interface. **Pendente validação interativa** em navegadores/sistemas reais; não prometemos compatibilidade dos wallpapers em todos os sistemas. |
| SEO | Metadados textuais, favicon, robots e links de detalhes implementados; **domínio, canonical, sitemap, imagem social e indexação real pendentes**. |

O catálogo encontrado possui **979 wallpapers, 40 shards de 25 itens**, último com quatro. Há **642 SteamIDs de autores distintos** e os 979 nomes são placeholders `SteamUser (...)`. O relatório anterior de polimento descrevia outra versão com 178 itens/24 por shard; não usamos esses valores antigos como estado atual.

Alteração preexistente preservada: uma linha em branco adicional em `docs/CATALOG_EXPANSION_REPORT.md`. Não alteramos nem incluímos essa mudança no commit desta tarefa.

## 2. Autores: diagnóstico e implementação

O normalizador Steam usava `raw.creator` para fabricar `author.name = SteamUser (<id>)`; `author.steamId` já existia separado. O catálogo e o índice reproduziam esse nome, e cards/detalhes o renderizavam diretamente. Não havia resolução SteamID64 → personaname.

Implementado:

- `getAuthorDisplayName` rejeita placeholders, nome vazio, SteamID bruto e o genérico legado `Steam Creator`.
- `AuthorName` é compartilhado entre cards e detalhes e não renderiza nenhum elemento quando falta nome público. Não aparece substituto genérico nem separador solto.
- O normalizador passa a deixar `name` vazio quando só possui o SteamID; não inventa nome.
- O merge mantém nome resolvido quando nova informação não informa nome **e o SteamID é o mesmo**. Se o autor muda, o nome antigo não é transferido.
- `enrich-authors.ts` usa GetPlayerSummaries v2 em lotes deduplicados de até 100 IDs, preserva IDs e dados do wallpaper e reutiliza nomes públicos já existentes na entrada.
- Respostas parciais mantêm nomes disponíveis e deixam os demais sem nome; não inventam identidade. Há timeout de 15 segundos e até três tentativas para rede/429/5xx; erros não reproduzem chave, URL privada nem corpo HTTP.
- O enriquecimento gera **somente staging em `.enrichment/`**, ignorado pelo Git. Não é executado pelo frontend, build, workflow ou sincronizador de Workshop, e não publica automaticamente.

A [documentação oficial ISteamUser/GetPlayerSummaries](https://partner.steamgames.com/doc/webapi/ISteamUser#GetPlayerSummaries) documenta IDs separados por vírgulas, máximo de 100 por pedido e `personaname` na resposta. Para os 642 autores atuais, seriam aproximadamente sete requisições normais, além de eventuais retries. Não validamos acesso da chave real a esse endpoint nem disponibilidade dos nomes de cada perfil.

Os JSONs publicados continuam contendo seus valores originais nesta tarefa, mas a interface agora os oculta. A busca sobre o índice antigo ainda utiliza os metadados armazenados; passará a pesquisar nomes públicos quando uma geração enriquecida for publicada.

## 3. Como preparar um enriquecimento real posteriormente

**Não executado e ainda depende de autorização adicional específica.** Este procedimento não coleta novos wallpapers.

Depois de autorizar expressamente a consulta dos nomes, usar `STEAM_API_KEY` já configurada no processo/arquivo local e fornecer a confirmação operacional abaixo. Não usar chave como argumento CLI ou variável `VITE_`.

Exemplo em shell POSIX, somente para execução futura autorizada:

```bash
export WALLPAPER_AUTHOR_AUTHORIZATION='AUTORIZO A CONSULTA DOS NOMES PUBLICOS DOS AUTORES.'
npm run enrich:authors -- --authorize-steam-profiles
unset WALLPAPER_AUTHOR_AUTHORIZATION
```

A presença da frase no código/documentação não concede autorização ao agente. Em outros shells, definir a mesma variável de ambiente com a sintaxe correspondente.

Saída:

- `.enrichment/catalog.json`
- `.enrichment/catalog/manifest.json`
- `.enrichment/catalog/index.json`
- `.enrichment/catalog/pages/*.json`

A entrada é o catálogo atual e o pageSize é lido do manifesto existente, sem fixar outro tamanho. A pré-validação ocorre antes de consultar perfis. A geração preserva quantidade de wallpapers e IDs; só enriquece o campo de nome.

**A substituição dos arquivos públicos não faz parte desse comando.** Após a consulta autorizada, revisar nomes, quantidade, IDs, shards e consistência do staging, então aprovar uma promoção controlada usando as proteções de backup/rollback já adotadas pelo projeto. Não copiar somente o consolidado: o índice também armazena o nome usado na busca. O staging não deve ser considerado um mecanismo de publicação transacional por si só; falhas devem ser resolvidas antes de promover qualquer saída.

Não há atualização periódica de nomes nem cache persistente de perfis nesta entrega. A deduplicação/cache funciona dentro da execução e reaproveita nomes presentes na entrada; uma nova consulta sobre o catálogo original ainda não enriquecido pode consultar os mesmos perfis novamente.

## 4. Steam: diagnóstico e decisão

A URI gerada era `steam://url/CommunityFilePage/<PublishedFileID>`. Estava presente nos dados e no helper `steamLinks`, e era exposta em três locais da interface. O código não tratava ausência do aplicativo/handler, rejeição pelo navegador ou falha de abertura.

Investigamos a referência [Steam browser protocol](https://developer.valvesoftware.com/wiki/Steam_browser_protocol), mas a consulta direta retornou HTTP 403 neste ambiente. Não alegamos que o formato seja universalmente inválido, nem que outra string garantiria funcionamento. Não houve teste real de abertura do Steam em nenhum sistema.

Como permitido na solicitação, removemos a ação que prometia abrir o cliente. Mantivemos `https://steamcommunity.com/sharedfiles/filedetails/?id=<id>` como ação clara, com abertura em nova aba, `noopener noreferrer` e IDs validados pelo helper existente. Dados simulados não recebem ação oficial Steam.

`steamClientUri` e o retorno legado `.client` do helper foram preservados para compatibilidade dos dados/testes, mas **nenhum botão atual os utiliza**. Nenhuma detecção invasiva da instalação foi adicionada. Testar a URL web ou seu HTML não é apresentado como prova de abertura do aplicativo.

## 5. Multiplataforma e navegação

Removidos o selo Linux/KDE da navbar, a referência exclusiva no rodapé, o texto de deep link Linux no banner e o botão Linux dos detalhes. O site convida à exploração pelo navegador em computador/celular e distingue isso da compatibilidade do Wallpaper Engine e dos wallpapers.

A rota continua `/wallpaper/:id`, com suporte ao hash legado e à query de página. As funções de leitura/montagem de URL foram extraídas sem migração de router/framework para serem testadas diretamente. Acesso direto em produção **continua dependendo de fallback para index.html no host**; Vite local não é evidência de configuração do host futuro. A URL base e eventual publicação em subdiretório devem ser definidas na implantação.

Os títulos dos cards agora são links HTML nativos para os detalhes, permitindo cópia, nova aba e descoberta por crawlers. Clique normal usa a navegação SPA existente; cliques com modificadores preservam o comportamento do navegador. Sai o tratamento de teclado no artigo que capturava eventos dos links filhos; o link nativo fornece navegação por teclado. Não mudamos filtros, ordenação, paginação, provider ou recomendações.

## 6. SEO implementado e limites

Implementado:

- `lang=pt-BR` e viewport mantidos.
- Título descritivo e meta description sobre Wallpaper Engine, Steam Workshop e wallpapers animados/live/desktop, coerentes com o catálogo.
- Open Graph textual (title, description, locale, site_name, type) e Twitter/X summary, sem domínio, conta social ou imagem fictícios.
- Favicon SVG baseado no motivo de brilho/cores já utilizado na navbar; nenhuma imagem social foi inventada.
- JSON-LD `WebSite` com nome, descrição e idioma reais. Não há ratings, avaliações, agregados ou autores inventados. `CollectionPage` não foi adicionado sem uma URL pública estável.
- `robots.txt` permitindo crawling, sem sitemap fictício.
- H1 da galeria e H2 de catálogo para sustentar os H3 dos cards; detalhe mantém H1 do wallpaper e H2 das seções. Os headings auxiliares da galeria usam sr-only, sem alterar a identidade visual.
- Alt text existente de mídia mantido; links da Workshop acessíveis e nomes escapados pelo React.
- Títulos e descrições de detalhes atualizados no DOM ao carregar o item, incluindo OG/Twitter textuais, e restaurados ao sair. O texto é atribuído como conteúdo, sem HTML injetado.
- Texto noscript explica que a navegação/pesquisa depende de JavaScript.

A aplicação continua **client-side React/Vite**. O HTML inicial é geral: não entrega conteúdo e metadados individuais de cada wallpaper antes de executar JavaScript. A [documentação do Google sobre JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) explica a etapa de renderização e suas limitações; renderização estática pode melhorar disponibilidade do conteúdo para crawlers que não executam JS. OG atualizado no DOM não garante preview social individual.

Pendências para publicação:

1. Definir domínio HTTPS e caminho base reais; configurar fallback SPA para `/wallpaper/:id` e testar acesso direto/reload.
2. Definir canonical por página com esse domínio. Não apontar tudo para a home nem usar localhost como canonical.
3. Gerar sitemap a partir dos IDs do catálogo quando houver origem pública definida; referenciá-lo em robots.txt. Não foi gerado XML com URLs inventadas.
4. Fornecer imagem social real aprovada e URL pública antes de adicionar og:image/twitter:image.
5. Verificar indexação no serviço do buscador após publicação. Robots/metadados não garantem ranking nem indexação.
6. Se indexação e previews individuais forem prioridade, considerar geração estática de páginas HTML de detalhes a partir do catálogo como etapa posterior. Não foi implementado SSR nem migração para Next.js.

## 7. Arquivos alterados

| Arquivos | Finalidade |
|---|---|
| `src/utils/authors.ts`, `src/components/AuthorName.tsx` | Nome público compartilhado; omissão de placeholders/SteamIDs. |
| `src/components/WallpaperCard.tsx` | Autor condicionado, remoção de cliente Steam e link nativo para detalhe. |
| `src/components/WallpaperDetailView.tsx` | Autor condicionado, remoção das duas ações de cliente e metadados de detalhe. |
| `src/components/Navbar.tsx`, `src/components/Footer.tsx`, `src/App.tsx` | Textos multiplataforma, headings e integração de metadados/rotas. |
| `src/utils/navigation.ts` | Funções existentes de URL isoladas para validação. |
| `src/utils/pageMetadata.ts`, `src/utils/usePageMetadata.ts` | Atualização/restauração dos metadados por página. |
| `scripts/sync-workshop.ts` | Não fabricar nome; preservar nome resolvido do mesmo autor no merge. |
| `scripts/enrich-authors.ts` | Consulta opcional de perfis em lotes e geração de staging. |
| `src/types/wallpaper.ts` | Comentário do campo legado de URI ajustado; modelo principal preservado. |
| `index.html`, `public/favicon.svg`, `public/robots.txt` | Metadados estáticos, identidade e crawling. |
| `.gitignore`, `package.json` | Staging ignorado e comando opt-in de enriquecimento. Sem dependências novas. |
| `tests/prelaunch.test.mjs` | Nove testes adicionais pertinentes. |
| `docs/PRELAUNCH_FIXES_REPORT.md` | Diagnóstico, evidências, comandos e pendências. |

## 8. Testes e preservação

| Validação | Resultado |
|---|---|
| Baseline `npm test` | 180 aprovados, 37 suites. |
| Final `npm test` | **189 aprovados**, 37 suites, zero falhas/skips/todos. |
| `npm run typecheck` | Aprovado para frontend, Vite e scripts. |
| `npm run build` | Aprovado; bundle principal aproximadamente 324,61 kB, chunk Firestore 570,23 kB com aviso de tamanho preexistente. |
| Hashes de catálogo/shards/manifesto/índice e backups | Preservados; 979 itens/40 páginas/pageSize 25. |
| `.env` real e alteração preexistente | Preservados por hash. |

Testes adicionais renderizam **os componentes reais** Card/AuthorName com React em Node usando o compilador esbuild já instalado, verificando nomes públicos, omissão e links. Isso é renderização automatizada de componente, **não implementação de SSR no site nem validação num navegador**. Detalhes compartilham AuthorName; sua integração e a ausência do botão legado também foram inspecionadas/testadas estruturalmente.

Os testes de perfis inspecionam as URLs do transporte fake, lotes 100/1, deduplicação, nomes já disponíveis, respostas parciais, HTTP 403/429, formato inválido, manutenção de IDs e imutabilidade da entrada. Não fazem consultas reais. A entrada principal rejeita execução sem autorização antes de criar staging. Rotas e atualização/restauração dos metadados têm testes do código de produção. Nenhum teste existente foi removido ou alterado para obter sucesso.

**Validação real no navegador não realizada.** Há Firefox instalado e uma sessão gráfica indicada no ambiente, mas não há harness de automação de navegador configurado no projeto; esta entrega não afirma validação visual, clique real do Steam nem testes Windows/macOS/mobile. Essas verificações permanecem na checklist de publicação, e não foram substituídas por testes de strings.

Não houve coleta Steam/consulta real de perfis, escrita Firebase, deploy, workflow, push, edição de `.env`, modificação/exclusão de wallpapers, alteração do tamanho dos shards ou exclusão de backups. Nenhuma dependência foi instalada. A única rede utilizada foi consulta de documentação pública.

Após testes e revisão do diff, mudanças registradas em commit local `fix(prelaunch): improve author labels, Steam actions and metadata`; hash consultável em `git log`. A linha em branco preexistente de CATALOG_EXPANSION_REPORT.md permanece fora desse commit.
