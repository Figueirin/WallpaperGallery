# Auditoria e preparação para indexação

Data: **15/10/2026**, America/Sao_Paulo. Branch **dev**, base `08d82cd`. Parecer: **READY WITH SEO CAVEATS**.

A preparação local permite publicar sitemap e robots corretos e produzir metadados específicos após renderização da SPA. **O detalhe ainda entrega o shell genérico antes do JavaScript.** Não se afirma que os 5.000 wallpapers já estejam indexados nem que o sitemap sozinho resolva essa limitação. Não houve deploy ou acesso ao Search Console.

## Auditoria inicial e inventário

Working tree limpo em dev; status, branch, fetch e histórico dos 15 commits foram consultados antes das edições. O fetch atualizou somente referências remotas: `origin/main` avançou de `8dd34a2` para `9a22afa`; dev e origin/dev estavam em `08d82cd`. Não houve merge, alteração da main local (`da5ee5c`), reset ou mudança de catálogo.

A busca cobriu arquivos versionados, código, scripts, configurações, testes e documentação por canonical, robots, sitemap, OG/Twitter, JSON-LD/schema.org, noindex/nofollow/X-Robots-Tag, description, document.title, domínio oficial e workers.dev. Ocorrências históricas em relatórios foram preservadas; `canonical()` no script Firestore é uma função de serialização, sem relação com SEO.

| Recurso encontrado | Evidência inicial | Avaliação |
| --- | --- | --- |
| Title, description e OG/Twitter textuais | `index.html` | Já existiam em inglês, com branding correto; sem og:url ou imagens. |
| Metadados de detalhes | `src/utils/pageMetadata.ts`, `usePageMetadata.ts`, `WallpaperDetailView.tsx` | Title/description mudavam por JS; nenhum canonical, URL social ou schema individual. |
| Idiomas | `src/i18n/language.ts`, `translations.ts` | HTML lang, locale e textos EN/PT-BR já funcionavam. |
| JSON-LD | `index.html` | WebSite básico, sem URL pública. |
| robots.txt | `public/robots.txt` | Permitindo crawl, mas sem sitemap. |
| Sitemap | Ausente | `/sitemap.xml` público devolvia HTML da SPA. |
| Links internos | `WallpaperCard.tsx`, `WallpaperRecommendations.tsx` | Links reais `/wallpaper/ID`, com SPA por interceptação de clique. Não precisaram de alteração. |
| Conteúdo e independência | `App.tsx`, `Footer.tsx`, traduções | Texto renderizado descrevia catálogo/Steam/Wallpaper Engine e projeto independente. Disclaimer foi tornado explícito quanto à ausência de afiliação. |
| Favicon / manifest | `public/favicon.svg` | Favicon existente preservado; não havia webmanifest nem necessidade de criar PWA. |
| noindex / nofollow / X-Robots-Tag | Código e configurações locais | Nenhum bloqueio público encontrado. Não há rotas administrativas locais a excluir. |
| Host | `wrangler.jsonc` | Static Assets com fallback SPA já configurado. Não alterado. |

