# Workshop Gallery - Contexto e Decisões do Projeto

## 1. Visão Geral
- **Nome:** Workshop Gallery
- **Diretório Raiz:** `/home/renato/Documents/VSCode/WallpaperGallery`
- **Repositório GitHub:** `https://github.com/Figueirin/WallpaperGallery`
- **Propósito:** Catálogo web moderno, responsivo e dark mode para explorar wallpapers do Steam Workshop do Wallpaper Engine (AppID: 431960), com foco em descoberta visual para usuários Linux (KDE Plasma / Wallpaper Engine for KDE).
- **Restrição Principal:** Não realizar download de arquivos completos (.pkg), priorizando apenas miniaturas e metadados públicos. Sem chaves de API no frontend.

## 2. Decisões Técnicas e Análise da API Steam
- **CORS & Chave de API:** A Steam Web API (`api.steampowered.com`) não suporta requisições diretas de browsers (sem CORS) e exige Steam Web API Key para buscas completas. Chaves não são expostas no frontend.
- **Estratégia de Dados Adotada (JAMstack / Catálogo Estático):**
  - **Fase Inicial / MVP:** Provedor de dados desacoplado via interface `IWallpaperDataProvider`. Implementado `MockWallpaperProvider` consumindo `mock-wallpapers.json` com itens simulados realistas.
  - **Fase de Produção:** Script indexador/sincronizador (`scripts/sync-workshop.ts`) executado pelo mantenedor ou GitHub Actions para gerar `catalog.json` estático. Custo zero de hospedagem e sem problemas de CORS.
- **Deep Linking Steam:**
  - Web: `https://steamcommunity.com/sharedfiles/filedetails/?id={id}`
  - Cliente Steam no Linux: `steam://url/CommunityFilePage/{id}`

## 3. Stack Tecnológica
- **Frontend:** React 19 + TypeScript + Vite 6
- **Estilização:** Tailwind CSS v4 (@tailwindcss/vite) com Dark mode nativo
- **Ícones:** Lucide React
- **Arquitetura de Dados:** Interface de serviço abstrata (`IWallpaperDataProvider`) e módulo puro `filterWallpapers.ts` desacoplado da interface.
- **Testes:** Suíte de testes automatizados via test runner nativo do Node 24 (`node:test` e `node:assert/strict`).

## 4. Recursos de Busca, Filtros e Ordenação (Etapa 4)
- **Pesquisa Textual:**
  - Busca por múltiplos termos normalizados (tokens) em título, autor, descrição e tags.
  - Insensível a maiúsculas/minúsculas e tolerante a espaços adicionais.
  - Debounce de digitação de 120ms para performance fluida.
- **Filtros Combináveis:**
  - **Tipo:** `Scene`, `Video`, `Web` ou `Todos`.
  - **Resolução:** Filtro baseado nos dados reais (`1920x1080` Full HD, `2560x1440` QHD, `3840x2160` 4K, `3440x1440` Ultrawide 21:9).
  - **Tags:** Seleção múltipla com lógica **OU (OR)** entre tags selecionadas.
  - **Lógica de Combinação:** **E (AND)** entre categorias distintas (ex: Tipo E Resolução E Tags E Busca).
  - **Limpeza:** Ação rápida para limpar filtros individuais ou todos os filtros e busca de uma só vez.
- **Ordenação:**
  - `Mais populares`: soma de inscritos, favoritos e votos positivos (`stats`).
  - `Mais recentes`: data de publicação (`createdAt` decrescente).
  - `Mais antigos`: data de publicação (`createdAt` crescente).
  - `Título (A-Z)`: ordem alfabética.
  - Imutabilidade rigorosa dos dados originais do catálogo.

## 5. Experiência Interativa, Previews de Mídia e Detalhes (Etapa 6)
- **Alinhamento dos Controles de Filtro:**
  - Correção do espaçamento excessivo entre o seletor de Tipo e Resolução, unificando-os em fluxo contíguo com divisores sutis em `FilterBar.tsx`.
- **Efeitos Interativos nos Cards:**
  - Elevação e escala suave (`hover:scale-[1.03]`, `hover:z-20`, `hover:shadow-2xl`) com transição de 300ms.
  - Respeito integral à acessibilidade: `@media (prefers-reduced-motion: reduce)` desativa transições e transformações de escala.
  - Links para a Steam isolados com `stopPropagation` para não disparar navegação ao abrir o cliente ou página web.
- **Preview de Vídeo no Hover (Hover Video Preview):**
  - Reprodução silenciosa automática de vídeo HTML5 nos cards animados quando o cursor paira sobre o item.
  - Pausa e reinício imediato ao retirar o cursor, liberando recursos.
  - Indicador visual animado de reprodução ("Preview") e fallback gracioso para imagem estática em caso de falha de carregamento ou restrições de movimento.
- **Transição Fluida na Página de Detalhes:**
  - Animação sutil de entrada via CSS (`animate-detail-enter` de 280ms com fade-in e translação vertical leve de 10px; `animate-media-reveal` de 320ms com leve escala de 0.985 a 1).
  - Respeito a `@media (prefers-reduced-motion: reduce)` desativando animações quando solicitado pelo sistema.
