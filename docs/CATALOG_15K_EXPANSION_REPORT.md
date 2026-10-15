# Expansão controlada de 5K para 15K

Data: **15/10/2026**, America/Sao_Paulo. Branch **dev**, base `1735111`. Parecer: **JSON-FIRST COM RESSALVAS PARA 15K**.

O catálogo final tem **15.000 wallpapers únicos aprovados**, **600 shards de 25** e sitemap com **15.001 URLs**. Todos os 5.000 itens anteriores foram preservados integralmente, incluindo autoria resolvida, descrições e demais campos. Não houve deploy, alteração de main, DNS, Cloudflare ou Search Console.

## Estado inicial, backup e execução

Após o proprietário trocar de main para dev, foram conferidos status, branch, fetch e histórico recente. A working tree estava limpa, dev/origin/dev em `1735111`. A main local foi registrada antes da execução e comparada ao final, sem mudança. O snapshot inicial de 5.000 itens, 200 shards e 5.001 URLs foi reconstituído em memória e validado com o sharder/moderador de produção.

Antes da primeira chamada real foi criado backup completo, exclusivo, sem sobrescrever históricos:

```text
.moderation/backups/pre-15k-2026-10-15T22-03-18-182Z/
```

Contém catalog.json, manifest/index/pages, sitemap.xml e robots.txt. **263 hashes protegidos**, incluindo .env e todos os backups, permaneceram idênticos. Há também fixture versionada de hashes dos 5.000 objetos originais em `tests/fixtures/pre-15k-catalog.json`; os testes dos 979 e 178 históricos continuam ativos.

Foi reutilizado `scripts/expand-catalog.ts`, sem alterar moderação, normalizador, frontend ou arquitetura. Mudanças locais: teto máximo passou de 12.000 para **25.000 candidatos** e foram adicionados contadores por fonte de duplicação/rejeição. Checkpoints novos usam versão 2 e recusam versão 1, evitando retomar dados sem os novos contadores. Checkpoints históricos não foram modificados.

Escolha do orçamento: além dos 10.000 novos aprovados necessários, a descoberta reencontra grande parte dos 5.000 existentes e rejeita metadados adultos. Por isso foi usado o limite superior sugerido, mantendo parada antecipada pela meta. Execução autorizada:

```bash
npm run sync:expand -- --authorize-real-expansion --target=15000 --max-candidates=25000 --staging=.moderation/expansion-15k
```

Cursor separado por fonte, deduplicação global por string Workshop ID, checkpoint por lote e gravação privada foram preservados. Lotes até 100, sequenciais, intervalo 450 ms, timeout 20 s, até três tentativas por lote com backoff e tratamento de 429/5xx. Cursor repetido, vazio ou sem avanço encerra a fonte; falha persistente aborta sem trocar catálogo público. Não houve enriquecimento massivo de autores ou download de imagens/pacotes.

## Resultado da descoberta

| Medida | Resultado |
| --- | ---: |
| Inicial / final | 5.000 / **15.000** |
| Examinados | 24.039 |
| Duplicados | 5.002 |
| Rejeitados únicos novos | 9.037 |
| Novos aprovados | 10.000 |
| Aprovação sobre examinados | 41,60% |
| Aprovação entre únicos novos | 52,53% |
| Lotes concluídos | 241 |
| Coleta até último checkpoint | 493,93 s |

Contabilidade: examinados = duplicados + rejeitados + novos aprovados. O último lote é processado somente até atingir a meta; respostas eventualmente excedentes não são adicionadas nem contadas como examinadas. Lotes concluídos não equivalem necessariamente ao número de tentativas HTTP de retry.

| Fonte | Examinados | Novos aprovados | Duplicados / taxa sobre fonte | Rejeitados / taxa sobre fonte |
| --- | ---: | ---: | ---: | ---: |
| popular | 16.800 | 6.143 | 3.562 (21,20%) | 7.095 (42,23%) |
| recent | 7.239 | 3.857 | 1.440 (19,89%) | 1.942 (26,83%) |

