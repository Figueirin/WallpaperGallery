# Expansão controlada para 5.000 wallpapers

Data: **15/10/2026**, America/Sao_Paulo. Branch: **dev**. Base: `8dd34a2`. Parecer: **JSON-FIRST COM RESSALVAS PARA 5K**.

A coleta real autorizada terminou com **5.000 IDs únicos aprovados**, preservando integralmente os **979 wallpapers anteriores**. São **200 shards de 25 itens**, inclusive o último. Os fluxos locais de busca, filtros, ordenação e infinite scroll passaram. A ressalva é o custo do índice global em redes/dispositivos móveis, ainda sem medição em navegador hospedado. Não houve deploy, alteração de main ou acesso ao Firebase.

## Estado inicial e backup

O working tree estava limpo em dev. Foram executados status, confirmação da branch, fetch e inspeção dos 15 commits recentes. Após fetch, HEAD/dev/origin/dev/origin/main apontavam para `8dd34a2`; a main local permaneceu em `da5ee5c`. Não houve merge nem alteração dessa referência.

Antes da primeira chamada Steam, o catálogo de 979 itens foi conferido e copiado integralmente, com manifesto, índice e 40 páginas, para:

```text
.moderation/backups/pre-5k-2026-10-15T20-26-38-769Z/
```

O backup anterior e todos os backups históricos foram preservados. Os **58 arquivos protegidos**, incluindo `.env` e os backups, mantiveram seus hashes SHA-256. A fixture versionada `tests/fixtures/pre-5k-catalog.json` registra os hashes dos objetos dos 979 itens e permite verificar todos os campos sem depender de backups ignorados pelo Git.

## Coleta real e resultados

Foi acrescentado `scripts/expand-catalog.ts`, comando `sync:expand`, porque o sincronizador comum não oferecia a descoberta limitada, com cursor, checkpoint e meta aprovada exigida nesta expansão. Ele reutiliza o normalizador Steam e o `ModerationPipeline` existentes; escreve somente staging privado. A publicação é uma etapa separada.