Referências da implementação final: [origem/canonical](../src/config/site.ts#L2), [gerador e validação](../scripts/generate-sitemap.ts#L8), [JSON-LD](../src/utils/pageMetadata.ts#L20), [mutação de metadados](../src/utils/pageMetadata.ts#L34), [bootstrap da rota](../src/main.tsx#L10), [integração do detalhe](../src/components/WallpaperDetailView.tsx#L47), [substituição no HTML Vite](../vite.config.ts#L10) e [testes SEO](../tests/seo.test.mjs#L1).

## Observação do site público atual

Consultas públicas somente leitura com curl, sem login. A primeira tentativa com urllib recebeu 403; curl com User-Agent comum recebeu 200. Isso não permite inferir como o host responde especificamente ao Googlebot.

| URL | Resultado observado antes de qualquer publicação desta tarefa |
| --- | --- |
| `https://wewallpapers.cc/` | 200, text/html, 2.016 bytes. |
| `https://wewallpapers.cc/wallpaper/3299228616` | 200, text/html, mesmos bytes da home. |
| `https://wewallpapers.cc/robots.txt` | 200, text/plain; somente User-agent e Allow. |
| `https://wewallpapers.cc/sitemap.xml` | **200, text/html; mesmos bytes da home, não XML.** |
| `http://wewallpapers.cc/` | Ao seguir redirecionamento, terminou em HTTPS com 200. |
| `https://www.wewallpapers.cc/` | Falha de resolução DNS neste ambiente; não se presume configuração global. |

Home, detalhe e falso sitemap tinham o mesmo SHA-256, prefixo `bcced8a4d5773b9c`. Não havia X-Robots-Tag nos cabeçalhos da home/detalhe observados. O fallback de detalhe funciona no host atual, mas o conteúdo específico depende de JS. Esses testes observam a versão já publicada pelo proprietário; as mudanças desta tarefa continuam locais.

## Alterações implementadas

### Origem e canonical

`src/config/site.ts` centraliza `SITE_URL=https://wewallpapers.cc`, nome, imagem default e construção de canonical. A origem não deriva de localhost, workers.dev, headers ou variáveis de ambiente.

`pageMetadata.ts` e o hook existente foram ampliados, sem criar um segundo gerenciador de metadados. Home e variantes de filtro apontam para `https://wewallpapers.cc/`; detalhes usam `/wallpaper/ID`. Existe exatamente um canonical no DOM ativo. O bootstrap em `main.tsx` define a rota antes de esperar React/dados; navegação e idioma atualizam os mesmos elementos.

**Decisão deliberada:** não incluir um canonical fixo da homepage no HTML comum a todas as rotas. Isso declararia um canonical incorreto no HTML bruto dos detalhes e exigiria trocá-lo depois. O Google recomenda, quando não é possível defini-lo corretamente no HTML de cada rota, [omiti-lo do HTML original e inseri-lo com JS](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). A consequência é que até o canonical da home depende de execução do cliente. Não se apresenta essa solução como equivalente a canonical específico entregue pelo servidor.

### Title, description, social e dados estruturados

O título público existente foi preservado: `WallpaperGallery | Wallpaper Engine wallpapers`. A descrição explicita a galeria independente. O detalhe mantém título real + produto, descrição real reduzida a 180 caracteres ou fallback traduzido. Dados externos continuam no idioma original; atribuições e ratings não foram inventados.

OG inclui type website, title, description, url, image, site_name e locale. Twitter usa summary_large_image, title, description e image. O fallback `public/social-card.png`, 1200×630, é um asset real criado para o projeto, sem mídia de terceiros. Detalhes usam o preview HTTPS real quando válido; URLs com esquema ativo, HTTP ou credenciais são recusadas para esse uso. Não se afirma ter testado disponibilidade remota de cada imagem.

JSON-LD inicial: WebSite, nome, URL oficial e idiomas EN/PT-BR. Após renderização do detalhe: WebPage com URL, nome, descrição, idioma da interface, referência ao WebSite e ImageObject do preview. Não foram inventados Review, AggregateRating, autoria ou licença das imagens. Os valores são escritos por propriedades DOM/textContent, sem interpolar metadados externos como HTML.

`index.html` usa um marcador de origem substituído pelo hook `transformIndexHtml` do Vite, em dev e build. Assim, a origem canônica fica centralizada também para o HTML gerado. `theme-color` foi acrescentado; favicon e branding foram preservados. Não se criou webmanifest ou app instalável sem necessidade.

### Sitemap e robots

`scripts/generate-sitemap.ts` usa exclusivamente `public/data/catalog.json`. Valida a estrutura, IDs decimais uint64 positivos, unicidade e ausência de simulados. Rejeita entrada inválida antes de escrever saídas. Não consulta Steam/Firebase, backups ou quarentena.

Saída versionada: `public/sitemap.xml`, **345.094 bytes, 5.001 URLs únicas**, UTF-8, uma home e todos os 5.000 wallpapers. Sem queries, hashes, mocks, localhost, workers.dev ou URLs públicas HTTP. O namespace XML usa o identificador padrão HTTP do protocolo, não uma URL de página do site. Não inclui lastmod, priority ou changefreq: não há data confiável de alteração da página. Um único arquivo basta; não houve sharding de sitemap. O Google documenta [limites e uso de datas confiáveis](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

`public/robots.txt` permite crawl normal e anuncia `https://wewallpapers.cc/sitemap.xml`. Não bloqueia `/wallpaper/`, `/data/`, JS ou CSS. Não usa noindex em robots.txt. O build executa `npm run seo:generate` antes de tsc/Vite e copia os arquivos para dist; o sitemap não entra no bundle nem dispara sincronização/rebuild. A geração também tem comando manual próprio.

## HTML bruto versus renderizado

O preview e o navegador verificaram a diferença, não apenas a existência dos arquivos.

| Elemento | Antes de JS, home e detalhe direto | Depois de JS na home | Depois de JS no detalhe |
| --- | --- | --- | --- |
| Title / description | Textos genéricos da home, em inglês | Textos da home no idioma selecionado | Título e descrição do wallpaper. |
| Canonical | **Ausente**, pelo motivo explicado acima | Origem oficial `/`, sem filtros | Origem oficial `/wallpaper/ID`. |
| og:url | Origem oficial `/` | Origem oficial `/` | URL específica. |
| OG/Twitter imagem | Social card default local | Social card default local | Preview HTTPS real ou fallback. |
| JSON-LD | WebSite genérico | WebSite no idioma ativo | WebPage + ImageObject específico. |
| Conteúdo e links | Root vazio e noscript resumido | Galeria/texto/links após carregar JSON | Conteúdo e recomendações após carregar JSON. |

O Google processa JavaScript, mas [a renderização é uma etapa adicional](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). Bots sociais que não executam JS continuarão vendo o título, og:url e imagem genéricos. Sitemap não elimina essas limitações. Não foi gerado HTML por wallpaper, instalado SSR ou trocado o framework.

**Prerender/SSR:** é uma possível próxima tarefa se for necessário conteúdo/meta específico sem JS ou se URL Inspection mostrar falhas persistentes. Gerar 5.000 HTMLs aumenta inventário, tempo de geração e responsabilidades de sincronização; apenas injetar metatags não resolve conteúdo vazio. Primeiro publicar estas mudanças com autorização e medir uma amostra renderizada no Search Console. Não há evidência atual de que os 5.000 detalhes já estejam indexados nem de que prerender seja obrigatório para todos eles.

## Links, infinite scroll e duplicação

Cards e recomendações reutilizam anchors reais e preservam navegação SPA. O navegador abriu um detalhe por clique num card, sem depender de navegação anterior no teste direto. Os testes existentes de infinite scroll permanecem passando, inclusive 200 lotes, ausência de duplicados e término correto.

Não se pressupõe que o Google role a página: a [orientação Google para lazy loading](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading) exige atenção à descoberta de conteúdo progressivo. O sitemap lista cada detalhe diretamente e as recomendações oferecem caminhos adicionais; os links continuam dependendo da renderização. Não se adicionaram milhares de links ocultos ou paginação visual antiga.

Filtros e busca não entram no sitemap e canonizam para a home. EN/PT-BR compartilham URLs, com preferência local; não se inventou hreflang para rotas de idioma inexistentes.

Não havia hostname workers.dev específico no código público a substituir; referências em guias descrevem o host anterior. Se esse hostname continuar acessível, o canonical renderizado aponta para wewallpapers.cc; isso é um sinal, não garantia de escolha pelo Google. O proprietário pode avaliar redirect posteriormente. Nenhuma configuração remota, DNS ou regra versionada de roteamento foi alterada.

Rotas inexistentes ainda recebem 200 pelo fallback e mostram estado de item não encontrado após JS: risco residual de soft 404, fora do sitemap. Não foram incluídas URLs inexistentes nem adicionado noindex ao shell compartilhado, que impediria indexar conteúdo válido.

## Testes, preview e desempenho

| Validação | Resultado |
| --- | --- |
| `npm test` | **222 aprovados**, 37 suites, zero falhas, skips, cancelados ou todo. |
| `npm run typecheck` | Aprovado. |
| `npm run build` | Aprovado; geração de 5.001 URLs, aviso conhecido de Firestore lazy. |
| XML | Parser XML ElementTree independente confirmou namespace, 5.001 entradas e unicidade; teste automatizado também valida o formato completo e conjunto oficial. |
| dist | index.html, robots.txt, sitemap.xml, social-card.png, favicon e assets presentes; sem marcador de origem não resolvido. |
| Preview HTTP | Home e detalhe 200 text/html; robots 200 text/plain; sitemap 200 text/xml; social card 200 image/png. |
| Firefox 153 headless | Home, clique SPA, detalhe direto `3299228616`, refresh, seletor PT-BR e home filtrada: canonical único/correto e metadados atualizados. |
| Dados protegidos | Hashes de **261 arquivos** (`.env`, todos os JSONs reais e backups) preservados; catálogo segue com 5.000 itens e 200 shards de 25. |

Os seis testes SEO novos chamam gerador e utilitários de produção. Os testes anteriores continuam ativos; as expectativas do HTML foram atualizadas para o domínio autorizado, imagem social e idiomas declarados, preservando os demais asserts. O teste de restauração do helper textual permanece. O teste de mutação percorre home → detalhe A → detalhe B → home, EN/PT, verificando URL, imagem, canonical único e JSON-LD.

O Firefox foi executado com perfil temporário, imagens desabilitadas e proxy que bloqueia destinos externos, permitindo somente localhost. A validação comprova DOM e navegação; não é teste de mídia externa, Googlebot ou infraestrutura Cloudflare. O preview local não substitui a verificação pós-deploy no domínio. Servidores e navegador temporários foram encerrados ao final.

| Bundle minificado / gzip | Antes | Depois |
| --- | ---: | ---: |
| JS principal | 318,04 / 94,55 kB | 320,13 / 95,58 kB |
| Firestore lazy | 570,23 / 149,24 kB | 570,23 / 149,24 kB |
| CSS | 42,68 / 7,88 kB | 42,68 / 7,88 kB |

JS principal cresceu aproximadamente 2,09 kB minificados / 1,03 kB gzip. Nenhuma dependência adicionada; sitemap e catálogo não estão embutidos no JS. O build Vite reportou 3,65 s versus 3,34 s anterior; execução pontual não é benchmark estatístico. A PNG social tem 61.129 bytes e só é um asset estático.

## Parecer e próximos passos

**READY WITH SEO CAVEATS.** Os artefatos e o comportamento local estão preparados para descoberta e renderização pelo Google, com ressalva explícita de CSR, metadados brutos genéricos nos detalhes e ausência de validação no Search Console. Não é confirmação de ranking ou indexação.

Após publicação autorizada: conferir que sitemap deixou de retornar HTML, inspecionar home e alguns detalhes no Search Console, enviar sitemap e acompanhar renderização/canonical/indexação. O guia [GOOGLE_INDEXING.md](GOOGLE_INDEXING.md) descreve verificação DNS e acompanhamento sem token inventado. Depois decidir sobre prerender com base nessa evidência e na necessidade de previews sociais específicos.

Somente dev foi alterada. Nenhuma chamada Steam API, gravação Firebase, edição de `.env`, exclusão de backup, alteração Cloudflare/DNS/Search Console ou deploy. Commit local previsto: `feat: prepare site for search indexing`. Push de dev é opcional e não altera main; não foi executado nesta entrega.
