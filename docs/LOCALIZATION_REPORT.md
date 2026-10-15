# Branding, recomendações e idiomas

> Registro da etapa de internacionalização. A variante de cards e a paginação descritas aqui foram substituídas na [etapa de infinite scroll](INFINITE_SCROLL_REPORT.md).

Implementação em **dev**, em 15/10/2026. Nenhuma alteração em main ou publicação remota.

## Branding

O produto passa a usar **WallpaperGallery** na navbar, rodapé, título, descrição, Open Graph, Twitter e JSON-LD. O HTML inicial está em inglês (`lang="en"`, `og:locale=en_US`). As referências à **Steam Workshop** permanecem como origem/plataforma. O contexto do projeto também foi atualizado. Nenhum canonical, domínio ou sitemap foi criado ou alterado.

## Internacionalização

Sem bibliotecas ou dependências novas:

- `src/i18n/translations.ts`: dicionários EN/PT-BR, mesmas chaves verificadas por TypeScript e interpolação de parâmetros.
- `src/i18n/language.ts`: detecção, leitura/gravação e atualização de `document.documentElement.lang`, OG locale e idioma/descrição do JSON-LD WebSite.
- `src/i18n/LanguageContext.tsx`: contexto React compartilhado, troca imediata de idioma e preferência manual persistida.

Na primeira visita, uma preferência válida em `localStorage` (`wallpapergallery.language`) vence o navegador. Sem preferência válida, `navigator.language` em português, inclusive variantes regionais, resolve para `pt-BR`; os demais idiomas e ambientes sem detecção usam `en`. Somente a escolha manual é persistida. Se o storage estiver bloqueado, a troca continua funcionando na sessão.

O seletor nativo EN/PT tem nome acessível traduzido e navegação por teclado. A navbar quebra a busca em outra linha em telas pequenas para acomodar branding e seletor. Mudanças de idioma não recarregam a página nem reiniciam a consulta do catálogo.

Foram traduzidos busca, filtros, ordenação, paginação, loading, erros amigáveis, detalhes, recomendações, botões, labels, acessibilidade, mídia e rodapé. Datas e contadores de estatísticas seguem o idioma selecionado. Títulos, descrições, nomes e tags externos continuam originais. Identificadores técnicos, resoluções, unidades e marcas são preservados. Os helpers de metadados continuam sem inferir domínio; o hook da página ativa atualiza os textos sem restaurar um idioma antigo na navegação.

## Recomendações

`WallpaperRecommendations.tsx` organiza a seção com uma coluna no mobile, duas a partir de `sm` e três a partir de `lg`, dentro do container dos detalhes. A antiga grade chegava a seis colunas nesse mesmo espaço.

Os cards reutilizam o design e os links de `WallpaperCard`, com variante para recomendações: títulos com até duas linhas, prévias 16:9 usando `object-contain`, sem zoom que corte a imagem, e foco visível também quando um link interno recebe foco. A galeria principal preserva seu comportamento de mídia. Os links nativos `/wallpaper/:id`, a seleção SPA e os links Steam continuam disponíveis.

## Arquivos

- Entrada/SEO: `src/main.tsx`, `src/App.tsx`, `index.html`, `src/utils/pageMetadata.ts`, `src/utils/usePageMetadata.ts`.
- Idiomas: os três arquivos de `src/i18n/` descritos acima.
- Componentes: `Navbar`, `Footer`, `EmptyState`, `GalleryGrid`, `FilterBar`, `Pagination`, `LoadingSkeleton`, `WallpaperCard`, `WallpaperDetailView`, `WallpaperMedia`, novo `WallpaperRecommendations`.
- Branding em comentário de tipos: `src/types/wallpaper.ts`.
- Documentação: `README.md`, `docs/PROJECT_CONTEXT.md` e este relatório.
- Testes: novo `tests/localization.test.mjs`; `tests/prelaunch.test.mjs` agora exige o fallback HTML e JSON-LD em inglês, mantendo todas as demais verificações anteriores.

## Validação

- `npm test`: **199 aprovados**, 37 suites; zero falhas, skips ou todo. Sete novos testes cobrem detecção/fallback, preferência manual persistida e storage bloqueado, idioma do documento, paridade/interpolação dos dicionários, renderização EN/PT-BR, recomendações e branding/SEO.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; aviso conhecido do chunk lazy Firestore permanece.
- As renderizações usam componentes React reais, compilados com o esbuild já instalado. Transporte externo é bloqueado pelo preloader dos testes. Não há testes de tradução baseados em reimplementação do dicionário.
- Os testes existentes confirmam **979 wallpapers, 40 shards, 25 por página e 4 na última**; o provider continua `catalog` por padrão.
- Hashes SHA-256 de **57 arquivos protegidos** foram comparados: `.env`, todos os JSONs públicos, código de providers e scripts, sem mudança. Não houve chamada Steam/Firebase, sincronização ou reconstrução do catálogo.
- A referência Git de `main` foi comparada antes/depois e permanece inalterada.

Limite da validação: não há navegador instalado para screenshots, resize visual ou cliques reais. Os testes de renderização confirmam traduções, links, proporção e classes responsivas, mas não substituem a inspeção visual em um navegador. Nenhum teste anterior foi removido ou relaxado; apenas as expectativas de idioma inicial foram atualizadas para o requisito novo.

Nenhum push ou deploy foi executado nesta tarefa.