Foi utilizado `IPublishedFileService/QueryFiles/v1`, app 431960, `query_type=0` para populares e `1` para recentes. A primeira consulta usa `cursor=*`; as seguintes seguem `next_cursor`, sem combinar cursor com paginação numérica. São pedidos tags, previews, votos e metadados. O contrato de cursor é documentado pela [Steam, QueryFiles](https://partner.steamgames.com/doc/webapi/IPublishedFileService).

| Medida | Resultado |
| --- | ---: |
| Catálogo inicial | 979 |
| Candidatos examinados | 6.452 |
| Duplicados | 978 |
| Novos candidatos rejeitados | 1.453 |
| Novos aprovados | 4.021 |
| Catálogo final | **5.000** |
| Limite configurado | 10.000 candidatos |
| Lotes concluídos | 65 |
| Tempo de coleta/checkpoints | aproximadamente **143,4 s** |
| Aprovação sobre examinados | **62,32%** |
| Aprovação entre candidatos únicos novos | **73,46%** |

A contabilidade fecha: 978 + 1.453 + 4.021 = 6.452. O último lote foi processado apenas até atingir a meta: 52 candidatos analisados; os 48 restantes não entraram na contagem. Os 65 lotes incluem a consulta inicial reaproveitada e não representam uma contagem de tentativas HTTP adicionais de retry.

| Estratégia | Examinados | Proporção dos candidatos | Novos aprovados |
| --- | ---: | ---: | ---: |
| Populares | 4.500 | 69,75% | 3.067 |
| Recentes | 1.952 | 30,25% | 954 |

A mistura 70/30 aplica-se à descoberta. Entre novos aprovados, a proporção resultante é 76,27%/23,73%, pois duplicação e moderação diferem entre as fontes. A atribuição corresponde à primeira fonte que apresentou cada ID novo.

Motivos de rejeição: **1.437** candidatos com motivo `steam_rating` e **135** com `metadata_keyword`. Um mesmo candidato pode ter ambos os motivos; portanto a soma das categorias excede os 1.453 itens rejeitados. Não houve mudança na política: Mature/Questionable bloqueados; Everyone e Unrated/ausentes sujeitos aos demais filtros; blacklist e texto prevalecem. Não houve análise visual ou download de imagens/pacotes.

Os 979 itens existentes foram reavaliados pela política local e mantidos sem merge de metadados raw sobre os campos anteriormente resolvidos. Não houve enriquecimento separado de autores nem nomes inventados. Isso não equivale a uma reconsulta remota dos itens antigos.

## Segurança, limites e recuperação

A coleta foi sequencial, com lotes de até 100, intervalo de 450 ms, timeout de 20 s, até três tentativas por lote e backoff de 750/1.500 ms, respeitando Retry-After numérico até 60 s. HTTP 429 e 5xx são tratados; falha persistente interrompe a execução. Cursor repetido, lote vazio ou sem novos IDs naquela fonte encerram a fonte, além dos limites de candidatos e aprovados.

A chave é lida do ambiente local, nunca de `VITE_*`, argumento de linha de comando ou arquivo público. Erros de transporte não propagam URLs com segredo; redirects são recusados. A chave não foi exibida. `.env` não foi alterado. A comparação final não encontrou a chave nos arquivos da tarefa nem em `dist/`.

O staging `.moderation/expansion-5k/` guarda checkpoint atômico por rename, cursores por fonte, IDs vistos e decisões. Um lock impede dois coletores no mesmo staging. A retomada recusa mudança de catálogo base, política registrada ou opções. Não se deve reutilizar esse checkpoint após publicar um catálogo diferente; uma nova expansão exige outro staging.

Execução utilizada, sem segredo na linha de comando:

```bash
npm run sync:expand -- --authorize-real-expansion --target=5000 --max-candidates=10000 --staging=.moderation/expansion-5k
```

A reconstrução foi executada **no staging**, usando o código de produção, depois validada numa cópia temporária sem `.env`: 216 testes, typecheck e build passaram antes de substituir os dados públicos. Na promoção local foi usado o escritor de shards de produção, com backup/rollback existente, lock do consolidado e substituição do consolidado preparado. Havia recuperação do conjunto antigo se a última substituição falhasse. Não houve falha na promoção; não se afirma atomicidade absoluta contra interrupção abrupta entre vários arquivos.

O backup completo permite recuperar o conjunto inteiro, incluindo remover páginas introduzidas pela expansão; copiar somente o consolidado não é rollback suficiente. Não foi necessário restaurá-lo. Nenhum backup foi apagado.

## Tamanhos antes/depois

Valores em bytes; gzip calculado localmente, sem afirmar que o host utilizará exatamente essa compressão.

| Medida | 979 itens | 5.000 itens | Crescimento |
| --- | ---: | ---: | ---: |
| Shards | 40 | 200 | 400% |
| `catalog.json` | 1.254.042 | 6.120.562 | 388,07% |
| `index.json` | 588.572 | 2.722.992 | 362,64% |
| `manifest.json` | 28.943 | 144.936 | 400,76% |
| `pages/` total | 1.254.120 | 6.120.960 | 388,07% |
| Shard médio | 31.353 | 30.604,8 | −2,39% |
| `public/data/catalog/` | 1.871.635 | 8.988.888 | 380,27% |
| JSONs de produção, incluindo consolidado | 43 | 203 | — |

O total final, consolidado mais diretório shardado, é **15.109.450 bytes**. O maior shard possui **52.947 bytes**. O consolidado é uma fonte de manutenção e não é baixado pelo fluxo normal do provider.

| Gzip | Antes | Depois |
| --- | ---: | ---: |
| Consolidado | 289.040 | 1.455.281 |
| Índice | 182.042 | **859.492** |
| Manifesto | 7.137 | 37.104 |
| Shard médio | 8.068,8 | 8.103,0 |

O tamanho médio dos shards permaneceu estável. O índice global cresceu para aproximadamente 2,72 MB/859 KB gzip e é o principal ponto de atenção antes de avançar para 10k ou mais. Não foi fragmentado automaticamente.

## Rebuild, testes e build

Tempos de uma execução local por etapa, com dependências já instaladas; variações pequenas não demonstram ganho de desempenho.

| Etapa | Antes | Depois |
| --- | ---: | ---: |
| Rebuild em cópia/staging | 86,65 ms | 325,16 ms |
| `npm test` completo | 1,77 s, 210 testes | **2,12 s, 216 testes** |
| `npm run typecheck` | 4,33 s | **4,12 s** |
| `npm run build` completo | 6,39 s | **6,19 s** |
| Vite, etapa interna reportada | 3,43 s | 3,34 s |
| JS principal minificado / gzip | 318,01 / 94,52 kB | 318,04 / 94,55 kB |
| Firestore lazy minificado / gzip | 570,23 / 149,24 kB | 570,23 / 149,24 kB |
| CSS minificado / gzip | 41,19 / 7,73 kB | 42,68 / 7,88 kB |

Os dois rebuilds mantiveram todos os itens de entrada aprovados e zero quarentenados. O aviso conhecido de chunk Firestore acima de 500 kB permanece; ele continua lazy. Não houve inclusão do catálogo no JS principal, instalação de dependências ou alteração do Wrangler/Static Assets. O build gerou os JSONs esperados em `dist/`; não houve deploy para validar compressão ou respostas do host.

Os seis testes novos exercitam o coletor de produção: contrato de cursor, retries/segredos, deduplicação e moderador, limites/ausência de avanço, mistura/serialização de estado e preservação integral dos 979 itens. Os testes existentes tiveram somente as contagens do snapshot atualizadas de 979/40/4 para 5.000/200/25 e tags de 45 para 50. Nenhuma proteção foi removida; o teste dos 178 IDs históricos permanece. Resultado final: **216 aprovados, 37 suites, zero falhas, skips, cancelados ou todo**. Os testes usam transporte offline; não fazem novas requisições à Steam.

## Provider, filtros e carregamento progressivo

Benchmarks chamam `StaticCatalogProvider` e `InfiniteCatalog` reais com fetch de arquivos locais. Totais e IDs da primeira página foram comparados ao filtro/ordenador de referência aplicado ao catálogo completo. Valores em ms, primeira consulta com novo provider; entre parênteses, repetição com cache.

| Consulta | 979 itens | 5.000 itens |
| --- | ---: | ---: |
| Busca `anime` | 15,51 (1,39) | 21,01 (7,45) |
| Tipo Scene | 4,85 (0,29) | 21,48 (1,14) |
| Resolução 1920x1080 | 6,46 (0,46) | 27,69 (0,72) |
| Tag Anime | 6,52 (0,25) | 14,79 (1,15) |
| Rating Everyone | 8,32 (0,31) | 15,05 (0,89) |
| Filtros combinados + data | 8,36 (0,41) | 21,77 (3,01) |
| Popularidade | 0,85 (0,02) | 2,58 (0,01) |
| Data crescente | 7,06 (0,11) | 19,50 (0,44) |
| Data decrescente | 7,86 (0,11) | 23,40 (0,51) |
| Título | 12,15 (0,30) | 29,52 (2,19) |

Foi encontrada uma regressão mensurável ao ordenar por título: a implementação anterior criava a configuração de colação a cada comparação, levando aproximadamente **446 ms** em 5k (80 ms em 979). A única alteração de produção no frontend reutiliza um `Intl.Collator` com o mesmo locale `pt-BR` e sensibilidade `base`: aproximadamente **29,52 ms** em 5k. A ordem completa dos 5.000 IDs foi comparada à implementação anterior e permaneceu idêntica. Não houve mudança de UX, filtros ou critérios de ordenação.

A primeira carga padrão de 5k demorou 2,46 ms nesse transporte local, com **25 itens, manifesto e um shard**, sem índice. Os próximos lotes acumularam **50 e 75 itens**, com dois e três shards. O teste de fim percorreu os 200 lotes, sem duplicações nem requests após `hasMore=false`. Consultas globais carregam o índice e somente os shards necessários aos itens retornados; as repetições não fazem novas leituras. A ordenação por título precisou de 23 shards para materializar os primeiros 25 resultados dispersos: isso é comportamento medido, não download dos 200 shards.

Esses tempos incluem leitura/parse local e não medem rede, renderização, imagens ou dispositivo móvel. O primeiro teste de 979 também inclui aquecimento de runtime, portanto não se conclui que a expansão acelerou a primeira carga. As medições de heap do processo incluem fixtures e referências dos dois catálogos; não são um perfil isolado de memória do navegador. Não há navegador instalado para confirmar fluidez visual, consumo de memória móvel ou longas sessões com milhares de cards renderizados.

## Integridade final

- 5.000 IDs únicos, nenhum simulado, 200 páginas de 25 e nenhuma página extra.
- Consolidado, manifesto, índice, `itemToPage` e todos os shards conferidos com `createCatalogShards` em memória, usando os mesmos parâmetros e timestamp.
- Inventário e bytes públicos idênticos ao staging aprovado; JSONs parseáveis e metadados antigos preservados integralmente.
- URLs mínimas de preview HTTPS e links Workshop correspondentes aos IDs verificados. Isso não prova disponibilidade futura dos recursos externos.
- Provider `catalog` continua default; infinite scroll, i18n, branding, recomendações e rotas não foram alterados.
- `.env`, backups e main local preservados; nenhum segredo no material publicado. Nenhuma escrita Firebase ou mudança remota de configuração.

## Próxima atualização incremental

Não foi criado cron, workflow agendado ou scheduler Cloudflare. O coletor já aceita meta total, orçamento de candidatos e staging separado, mas a publicação permanece uma etapa validada e manual.

Uma execução futura pode examinar **150 candidatos**, aproximadamente **105 populares e 45 recentes**, deduplicar contra o catálogo existente, moderar e adicionar somente novos aprovados. Isso não promete 150 inclusões. Usar um novo staging, backup completo, target atual + até 150, max-candidates 150, rebuild/validação antes de publicar. Começar sempre do topo pode encontrar muitos populares já presentes; medir rendimento antes de decidir persistência de cursores entre dias. O checkpoint atual atende retomada da mesma expansão, não implementa essa política diária sozinho.

Futuramente será útil revalidar periodicamente itens antigos: remoção na Workshop, mudanças de texto/rating e previews indisponíveis. Não houve varredura remota completa nem enriquecimento de autores nesta etapa.

## Parecer e pendências

**JSON-FIRST COM RESSALVAS PARA 5K.** A expansão passou nas verificações locais de dados, moderação, filtros e carregamento incremental. Build e bundle permaneceram próximos do tamanho anterior. Não há necessidade demonstrada de backend ou troca de arquitetura para este snapshot.

A ressalva concreta é o payload global do índice, especialmente sob busca/filtros/ordenação em rede móvel; também falta perfil de renderização/memória em navegador real. Validar esses pontos no frontend hospedado antes de crescer novamente. Moderação por metadados não garante ausência visual de conteúdo adulto e depende da qualidade dos dados Steam e da blacklist editorial.

O trabalho está concluído localmente em dev, sem push nem deploy nesta entrega. A autenticação HTTPS de escrita não estava disponível no ambiente; o proprietário pode publicar dev posteriormente. Nenhuma tentativa em main foi realizada.