A proporção de candidatos foi **69,89% popular / 30,11% recent**. A proporção é de descoberta, não promessa de 70/30 entre aprovados. Um ID é atribuído à primeira fonte que o aprova; aparições posteriores contam como duplicação na outra fonte.

Motivos de rejeição por categoria: `{"metadata_keyword": 797, "steam_rating": 8989, "unavailable_or_wrong_app": 3}`. Categorias podem se sobrepor no mesmo item; não devem ser somadas como se fossem itens distintos. Mature e Questionable continuam bloqueados; Unrated/ausente passa somente pelos demais filtros. Blacklist, texto e validação continuam obrigatórios. Nenhuma regra foi afrouxada para alcançar a meta e nenhuma análise visual foi adicionada. Aprovação por metadados não garante ausência visual de conteúdo adulto.

## Preparação, promoção e integridade

A reconstrução foi feita no staging, usando `rebuildCatalog` e o escritor de produção, com backups próprios preservados. Antes da promoção, uma cópia temporária sem .env recebeu o novo snapshot e passou testes, typecheck e build. Sitemap e robots foram gerados nesse staging com `generateSeoFiles`. O snapshot público de 5K só foi substituído após essas validações.

A promoção preparou consolidado/sitemap/robots em temporários, adquiriu o lock do consolidado e usou o escritor de shards existente. Havia restauração byte a byte dos arquivos anteriores e remoção somente das novas páginas em caso de falha tratável. Não houve falha; não se promete atomicidade absoluta contra queda abrupta entre arquivos. O backup independente continuou intacto e permite rollback completo, incluindo inventário de páginas. Não é suficiente restaurar só catalog.json.

Conferências finais: IDs únicos; zero simulados; IDs decimais válidos; nenhum dado de fixture introduzido; URLs de preview e Workshop estruturalmente válidas; todos os itens aprovados pelo moderador atual; igualdade de conteúdo/IDs entre consolidado, índice, itemToPage e shards; 600 páginas sem extras; última página com 25; sitemap com exatamente o mesmo universo mais homepage. Não se verificou disponibilidade remota de cada preview nem se reconsultaram todos os itens antigos.

A chave Steam foi lida apenas no processo local. Não foi impressa, colocada na linha de comando, VITE_*, relatórios, JSONs públicos ou Git. Comparação exata final contra arquivos modificados e dist não encontrou o segredo. .env foi preservado; testes bloqueiam rede externa. Não houve acesso/gravação Firebase.

## Tamanhos medidos

Bytes brutos, gzip local aproximado; não representam negociação/compressão efetiva do host.

| Medida | 5K | 15K | Crescimento |
| --- | ---: | ---: | ---: |
| catalog.json | 6.120.562 | 16.916.715 | 176,39% |
| index.json | 2.722.992 | 6.776.321 | 148,86% |
| manifest.json | 144.936 | 437.308 | 201,72% |
| pages/ total | 6.120.960,00 | 16.917.913,00 | 176,39% |
| Shard médio | 30.604,80 | 28.196,52 | -7,87% |
| Maior shard | 52.947,00 | 53.104,00 | 0,30% |
| public/data/catalog/ | 8.988.888,00 | 24.131.542,00 | 168,46% |
| JSONs públicos, incluindo consolidado | 15.109.450,00 | 41.048.257,00 | 171,67% |
| Shards | 200 | 600 | 200% |
| JSONs públicos | 203 | 603 | — |

| Compressão / parse | 5K | 15K |
| --- | ---: | ---: |
| index gzip, bytes | 859.492 | 2.105.562 |
| manifest gzip, bytes | 37.104 | 107.997 |
| shard médio gzip, bytes | 8.103,01 | 7.057,96 |
| Parse puro do índice, mediana 7 execuções | 7,01 ms | 19,37 ms |
| Heap adicional aproximado do índice parseado | 4,52 MB | 11,46 MB |

