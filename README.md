# WallpaperGallery

> Uma galeria independente para descobrir wallpapers do Wallpaper Engine disponíveis na Steam Workshop.

## Visão geral

O WallpaperGallery reúne wallpapers públicos da Workshop em uma interface visual para explorar temas e encontrar opções para o desktop. Você pode pesquisar, combinar filtros, comparar resultados e visitar o item original na Steam.

O catálogo atual conta com **979 wallpapers reais**, com paginação e páginas individuais de detalhes. O site utiliza metadados e previews públicos; os pacotes dos wallpapers continuam na Workshop.

## Funcionalidades

- **Exploração:** catálogo real, busca por título, tags e autor conforme os metadados disponíveis.
- **Filtros e ordenação:** encontre wallpapers por tipo, resolução e tema.
- **Navegação:** paginação, página individual por wallpaper e links para a Workshop.
- **Descoberta:** recomendações de wallpapers com características semelhantes nos detalhes.
- **Interface responsiva:** navegação em telas de desktop e dispositivos móveis.
- **Moderação por metadados:** classificações Steam, palavras-chave, tags e blacklist manual.
- **Catálogo estático:** navegação sem backend ou banco de dados obrigatório.

## Como funciona

O projeto segue uma abordagem **JSON-First**: os dados são coletados e moderados em uma etapa de manutenção; o frontend lê os arquivos estáticos já publicados.

```text
Steam Workshop
      ↓
Sincronização e moderação
      ↓
catalog.json
      ↓
manifest.json + index.json + shards
      ↓
Frontend React
```

O **manifesto** descreve o catálogo; o **índice** ajuda nas buscas, filtros e ordenação; os **shards** guardam os dados completos, carregados sob demanda. Atualmente são 40 shards, com até 25 wallpapers cada. A navegação não consulta a Steam API para sincronizar o catálogo.

## Stack

| Tecnologia | Uso |
| --- | --- |
| React 19 | Interface e componentes |
| TypeScript | Tipagem da aplicação e dos scripts |
| Vite | Desenvolvimento e build |
| Tailwind CSS | Estilos e responsividade |
| Node.js 24 | Ferramentas, scripts e testes |

Firebase/Firestore permanece como provider legado opcional. O catálogo estático de produção funciona independentemente dele.

## Executar localmente

Com **Node.js 24** instalado, execute na raiz do repositório:

```bash
npm ci
npm run dev
```

Sem configuração de provider, o aplicativo abre no modo de demonstração (`mock`). Para usar os **979 wallpapers reais**, inicie com:

```bash
VITE_DATA_PROVIDER=catalog npm run dev
```

Esse comando usa sintaxe Bash/POSIX. Em outros shells, configure `VITE_DATA_PROVIDER=catalog` em um arquivo `.env.local`, ignorado pelo Git, e execute `npm run dev`. O modo `catalog` não precisa de chave Steam ou configuração Firebase.

## Contribuir e testar

Desenvolva a partir de `dev`, mantenha as mudanças focadas e descreva no Pull Request o comportamento alterado e como foi validado. Correções são bem-vindas; para mudanças maiores, abra uma issue para discutir o escopo primeiro.

Antes de enviar uma contribuição, execute:

```bash
npm test
npm run typecheck
npm run build
```

Os testes são offline e bloqueiam chamadas de rede. O CI executa essas verificações em Pull Requests e pushes em `main` e `dev`.

Para conferir localmente a versão compilada com o catálogo real:

```bash
VITE_DATA_PROVIDER=catalog npm run build
npm run preview
```

O resultado fica em `dist/`. As variáveis `VITE_*` são aplicadas durante a compilação; alterações nelas exigem um novo build.

## Deploy

O projeto está preparado para hospedagem estática no Cloudflare Pages. O [guia completo de deploy manual](docs/CLOUDFLARE_PAGES_DEPLOY.md) explica a conexão do repositório, Production/Preview, configuração do build e validação após a publicação.

Defina **`VITE_DATA_PROVIDER=catalog` em Production e Preview** para publicar o catálogo real. Sem essa configuração, o provider padrão é `mock`.

## Dados e moderação

O projeto não hospeda os arquivos dos wallpapers nem substitui o Wallpaper Engine ou a Steam Workshop. Metadados e previews pertencem aos respectivos titulares; os links permitem acessar os itens originais.

A moderação combina classificação Steam, tags, palavras-chave em títulos/descrições e uma blacklist manual. **Não há análise visual automática**, e metadados incorretos ou incompletos podem exigir revisão manual. Os scripts de coleta são ferramentas de manutenção, separadas do deploy.

## Documentação técnica

- [Deploy manual no Cloudflare Pages](docs/CLOUDFLARE_PAGES_DEPLOY.md)
- [Arquitetura JSON-First](docs/JSON_ARCHITECTURE_REPORT.md)
- [Preparação pré-deploy](docs/PREDEPLOY_REPOSITORY_REPORT.md)
- [Expansão do catálogo](docs/CATALOG_EXPANSION_REPORT.md)
- [Validação do frontend](docs/FRONTEND_VALIDATION_REPORT.md) e [correções pré-lançamento](docs/PRELAUNCH_FIXES_REPORT.md)
- [Auditoria final de moderação e integridade](docs/CODEX_FINAL_AUDIT.md)
- [Configuração Steam para manutenção](docs/STEAM_API_SETUP.md)

Os relatórios documentam etapas específicas do desenvolvimento; suas contagens e decisões refletem a data de cada etapa.

## Licença e independência

O código está disponível sob a [licença MIT](LICENSE). Essa licença não concede direitos sobre wallpapers, previews ou marcas de terceiros.

Wallpaper Engine, Steam e Valve pertencem aos seus respectivos titulares. O WallpaperGallery é um projeto independente, sem afiliação, patrocínio ou endosso dessas marcas.