- **Ampliação de Prévia no Hover (+25%):**
  - Preview ampliado em ~25% (`group-hover:scale-[1.25]`) com ponto de ancoragem na base (`origin-bottom`).
  - Elevação de camada (`group-hover:z-40`), borda iluminada e sombra profunda, sobrepondo-se aos cards vizinhos sem reflow da grade e sem cortar cantos.
  - Reprodução de vídeo mantida em alta definição dentro da área ampliada.
- **Recomendações Determinísticas ("Você também pode gostar"):**
  - Algoritmo puro em `src/utils/recommendations.ts` que calcula afinidade priorizando: (1) tags em comum, (2) mesmo tipo de mídia, (3) resolução/proporção semelhante, e desempate por popularidade.
  - Exclui estritamente o item atual e impede itens duplicados.
  - Exibição de 4 a 6 sugestões responsivas abaixo dos detalhes com navegação fluida compatível com History API.

## 6. Paginação com Carregamento Progressivo (Etapa 7)
- **Carregamento em Lotes (Batch Loading):**
  - Divisão do catálogo em páginas de 8 itens (`PAGE_SIZE = 8`), ideal para distribuição equilibrada em grades responsivas de 1 a 6 colunas.
  - Função pura `paginateWallpapers` com proteção contra índices negativos ou tamanhos inválidos.
  - Dataset do catálogo enriquecido para 16 itens simulados realistas com diversas categorias e metadados.
- **Infinite Scroll Inteligente:**
  - Sentinela de rolagem monitorada via `IntersectionObserver` nativo com margem antecipada de 250px (`rootMargin: '250px'`), carregando a próxima página de forma imperceptível antes do usuário atingir o fim da tela.
- **Controles Manuais e Acessibilidade:**
  - Botão de fallback explícito "Carregar mais wallpapers" com estado de carregamento animado (`Loader2`).
  - Indicador de progresso claro ("Exibindo X de Y itens").
  - Mensagem de conclusão ao atingir o fim do catálogo com atalho para "Voltar ao topo".
  - Tratamento resiliente de falhas de rede com botão de tentativa sem perda dos itens já carregados.
  - Reset automático da paginação para a página 1 ao alterar qualquer termo de busca, filtro ou critério de ordenação.

## 7. Roteiro de Implementação do MVP
- [x] **Etapa 1:** Análise de viabilidade técnica, estratégias de dados da Steam e plano de arquitetura. *(Concluído)*
- [x] **Etapa 2:** Inicialização da estrutura do projeto em `WallpaperGallery`, configuração do Tailwind CSS v4, definição dos tipos TypeScript (`wallpaper.ts`), interface `IWallpaperDataProvider`, classe `MockWallpaperProvider` e dataset `mock-wallpapers.json`. *(Concluído)*
- [x] **Etapa 3:** Interface base da galeria: Layout responsivo, cards visuais refinados, badges de resolução/tipo, tratamento de erro de imagem, barra de busca com debounce, estados vazios e tema escuro. *(Concluído)*
- [x] **Etapa 4:** Pesquisa avançada, filtros combináveis (tags com OR, resolução e tipo com AND) e ordenação por popularidade/data/título. Testes automatizados. *(Concluído)*
- [x] **Etapa 5 (Layout Desktop):** Refinamento do layout para monitores desktop e ultrawide: expansão de containers para `max-w-[2400px]`, grid responsivo dinâmico (4 colunas em 1366px, 5 em 1920px Full HD e 6 em 2560px ultrawide), barra de busca ampliada e painel de filtros otimizado em 2 colunas. *(Concluído)*
- [x] **Etapa 6 (Experiência Interativa e Detalhes):** Ajuste de alinhamento dos filtros, hover com elevação e +25% de escala na prévia, animação de entrada, recomendações inteligentes de wallpapers semelhantes, visualização detalhada `/wallpaper/:id` com player de mídia e métricas. *(Concluído)*
- [x] **Etapa 7 (Paginação e Carregamento Progressivo):** Paginação via lotes dinâmicos, infinite scroll com IntersectionObserver, botão carregar mais, reset de página em novos filtros, indicador de progresso e 40 testes automatizados passando. *(Concluído)*
- [ ] **Etapa 8:** Script gerador de catálogo via Steam Web API.

## 8. Especificações de Layout Responsivo (Desktop & Ultrawide)
- **Container Fluido:** Largura máxima de 2400px com margens laterais progressivas (`px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12`).
- **Densidade da Grade (`GalleryGrid` & `LoadingSkeleton`):**
  - Mobile (< 640px): 1 coluna
  - Tablet (640px - 768px): 2 colunas
  - Notebooks / Telas médias (768px - 1280px): 3 colunas
  - Desktop 1366px (1280px - 1536px): 4 colunas
  - Desktop Full HD 1920px (1536px - 2100px): 5 colunas
  - Ultrawide / 4K (2100px+): 6 colunas
- **Distribuição de Filtros (`FilterBar`):**
  - Seletores de Tipo e Resolução dispostos em grade contígua com divisor vertical, mantendo proximidade ergonômica.
  - Seletor de ordenação e ação de limpeza alinhados na barra superior.
  - Barra de busca do `Navbar` ampliada de `max-w-md` para até `xl:max-w-2xl` em telas amplas.