Heap medido em Node com GC explícito, isolando a alocação do parse dentro do benchmark, sem equivaler a memória de aba móvel. O provider ainda mantém índice, shards e objetos renderizados; strings/temporários também custam memória. Não se conclui saúde móvel apenas com parse rápido no desktop.

## Tempos, build e bundle

| Etapa | 5K | 15K |
| --- | ---: | ---: |
| Rebuild em cópia/staging | 354,96 ms | 880,41 ms |
| Testes completos | 2,59 s | 3,89 s |
| Typecheck | 4,85 s | 4,42 s |
| Build completo, incluindo SEO/tsc/Vite | 8,10 s | 7,44 s |

Bundle/etapa interna Vite e resultado final da suíte estão descritos na verificação final abaixo. Build não chama Steam ou Firebase, não reconstrói catálogo e não incorpora sitemap/catalog/index ao JS principal. Não houve instalação de dependências, alteração do Intl.Collator, CSS, cards, rotas, i18n ou UX.

## Provider e infinite scroll

Mesmo benchmark simples da expansão anterior, com provider real e fetch de arquivos locais, executado para os dois snapshots. Para cada consulta, IDs e total foram comparados ao filtro/ordenador completo de produção. Primeira chamada inclui IO/parse/validação/materialização; segundo número é mediana de sete chamadas com cache aquecido, sem re-fetch (operações reais de filtro/busca/ordenação, não uma reimplementação do algoritmo).

| Consulta | 5K frio / aquecido, ms | 15K frio / aquecido, ms | Shards materializados na primeira consulta 15K |
| --- | ---: | ---: | ---: |
| Primeiro lote | 53,52 / 0,01 | 5,34 / 0,00 | 1 |
| Busca anime | 21,41 / 7,13 | 53,19 / 13,50 | 3 |
| Tipo Scene | 18,79 / 0,44 | 42,94 / 2,30 | 3 |
| 1920x1080 | 21,47 / 0,54 | 79,31 / 1,30 | 4 |
| Tag Anime | 17,41 / 0,63 | 37,78 / 2,08 | 4 |
| Everyone | 20,74 / 0,48 | 69,25 / 2,63 | 1 |
| Combinados + data | 19,97 / 0,84 | 44,09 / 5,18 | 15 |
| Popularidade | 1,76 / 0,00 | 3,50 / 0,00 | 1 |
| Data crescente | 23,62 / 0,10 | 60,68 / 1,09 | 21 |
| Data decrescente | 17,04 / 0,11 | 40,75 / 0,79 | 6 |
| Título | 31,76 / 1,00 | 76,97 / 3,57 | 24 |

Primeiros três lotes retornaram 25, 50 e 75 acumulados, carregando manifesto + um, dois e três shards respectivamente, sem índice para o modo padrão. Cache evitou refetch. A suíte percorre os **600 lotes até 15.000**, confirma unicidade, último lote correto e ausência de novas requisições depois de hasMore=false. Sob filtro global, o índice é carregado e só os shards necessários aos 25 resultados são materializados; resultados dispersos podem exigir vários shards.

Esses números são locais, não latência de rede/tempo de renderização móvel. Chamadas frias isoladas sofrem aquecimento de runtime/GC; não são benchmark estatístico. Não há evidência de crash nos fluxos medidos, mas índice global e acúmulo de cards numa sessão longa continuam pontos de atenção. Não foi fragmentado o índice nem introduzido backend.

## SEO e limites de indexação

Sitemap único regenerado: **15.001 URLs**, homepage + 15.000 detalhes, somente https://wewallpapers.cc, sem filtros, duplicatas, localhost, workers.dev ou datas/priority/changefreq inventados. XML validado com parser independente. Robots continua byte a byte igual, anunciando a mesma URL de sitemap e sem bloquear recursos. Canonical, OG/Twitter, JSON-LD, favicon e social card foram preservados.

