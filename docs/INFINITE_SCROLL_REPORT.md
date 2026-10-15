# Infinite scroll e recomendações unificadas

Implementado somente em **dev**, em 15/10/2026. Main, provider, catálogo, shards e scripts administrativos preservados.

## Carregamento progressivo

`InfiniteCatalog` usa o `getWallpapers` existente com `pageSize=25` e uma página por expansão. `IntersectionObserver` observa um sentinel ao final da grade, com margem antecipada de 300px. Não há prefetch adicional. O primeiro carregamento conserva o skeleton; lotes seguintes são anexados sem ocultar ou desabilitar os cards existentes.

O estado é publicado ao React por `useSyncExternalStore`. Uma trava síncrona impede requests simultâneos da mesma consulta. Resets incrementam a geração: respostas ou falhas antigas podem terminar e preencher caches do provider, mas não atualizam a lista nova. IDs repetidos são descartados. Cards usam `memo`, IDs estáveis e callback de seleção estável durante a expansão para evitar renderizações desnecessárias dos itens anteriores.

Ao fim, `hasMore=false` desconecta o observer e bloqueia novas consultas. Falha em lote adicional preserva lista/página/contagem; requests automáticos ficam bloqueados até retry manual da mesma página. O componente de rodapé tem status `aria-live=polite` e botão acessível de carregar mais/retry, inclusive quando IntersectionObserver não estiver disponível. Novos cards não recebem foco automaticamente. O observer desconecta durante requests, erros e saída da galeria; callbacks atrasados após disconnect são ignorados.

## JSON-First preservado

O provider não foi alterado. Na consulta normal, cada lote lê um shard de 25 (último com 4), reaproveitando cache. Na busca/filtros/ordenação, o índice global determina os 25 IDs e o provider busca apenas seus shards necessários, sem materializar todos os IDs de uma vez.

Uma página filtrada/ordenada pode envolver vários shards físicos, porque seus IDs podem estar distribuídos pelo catálogo. Outros itens desses mesmos arquivos entram no cache naturalmente; isso não transforma o fluxo em download antecipado dos 979 itens. Os testes verificam que o conjunto de shards solicitado corresponde exatamente aos IDs da primeira página e que repetir a página usa o cache.

## Consultas, URL e histórico

Busca, tipo, resolução, tags e ordenação ficam em `q`, `type`, `resolution`, `tag` e `sort`. Resoluções e tags usam parâmetros repetidos. Parâmetros alheios à consulta são preservados. O antigo `page=` é ignorado e removido da URL ativa: abrir uma URL antiga começa no primeiro lote, sem carregar todas as páginas precedentes.

Mudanças de consulta limpam a lista imediatamente, invalidam requests antigos e voltam ao topo. O primeiro lote tem debounce de 120ms. Busca digitada usa `replaceState` para não criar uma entrada por tecla; filtros e ordenação usam `pushState`. Popstate/hashchange atualizam consulta e rota. O infinite scroll não cria entradas de histórico por lote.

Ao abrir detalhes pela SPA, a lista atual permanece na memória de App e a posição da galeria fica no estado do histórico. Ao voltar pela interface ou pelo navegador à mesma consulta, a lista carregada é reutilizada e a posição é restaurada após a montagem. A abertura de recomendações preserva essa posição. Forward continua interpretando a rota de detalhe.

Decisão proporcional ao escopo: só a consulta atual é mantida em memória. Voltar a uma consulta diferente reinicia no primeiro lote/topo, usando caches já disponíveis do provider. Recarregar a página também reinicia no primeiro lote, preservando a consulta da URL; não há restauração de centenas de itens a partir de storage. Os helpers antigos de URL paginada continuam compatíveis com seus testes legados, mas não são usados pela experiência principal.

## Recomendações

Removida a variante de recomendação em `WallpaperCard` e a opção de fit específica em `WallpaperMedia`. Recomendações e galeria principal usam os mesmos cards, proporção, crop, zoom/hover, foco, tipografia, descrição, tags, mídia e links. Apenas o container da seção é diferente: 1/2/3 colunas, conforme a largura dos detalhes.

Um teste compara o HTML completo de cada `article` renderizado na galeria e nas recomendações, em EN e PT-BR, além de verificar os links nativos de detalhes. Navegação SPA e Steam foram preservadas.

## Arquivos e componentes

- Novos: `src/utils/infiniteCatalog.ts`, `catalogQuery.ts`, `observeNextBatch.ts`, `src/components/InfiniteScrollFooter.tsx`, `tests/infiniteScroll.test.mjs` e este relatório.
- Alterados: `App`, `WallpaperCard`, `WallpaperMedia`, `WallpaperRecommendations`, dicionários, testes de localização e README. O relatório anterior recebeu indicação de etapa histórica.
- Removido: `src/components/Pagination.tsx`, sem imports ativos restantes. A paginação interna do provider e seus testes continuam necessários e foram mantidos.
- Sem dependências novas; nenhum arquivo do provider ou script Steam/Firebase foi alterado.

## Validação

- `npm test`: **210 aprovados**, 37 suites, sem falhas/skips/todo.
- `npm run typecheck` e `npm run build`: aprovados; aviso conhecido do chunk lazy Firestore permanece.
- Testes do controlador real cobrem primeiro/segundo lotes, append, preservação, dedup, observer concorrente/disconnect, fim após 40 lotes, reset por busca/filtros/tags/resolução/ordenação, corridas e erros antigos, falha/retry do próximo lote, cache e índice/shards reais.
- Testes de componentes reais cobrem igualdade dos cards, links e estados/mensagens EN/PT-BR. A validação de URL cobre ida e volta da consulta em detalhes/galeria e remoção de `page` legado.
- Catálogo confirmado: **979 itens, 40 shards, pageSize 25, última página com 4**. Hashes dos **57 arquivos protegidos** (dados públicos, providers, scripts e `.env`) idênticos ao início. Main também foi comparada por hash Git e permanece intacta.
- Nenhum teste existente foi removido. As verificações da antiga UI numerada e da variante de recomendação foram convertidas para o comportamento solicitado, mantendo checks de tradução/links e acrescentando comparação integral dos cards.

Não há navegador instalado neste ambiente: não houve inspeção visual desktop/mobile nem cliques reais de back/forward. Os resultados comprovados vêm dos testes de produção e renderização estática; a restauração visual de scroll deve ser conferida no navegador pelo proprietário. Não houve chamadas Steam/Firebase, sync, rebuild de catálogo ou deploy.
