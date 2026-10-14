# Workshop Gallery - Contexto e Decisões do Projeto

## 1. Visão Geral
- **Nome:** Workshop Gallery
- **Diretório Raiz:** `/home/renato/Documents/VSCode/WallpaperGallery`
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
- **Arquitetura de Dados:** Interface de serviço abstrata (`IWallpaperDataProvider`) para chavear facilmente entre Mock, Catálogo Estático e Proxy de API.

## 4. Roteiro de Implementação do MVP
- [x] **Etapa 1:** Análise de viabilidade técnica, estratégias de dados da Steam e plano de arquitetura. *(Concluído)*
- [x] **Etapa 2:** Inicialização da estrutura do projeto em `WallpaperGallery`, configuração do Tailwind CSS v4, definição dos tipos TypeScript (`wallpaper.ts`), interface `IWallpaperDataProvider`, classe `MockWallpaperProvider` e dataset `mock-wallpapers.json`. *(Concluído)*
- [x] **Etapa 3:** Interface base da galeria: Layout responsivo, cards visuais refinados, badges de resolução/tipo, tratamento de erro de imagem, barra de busca com debounce, estados vazios e tema escuro. *(Concluído)*
- [ ] **Etapa 4:** Pesquisa avançada, filtros combináveis (tags, resolução, tipo) e ordenação (popularidade/data).
- [ ] **Etapa 5:** Modal de detalhes com prévia expandida, metadados e links Steam (web e aplicativo cliente).
- [ ] **Etapa 6:** Carregamento progressivo (infinite scroll / lazy loading).
- [ ] **Etapa 7:** Script gerador de catálogo via Steam Web API.