A SPA mantém o shell genérico antes de JS e metadados/conteúdo específicos depois. Aumentar o número de URLs não elimina a etapa de renderização do crawler. Não houve prerender. Após deploy autorizado, medir URL Inspection e indexação de amostras; sitemap é descoberta, não promessa de indexação. Guias: [indexação](GOOGLE_INDEXING.md), [auditoria SEO anterior](SEO_INDEXING_AUDIT.md).

## Impacto no repositório

Inventário considera arquivos versionados e dados novos da tarefa; não inclui node_modules, dist nem backups/staging ignorados.

| Medida | Antes | Depois de staging Git |
| --- | ---: | ---: |
| Arquivos versionados/preparados | 326 | 728 |
| Bytes lógicos dos arquivos | 16.538.274 | 43.604.856 |
| Bytes dos arquivos internos .git | 9.419.573 | 21.302.344 |

Crescimento lógico nesta expansão: **27,07 MB**. São 400 páginas novas, além de fixture/relatório; os demais arquivos são modificações. .git foi medido após preparar os objetos desta tarefa e antes do commit; o pequeno objeto de commit/última versão do relatório pode variar depois. Não houve gc, reescrita de histórico ou force push.

Um snapshot de algumas centenas de arquivos segue administrável. Atualizações recorrentes de JSONs grandes e reordenação por popularidade podem alterar muitos shards e acumular histórico; tamanho de um snapshot não prevê exatamente tamanho de clones futuros. Não há limiar universal de Git, mas as projeções de centenas de MB/GB e milhares de arquivos abaixo tornam inadequado tratar histórico massivo como custo desprezível. Armazenamento de dados fora do repositório merece avaliação antes dessas escalas, em tarefa separada.

## Projeções, não benchmarks executados

Estimativa marginal: valor medido em 15K + (valor15K − valor5K) / 10.000 × (N − 15.000). Presume composição/compressibilidade semelhantes; descrições, idiomas e mídia podem mudar a média. Valores aproximados em MB decimais, não garantia nem extrapolação linear de tempos de CPU.

| Wallpapers | Consolidado bruto | Índice bruto | Índice gzip | Shards de 25 | Sitemaps mínimos, incluindo home | Total JSON bruto |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 50.000 | 54,70 MB | 20,96 MB | 6,47 MB | 2000 | 2 | 131,83 MB |
| 100.000 | 108,68 MB | 41,23 MB | 12,70 MB | 4000 | 3 | 261,53 MB |
| 500.000 | 540,53 MB | 203,36 MB | 62,54 MB | 20000 | 11 | 1.299,08 MB |

O [Google limita cada sitemap a 50.000 URLs e 50 MB sem compressão](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). **50.000 wallpapers + home são 50.001 URLs**, portanto já exigem 2 arquivos; 100K exigem 3 e 500K exigem 11 nesse cálculo mínimo. Acima do limite, adotar sitemap index e múltiplos arquivos, verificando também bytes. Sharding não foi implementado agora.

