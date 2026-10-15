# WallpaperGallery

Galeria independente para descobrir wallpapers do Wallpaper Engine disponíveis na Steam Workshop. Desenvolvida com React, TypeScript, Vite e Tailwind CSS.

## Estado atual

O catálogo contém **979 wallpapers reais**, distribuídos em **40 shards**, com **25 wallpapers por página** (4 na última). A interface oferece busca, filtros, ordenação, paginação e detalhes em `/wallpaper/:id`.

A produção usa o provider `catalog`, com arquitetura JSON-First e moderação por metadados. O modo `mock` continua disponível para demonstração; Firebase/Firestore é um caminho legado opcional.

## Executar localmente

Use **Node.js 24**.

```bash
npm ci
npm run dev
```

Sem configuração, o aplicativo usa `mock`. Para navegar pelo catálogo real:

```bash
VITE_DATA_PROVIDER=catalog npm run dev
```

A sintaxe acima funciona em shells POSIX, como Bash. Também é possível definir `VITE_DATA_PROVIDER=catalog` em um arquivo `.env.local` ignorado pelo Git. O catálogo estático não precisa de chave Steam nem configuração Firebase.

## Validar e compilar

```bash
npm test
npm run typecheck
npm run build
```

Os testes bloqueiam chamadas de rede. O build gera `dist/`. Para testar localmente o build do catálogo:

```bash
VITE_DATA_PROVIDER=catalog npm run build
npm run preview
```

As variáveis `VITE_*` são incorporadas durante o build; mudar o ambiente depois exige nova compilação.

## Arquitetura e dados

Os arquivos publicados estão em `public/data/catalog/`:

- `manifest.json`: contadores, metadados de filtros e localização dos itens nas páginas.
- `index.json`: índice leve para busca, filtros e ordenação.
- `pages/*.json`: dados completos dos wallpapers, carregados sob demanda.

O arquivo `public/data/catalog.json` é a fonte consolidada dos scripts de manutenção. A navegação usa os arquivos particionados, sem depender de banco de dados ou sincronização ao abrir o site.

O projeto utiliza metadados e previews públicos de itens da Steam Workshop; **não hospeda os pacotes dos wallpapers**. Os links de detalhes encaminham à página original na Steam. Vídeos locais de demonstração pertencem ao modo mock.

## Moderação

A publicação filtra classificações Steam restritivas, tags, palavras-chave em títulos/descrições e IDs da blacklist manual em `config/blocked-wallpapers.json`. Ratings ausentes ou `Unrated` continuam sujeitos aos demais filtros.

Não há análise visual automática. Metadados incompletos ou incorretos podem deixar passar conteúdo inadequado; a blacklist permite revisão manual. Scripts de coleta e reconstrução são operações de manutenção e não fazem parte do deploy. O sincronizador Firestore legado não aplica a mesma política de moderação do pipeline JSON-First.

## Deploy no Cloudflare Pages

Configuração para a raiz deste repositório:

| Campo | Valor |
| --- | --- |
| Branch de produção | `main` |
| Root directory | `/` (raiz do repositório) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variável em **Production e Preview** | `VITE_DATA_PROVIDER=catalog` |
| Versão Node em **Production e Preview** | `NODE_VERSION=24` |

**Sem `VITE_DATA_PROVIDER=catalog`, o build usa `mock` por padrão.** Não cadastre chaves Steam ou credenciais Firebase para esse deploy estático.

A abertura direta de `/wallpaper/:id` exige fallback para `index.html`. O Cloudflare Pages fornece esse comportamento para SPAs quando não existe `404.html` na raiz publicada, como neste projeto. Veja a [documentação de rotas SPA](https://developers.cloudflare.com/pages/configuration/serving-pages/) e o [relatório de preparação](docs/PREDEPLOY_REPOSITORY_REPORT.md).

Fluxo recomendado: `main` para produção e `dev` para desenvolvimento/preview. O CI valida Pull Requests e pushes nessas branches, sem sincronização de dados nem deploy. A conexão ao host e as configurações remotas ficam a cargo do proprietário.

## Documentação

- [Preparação do repositório e checklist de deploy](docs/PREDEPLOY_REPOSITORY_REPORT.md)
- [Correções pré-lançamento](docs/PRELAUNCH_FIXES_REPORT.md)
- [Expansão do catálogo real](docs/CATALOG_EXPANSION_REPORT.md)
- [Validação do frontend](docs/FRONTEND_VALIDATION_REPORT.md) e [polimento da interface](docs/FRONTEND_POLISH_REPORT.md)
- [Auditoria final da moderação e integridade](docs/CODEX_FINAL_AUDIT.md)
- [Arquitetura JSON-First](docs/JSON_ARCHITECTURE_REPORT.md)
- [Configuração Steam para manutenção](docs/STEAM_API_SETUP.md)
- [Guia histórico do Firestore](docs/FIREBASE_MIGRATION_GUIDE.md)

Os relatórios registram o estado de cada etapa; contagens históricas podem diferir do catálogo atual.

## Independência e licença

Wallpaper Engine é uma marca de seus respectivos titulares. Steam e Valve são marcas da Valve Corporation. Este projeto é independente e não é afiliado, patrocinado ou endossado pelo Wallpaper Engine, Steam ou Valve. Os conteúdos e previews pertencem aos seus respectivos titulares.

O repositório ainda não possui arquivo de licença; a escolha será feita pelo proprietário. Nenhuma licença de reutilização foi adicionada nesta preparação.