A [Cloudflare documenta 25 MiB por Static Asset e 20.000/100.000 arquivos por versão nos planos Free/Paid](https://developers.cloudflare.com/workers/platform/limits/). O snapshot 15K foi conferido contra o limite por arquivo; não houve deploy para validar a conta/plano. O consolidado público projetado para 50K excede 25 MiB; índice também cresce até exceder esse limite nas escalas seguintes. Em 500K, só os 20.000 shards já consomem todo o limite Free, antes dos demais assets. Esses são limites da publicação atual, além da experiência no navegador.

| Escala | Parecer para o fluxo atual, sem mudanças adicionais | Motivo |
| --- | --- | --- |
| 15K | **APROVADO COM RESSALVAS** | Integridade e fluxos locais aprovados; índice global demanda validação em rede móvel e memória/renderização prolongada. |
| 50K | **NÃO RECOMENDADO** | Consolidado público projetado excede limite por asset; índice global e busca client-side ficam caros em rede/dispositivo modestos. |
| 100K | **NÃO RECOMENDADO** | Transferência, parse, buscas completas, assets grandes e histórico Git deixam de ser custo pequeno. |
| 500K | **NÃO RECOMENDADO** | Centenas de MB de índice/dados projetados, pressão de memória, 20.000 shards, limites de publicação e histórico massivo. |

Isso não condena arquivos JSON como formato. Pode-se preservar dados estáticos enquanto se muda distribuição/índice/busca, mas nenhuma arquitetura alternativa foi implementada nesta tarefa. O resultado em 15K não autoriza extrapolar conforto para 50K/100K/500K.

## Manutenção futura e parecer

Preservada a proposta de **150 candidatos/dia**, aproximadamente 105 populares e 45 recentes: coletar → deduplicar → moderar → adicionar aprovados → rebuild no staging → seo:generate → testar → publicação autorizada. São candidatos, não obrigação de 150 inclusões. Um staging novo evita confundir expansão futura com resume; revisitar sempre o topo pode dar baixo rendimento, como mostrou o começo desta coleta. Não foi criado cron, scheduler ou workflow agendado.

Revalidação remota de itens antigos removidos, rating/metadados alterados e previews quebrados permanece recomendação futura, não varredura executada. A preservação atual é integral dos metadados válidos existentes.

**JSON-FIRST COM RESSALVAS PARA 15K.** O snapshot está consistente e a arquitetura foi preservada. Validar rede/dispositivos móveis e o comportamento hospedado antes de novo salto. Main, .env e backups intocados; nenhuma alteração remota ou deploy. Commit local solicitado: `feat: expand wallpaper catalog to 15k items`. Não houve push nesta entrega.

## Verificação final da entrega

- `npm run seo:generate`: aprovado, 15.001 URLs. Sitemap XML parseado independentemente e conjunto de IDs comparado ao consolidado.
- `npm test`: **224 aprovados, 37 suites, zero falhas, skips, cancelados ou todo**. Os dois novos testes cobrem orçamento/contabilidade por fonte e preservação integral dos 5.000 anteriores. A contagem real de tags passou de 50 para 53 (`Audio visualizer`, `Image`, `Portrait Standard Definition`); o snapshot foi atualizado após conferir os valores. Nenhuma proteção foi retirada.
- `npm run typecheck` e `npm run build`: aprovados, também na cópia isolada sem .env antes da promoção. Vite reportou 4,22 s antes / 4,19 s depois; o comando completo está na tabela.
- JS principal: **320,13 kB / 95,58 kB gzip antes e depois**. Firestore lazy: **570,23 / 149,24 kB**, sem mudança; permanece o aviso conhecido acima de 500 kB. CSS gerado: **42,68 / 7,88 kB → 42,90 / 7,91 kB**, sem edição das folhas/classes de produção.
- `dist/`: **611 arquivos**, incluindo 603 JSONs do catálogo, index.html, sitemap.xml, robots.txt, social-card.png, favicon e três assets JS/CSS. Maior asset: catalog.json, **16.916.715 bytes**, abaixo de 25 MiB.
- Preview local: home e detalhe 200 HTML; robots 200 texto; sitemap 200 XML; social card 200 PNG. O detalhe bruto retorna o mesmo shell inicial da home.
- Firefox 153 headless, perfil temporário com destinos externos bloqueados: clique SPA, detalhe direto `/wallpaper/3299228616`, refresh, canonical único/correto, home filtrada canonizada para `/` e idioma PT-BR passaram. Metadados específicos aparecem depois de JS; não foi introduzido prerender. Servidor e navegador foram encerrados.
- **263 hashes protegidos** intactos. Publicação local idêntica ao staging aprovado; main local preservada e fonte do frontend/SEO/Intl.Collator sem alterações. Comparação do segredo em arquivos modificados e dist passou sem exibir o valor.
- Staging e backups locais permaneceram preservados; nenhum push ou deploy executado.
