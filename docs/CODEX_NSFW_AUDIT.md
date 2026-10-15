# Auditoria independente — moderação NSFW simplificada

Data: **15/10/2026**, America/Sao_Paulo. Base auditada: **`acb893b`**, branch `main`. Veredito: **REPROVADO**, pelos requisitos desta missão, apesar de o catálogo atual estar estruturalmente consistente.

## 1. Resumo executivo

A simplificação foi efetivamente implementada: o pipeline Node usa blacklist manual, classificação etária e texto, sem baixar imagens ou executar análise visual. `Mature` e `Questionable` são bloqueados quando chegam corretamente ao moderador. Reconstrução offline bem-sucedida remove um ID já publicado, atualiza todos os artefatos e elimina shards obsoletos.

Entretanto, faltam requisitos explícitos: **nenhuma das quatro grafias Rule 34 é reconhecida**, termos adultos comuns passam, e a normalização da Steam transforma rating ausente/desconhecido em `Everyone`. A sincronização filtra só o lote recebido e mantém itens antigos bloqueados no merge. A gravação é atômica por arquivo, **não pelo conjunto**: uma falha pode deixar catálogo, manifesto, índice e páginas divergentes, inclusive mantendo um item bloqueado em shard público.

Esses defeitos foram reproduzidos com código de produção, fixtures e transporte substituído, sem chamadas Steam reais. Não houve correção automática do código, alteração do catálogo real, `.env`, blacklist ou backups. Foram acrescentados somente este relatório e testes de caracterização/regressão das lacunas concretas.

**Não encontramos falha crítica demonstrada. Há cinco achados altos**, detalhados abaixo. As mudanças propostas são locais e pequenas; não exigem IA, análise de imagens ou troca de arquitetura.

## 2. Estado inicial e arquitetura encontrada

Antes de modificar arquivos, inspecionamos working tree, histórico e `NSFW_MODERATION_REPORT.md`. Havia duas alterações preexistentes: uma linha em branco adicional em `config/blocked-wallpapers.json` e em `src/services/moderation/blacklist.ts`. Ambas foram preservadas.

Histórico relevante:

- `acb893b`: simplificação da moderação e introdução da blacklist.
- `54b073f`: pipeline anterior, sanitização do catálogo e análise visual.
- `a47a4fa`: registro de sincronização real anterior, fora desta auditoria; não repetida nem considerada autorização atual.
- `375b1f6`: gerador e provider JSON-First shardado.

Fluxos efetivos:

1. **Steam → JSON:** `normalizeSteamWorkshopItem` extrai `publishedfileid`, `title`, `file_description` e `tags[].tag`; `normalizeRating` deriva rating das tags. O `main` aplica `ModerationPipeline` **só aos recém-coletados**, lê o catálogo anterior, mescla, publica o consolidado e depois os shards.
2. **Reconstrução:** `rebuildCatalog` lê o consolidado, copia backup, carrega a blacklist, avalia todos os itens, escreve quarentena, substitui o consolidado e só então valida/gera/publica os shards.
3. **Avaliação:** `ModerationPipeline.evaluateItem` compara o ID na blacklist e chama `moderateMetadata`. Este bloqueia ratings adultos/ausentes/desconhecidos, verifica tags, título e descrição. O estado é binário: `safe` ou `blocked`.
4. **Frontend:** consome os JSONs gerados; não é uma segunda barreira obrigatória de moderação. A exclusão deve ser garantida antes da publicação.
5. **Firestore legado:** script separado continua disponível, mas não chama o pipeline de moderação. Não é o destino JSON-First atual; ver N-08.

Evidências: [scripts/sync-workshop.ts:193](../scripts/sync-workshop.ts#L193), [scripts/sync-workshop.ts:560](../scripts/sync-workshop.ts#L560), [scripts/rebuild-catalog.ts:22](../scripts/rebuild-catalog.ts#L22), [src/services/moderation/moderationPipeline.ts:33](../src/services/moderation/moderationPipeline.ts#L33).

### Campos efetivos da Steam

O modelo interno `rating` **não é lido de um campo raw `rating`**: é derivado das tags `Mature`, `Questionable` e `Everyone`. O texto da descrição vem de `file_description`, e não de `description` no payload Steam. O pedido inclui `return_tags=true`; `return_short_description` não é habilitado. Os campos usados são compatíveis com o contrato consultado; não demonstramos confusão entre a descrição normalizada e a descrição raw.

A [documentação oficial QueryFiles](https://partner.steamgames.com/doc/webapi/IPublishedFileService?l=english) confirma retorno de tags e a distinção entre `short_description` e `file_description`. Ela não fornece, nessa página, garantia suficiente de que toda resposta incluirá uma tag etária reconhecida. **Ausência não pode ser tratada como classificação explícita Everyone.** A correspondência e a falha de normalização foram testadas com fixtures; nenhum payload novo foi obtido da Steam.

## 3. Achados comprovados

### N-01 — ALTO — Rule 34 não está implementado

Evidência: [src/services/moderation/metadataModerator.ts:17](../src/services/moderation/metadataModerator.ts#L17), [tests/nsfwAudit.test.mjs:37](../tests/nsfwAudit.test.mjs#L37).

O regex não contém `rule34`, `rule 34`, `rule-34` ou `r34`. Todas essas grafias passam como `safe` em **título, descrição e tags**, incluindo `RULE34` e `ｒｕｌｅ３４`. Isto não é apenas evasão sofisticada: falta o requisito nominal da missão.

Proposta para aprovação: acrescentar o padrão Rule 34 com separadores simples e testes nos três campos. Para `r34`, considerar contexto: `Nissan Skyline R34` é referência legítima e não deve ser bloqueada indiscriminadamente. A regra pode distinguir o marcador isolado/tag adulto da referência automotiva conhecida, sem bloquear personagens ou franquias.

### N-02 — ALTO — Cobertura de termos explícitos incompleta e `18+` ineficaz isoladamente

Evidência: [src/services/moderation/metadataModerator.ts:17](../src/services/moderation/metadataModerator.ts#L17), [src/services/moderation/metadataModerator.ts:177](../src/services/moderation/metadataModerator.ts#L177), [tests/nsfwAudit.test.mjs:43](../tests/nsfwAudit.test.mjs#L43).

`nude`, `naked`, `pornography`, `nudez` e `sexo explícito` passam. `18+` sozinho também passa: o `\b` após `+` não encontra fronteira entre o sinal e fim/espaço. O teste anterior `D.Va 18+ NSFW Wallpaper` passava por causa de **NSFW**, ocultando esse defeito. `xxx` é bloqueado em título/descrição, mas passa como tag. `r 18`, `r_18`, `r—18` e `art_nsfw` também passam; `_` conta como caractere de palavra para `\b`.

Proposta: corrigir a fronteira de `18+`, aplicar os mesmos marcadores aos três campos e acordar uma lista curta de termos explicitamente adultos, em especial português/inglês. Não é necessário tentar cobrir todos os idiomas ou todos os eufemismos.

### N-03 — ALTO — Rating ausente/desconhecido recebe aprovação antes do moderador

Evidência: [scripts/sync-workshop.ts:171](../scripts/sync-workshop.ts#L171), [scripts/sync-workshop.ts:197](../scripts/sync-workshop.ts#L197), [src/services/moderation/metadataModerator.ts:97](../src/services/moderation/metadataModerator.ts#L97), [tests/nsfwAudit.test.mjs:57](../tests/nsfwAudit.test.mjs#L57).

`moderateMetadata({ rating: undefined, ... })` bloqueia corretamente. Porém, no caminho de produção, `normalizeRating([])` e `normalizeRating(['Unrated'])` retornam `Everyone`; os mesmos itens chegam ao pipeline como seguros. A tag `' Mature '` também perde o bloqueio: a função não faz trim antes de reconhecer rating, e `extractThematicTags` remove essa tag depois de trim. Este último caso é tolerância de entrada reproduzida, **não afirmação de que a Steam envie tags com esse espaço**.

Proposta: preservar ausência/desconhecido até a avaliação, ou validar a tag etária raw antes de converter para o tipo interno; normalizar espaços de forma consistente. Não basta testar o moderador com `rating` já preenchido manualmente.

### N-04 — ALTO — Sincronização não retira IDs antigos bloqueados

Evidência: [scripts/sync-workshop.ts:567](../scripts/sync-workshop.ts#L567), [scripts/sync-workshop.ts:596](../scripts/sync-workshop.ts#L596), [scripts/sync-workshop.ts:617](../scripts/sync-workshop.ts#L617)}, [tests/nsfwAudit.test.mjs:122](../tests/nsfwAudit.test.mjs#L122).

Reprodução: catálogo anterior com ID `100`; blacklist `['100','300']`; transporte fake retorna novos IDs `200` e `300`. O `main` de produção descarta `300`, mas publica **`100` e `200`** no consolidado e manifesto. O ID antigo bloqueado permanece. O mesmo desenho retém uma versão antiga de item cujo novo payload foi recusado por rating/texto.

A reconstrução offline completa resolve a remoção no caminho de sucesso. Isso não torna a sincronização segura por si só: ela não reaplica a política ao resultado final do merge.

Proposta: avaliar o conjunto a publicar, inclusive itens antigos, antes de gerar os JSONs. Uma única filtragem final evita duplicar regras ou reconstruir a arquitetura.

### N-05 — ALTO — Publicação de múltiplos JSONs não é transacional

Evidência: [scripts/rebuild-catalog.ts:123](../scripts/rebuild-catalog.ts#L123), [scripts/rebuild-catalog.ts:128](../scripts/rebuild-catalog.ts#L128), [scripts/rebuild-catalog.ts:140](../scripts/rebuild-catalog.ts#L140), [src/utils/catalogSharder.ts:269](../src/utils/catalogSharder.ts#L269), [src/utils/catalogSharder.ts:272](../src/utils/catalogSharder.ts#L272), [tests/nsfwAudit.test.mjs:104](../tests/nsfwAudit.test.mjs#L104), [tests/nsfwAudit.test.mjs:151](../tests/nsfwAudit.test.mjs#L151).

Duas reproduções offline:

- Com o lock dos shards ocupado, o rebuild já substituiu o consolidado por um catálogo sem o ID bloqueado, mas falha ao atualizar os shards. Manifesto e página antigos continuam contendo o ID bloqueado.
- Com conflito de destino numa página, o escritor já substituiu manifesto e índice antes de falhar no rename da página. A página 2 antiga continua acessível; o conjunto não corresponde ao novo manifesto.

Além disso, os locks do consolidado e dos shards são distintos; a leitura/backup ocorre antes do lock do consolidado. Não foi reproduzida perda por concorrência entre processos, mas o escopo atual do lock não a exclui. A limpeza de shards obsoletos engole erros de unlink; uma falha real de remoção pode deixar conteúdo antigo sem sinalizar falha. Este último é risco por inspeção, não falha de permissão reproduzida.

Proposta para aprovação: validar e preparar todas as saídas antes de alterar destinos, manter um lock durante toda a publicação e restaurar a geração anterior em falha tratável. Para um catálogo pessoal, backup + rollback local é suficiente como melhoria incremental. Interrupção abrupta ainda deve ser documentada; não é preciso introduzir banco, serviço ou infraestrutura adicional.

### N-06 — MÉDIO — Validação da blacklist incompleta; arquivo ausente é ignorado

Evidência: [src/services/moderation/blacklist.ts:47](../src/services/moderation/blacklist.ts#L47), [src/services/moderation/blacklist.ts:70](../src/services/moderation/blacklist.ts#L70), [src/services/moderation/moderationPipeline.ts:34](../src/services/moderation/moderationPipeline.ts#L34), [tests/nsfwAudit.test.mjs:78](../tests/nsfwAudit.test.mjs#L78).

JSON malformado, raiz errada, duplicatas, entradas numéricas e strings vazias **geram erro explícito**. Isso atende parte importante do requisito. Contudo, strings como `'abc'`, `'-1'`, `'1e6'`, `'0'` e valor acima de uint64 são aceitas sem validar formato de PublishedFileID. O moderador também aceita um ID não numérico como `safe`; a validação estrutural só aparece depois, no sharder.

Se o arquivo estiver ausente — inclusive por path digitado incorretamente ou cwd errado — `loadManualBlacklist` retorna Set vazio sem aviso. Isso é comportamento explícito no código/teste anterior, mas remove silenciosamente o controle editorial esperado. **Arquivo ausente é diferente de JSON inválido**: o JSON inválido não é ignorado.

Proposta: exigir arquivo no fluxo de produção/rebuild e validar string decimal positiva; manter IDs como strings, sem conversão para Number. Checagem de limite uint64 com BigInt é opcional e simples. O trim e a rejeição de duplicatas após trim já estão corretos.

### N-07 — MÉDIO — Reconstrução valida dados/simulados depois de publicar o consolidado

Evidência: [scripts/rebuild-catalog.ts:77](../scripts/rebuild-catalog.ts#L77), [scripts/rebuild-catalog.ts:128](../scripts/rebuild-catalog.ts#L128), [src/utils/catalogSharder.ts:121](../src/utils/catalogSharder.ts#L121), [tests/nsfwAudit.test.mjs:115](../tests/nsfwAudit.test.mjs#L115).

Um fixture limpo com `isSimulated:true` é aprovado pela moderação e permanece no consolidado; só depois `createCatalogShards` lança erro. Não foi demonstrada **introdução de simulados a partir de uma entrada real limpa**, e o catálogo real auditado tem zero simulados. O problema comprovado é a ausência de rejeição antes de alterar a saída pública, deixando estado parcialmente atualizado em entrada inválida. Outros campos estruturais incompletos têm o mesmo risco pelo ordenamento das operações.

Proposta: validar estrutura e rejeitar simulados antes da escrita, preservando o consolidado anterior quando houver erro.

### N-08 — MÉDIO, escopo secundário — Caminho Firestore continua sem moderação

Evidência: [scripts/sync-firestore.ts:171](../scripts/sync-firestore.ts#L171), [scripts/sync-firestore.ts:177](../scripts/sync-firestore.ts#L177), [scripts/sync-firestore.ts:120](../scripts/sync-firestore.ts#L120).

O script disponível `sync:firestore` faz fetch e persiste sem chamar `ModerationPipeline`. A validação `isWallpaperItem` aceita `Mature` e `Questionable`. Assim, as proteções não são obrigatórias nesse destino legado. Isto é comprovado por inspeção; **nenhuma gravação Firebase foi executada**, e não atribuímos esse desvio ao catálogo JSON atual.

Proposta: se o caminho ainda for suportado para publicação, reutilizar o pipeline; se não for utilizado, identificá-lo claramente como fora da política atual e impedir que seja confundido com o sincronizador moderado. Não é necessário reestruturar Firestore.

### N-09 — BAIXO — Exceção XXX, ambiguidades e relato de “lista branca”

Evidência: [src/services/moderation/metadataModerator.ts:64](../src/services/moderation/metadataModerator.ts#L64), [src/services/moderation/metadataModerator.ts:30](../src/services/moderation/metadataModerator.ts#L30), [tests/nsfwAudit.test.mjs:51](../tests/nsfwAudit.test.mjs#L51).

Uma ocorrência estrutural `-XXX-` em qualquer ponto desativa a checagem XXX de todo o campo: `XXX wallpaper. Exemplo -XXX- de nome de arquivo.` passa. A proteção de placeholder deveria ignorar somente a ocorrência contextual. Por outro lado, `No NSFW content` é bloqueado pela palavra NSFW, e `成人の日 landscape` é bloqueado pelo trecho `成人`, que também ocorre numa referência cultural não adulta. São falsos positivos textuais reproduzidos; não demonstram conteúdo adulto real nessas entradas.

`ALLOWED_AMBIGUOUS_TERMS` é uma constante usada pelos testes; o moderador não a consulta como whitelist. A proteção efetiva de anime/waifu/girl vem da ausência desses termos nas expressões restritas. Os testes confirmam esses termos e franquias legítimas permitidos; não propomos bloquear categorias inteiras.

Proposta: restringir a exceção XXX à ocorrência e ajustar o relatório para não prometer uma whitelist ativa. Não criar regras gerais de negação complexas; preferir listas pequenas e revisão manual de casos ambíguos.

## 4. Matriz textual e Rule 34

Entradas com rating `Everyone`, sem blacklist; resultados exercitam o moderador real. Os resultados abaixo descrevem comportamento observado, **não endosso da regra**.

| Grupo | Entrada/variação | Resultado atual | Avaliação |
|---|---|---|---|
| Adultos já cobertos | `hentai`, `PoRn`, `NSFW` em título, descrição e tags | blocked | Correto. |
| Unicode latino | `héntai`, `ｈｅｎｔａｉ` | blocked nos três campos | NFKD funciona nesses exemplos. |
| Rule 34 | `rule34`, `rule 34`, `rule-34`, `r34` | safe nos três campos | Requisito não atendido. |
| Rule 34 Unicode/case | `RULE34`, `ｒｕｌｅ３４` | safe nos três campos | Normalizar não resolve padrão ausente. |
| Adultos ausentes | `nude`, `naked`, `pornography`, `nudez`, `sexo explícito` | safe no título | Cobertura básica insuficiente. |
| Marcador etário | `18+` isolado | safe | Bug de fronteira do regex. |
| Separadores | `r 18`, `r_18`, `r—18`, `art_nsfw` | safe | Regras não uniformizam separadores. |
| Invisíveis | `hen\u200btai` (zero-width entre n e t) | safe | Limitação de evasão Unicode. |
| Japonês | `エロ` / `ｴﾛ` | blocked / safe | Matcher asiático usa texto raw, sem NFKD. |
| Outros idiomas | `無修正`, `야동` | safe | Lista curta não cobre esses exemplos; não implica promessa de cobertura universal. |
| XXX por campo | `xxx` no título / tag | blocked / safe | Assimetria entre campos. |
| Negação | `No NSFW content` | blocked | Falso positivo textual. |
| Ambiguidade CJK | `成人の日 landscape` | blocked | Substring cultural não necessariamente adulta. |
| Categorias | `Anime girl`, waifu, cosplay e termos da lista anterior | safe | Não bloquear categoria/gênero é adequado. |
| Personagens/franquias | D.Va/Overwatch, Raiden/Genshin, Kafka/Honkai, 2B/NieR, Tifa/Final Fantasy, Cyberpunk 2077 | safe | Não há bloqueio indiscriminado desses nomes. |
| Ambiguidade R34 | `Nissan Skyline R34` | safe | Preservar ao corrigir marcadores Rule 34. |

Não analisamos imagens, vídeos ou arquivos `.pkg`; portanto estes exemplos são exclusivamente testes de metadados.

## 5. Blacklist manual: verificação completa

Arquivo: `config/blocked-wallpapers.json`, raiz objeto e array `blockedIds`. No estado auditado, **array vazio**.

- Comparação preserva strings longas e zeros à esquerda; um ID string uint64 máximo foi bloqueado sem perda de precisão. Não há conversão a Number no carregador. O pipeline faz String/trim do ID de entrada, portanto não impõe tipo string estrito para a origem.
- Duplicatas, inclusive `100` e ` 100 `, são rejeitadas; não são descartadas silenciosamente.
- JSON inválido lança erro. Rebuild com JSON inválido preservou consolidado e manifesto anteriores; um backup é criado antes da falha.
- Entrada de formato não decimal é aceita: lacuna N-06.
- Caminho ausente vira lista vazia: lacuna N-06.
- Na sincronização JSON, novos IDs bloqueados são rejeitados; antigos continuam no merge: N-04.
- Na reconstrução de sucesso, bloquear um ID já publicado retira-o do consolidado, `itemToPage`, índice e páginas. Um fixture com 25 itens/2 páginas e 24 IDs bloqueados ficou com um item/uma página, sem shard antigo.
- Remover ID da blacklist **não restaura automaticamente** o item já excluído: seria necessário reimportá-lo de backup/catálogo original ou obtê-lo numa futura sincronização autorizada. O rebuild lê apenas o consolidado atual.

Como a blacklist real está vazia, a ausência de IDs bloqueados nos arquivos reais é uma verificação sem casos positivos. A evidência efetiva de remoção vem dos testes de fixtures, não da lista vazia.

## 6. Integridade dos JSONs atuais

Inspeção somente leitura, com recriação da estrutura **em memória**, usando `createCatalogShards` de produção e o mesmo generatedAt do manifesto. Nenhum rebuild foi executado contra o catálogo real.

| Verificação | Resultado |
|---|---|
| `public/data/catalog.json` | 178 itens; 178 IDs únicos. |
| `public/data/catalog/manifest.json` | totalItems 178; totalPages 8; pageSize 24. |
| `public/data/catalog/index.json` | 178 entradas, iguais ao índice recalculado. |
| `public/data/catalog/pages/*.json` | Contagens 24, 24, 24, 24, 24, 24, 24, 10. |
| Payload consolidado × páginas | Conteúdo de cada ID idêntico. |
| Manifesto, mapeamento de IDs e metadados | Iguais à geração recalculada. |
| Shards obsoletos atuais | Nenhum arquivo extra nas páginas. |
| Simulados na fonte real | Zero. Arquivos mock/legacy simulados separados continuam existindo por design. |
| Rating | 178 Everyone; zero Mature/Questionable. Isso não prova a procedência explícita do rating de cada payload raw. |
| Decisões do pipeline atual | 178 safe, zero blocked. Isso reflete as regras incompletas, não prova ausência visual de NSFW. |
| Backups existentes | Dois arquivos, com 200 e 178 itens; preservados. |

Em conclusão: **snapshot atual consistente, comportamento em falha reprovado**. Não identificamos corrupção já presente no catálogo real.

## 7. Remoção da análise visual

Buscamos referências em `src/`, `scripts/`, `tests/`, workflows, `package.json` e lockfile. Não há import ativo de `visualModerator`, YCbCr, cálculo de pele, download de thumbnail para classificação ou dependência de modelo/decodificação visual. O commit `acb893b` excluiu `visualModerator.ts`. A geração/publicação de metadados não precisa buscar imagens. Fetch de imagens pelo navegador para exibir wallpapers é outra finalidade e permanece esperado.

Restou **`.moderation/visual_cache.json` local, 2 bytes**, ignorado pelo Git e não consumido pelo pipeline. Portanto a afirmação do relatório de que esse arquivo foi eliminado não descreve integralmente o disco local, mas não há dependência operacional obsoleta. Não removemos esse artefato nem backups. Referências históricas à análise visual no relatório não são imports/comandos ativos.

## 8. Testes executados e qualidade da evidência

| Comando | Resultado |
|---|---|
| `npm test` antes de acrescentar regressões | 132 aprovados, 36 suites, zero falhas. Confere a contagem do relatório anterior. |
| `npm test` final | **145 aprovados, 36 suites, zero falhas**, incluindo 13 casos novos de auditoria. |
| `npm run typecheck` | Aprovado. Frontend, Vite e scripts. |
| `npm run build` | Aprovado; aviso de chunk Firestore de 570,23 kB permanece, sem relação causal com moderação. |

Os 13 testes adicionais em [tests/nsfwAudit.test.mjs:1](../tests/nsfwAudit.test.mjs#L1) chamam o código de produção: `moderateMetadata`, `normalizeSteamWorkshopItem`, `ModerationPipeline`, `loadManualBlacklist`, `rebuildCatalog`, `createCatalogShards`, `writeCatalogShardsSync` e `main` de sync. Não reimplementam os filtros num fake. O teste do sincronizador substitui somente o transporte fetch, usa chave **fictícia**, cwd temporário sem `.env`, e restaura estado global em finally. Escritas são limitadas a diretórios temporários.

**Os casos denominados LACUNA são testes de caracterização:** assertam o comportamento defeituoso observado para que a reprodução seja verificável. O verde desses testes não significa aprovação dos requisitos. Ao corrigir, suas expectativas devem ser convertidas para a política desejada. Nenhum teste existente foi desabilitado, marcado skip/todo ou relaxado.

A suíte anterior exercitava o moderador e rebuild reais, mas só no caminho de sucesso e com ratings já preenchidos. Não cobria Rule 34, o trajeto normalizador→moderador sem rating, blacklist de itens antigos na sync, `18+` isolado ou publicação com falhas. O teste chamado “atomicamente” em `shardedCatalog.test.mjs` verificava somente o resultado de uma gravação bem-sucedida; não demonstrava atomicidade em erro.

## 9. Riscos e limitações proporcionais ao escopo

Limitações aceitáveis para uma galeria pessoal, se reconhecidas pelo proprietário: metadados falsos ou omitidos pela origem; conteúdo adulto visível apenas em imagens/vídeos; eufemismos, leetspeak, caracteres invisíveis e cobertura parcial de idiomas; necessidade de blacklist editorial. Não estamos afirmando aceite formal do proprietário de todos esses riscos, apenas distinguindo-os dos requisitos verificáveis que falharam.

Não propomos classificação visual, modelos de IA, bloqueio de anime/personagens femininas ou categorias inteiras. Correções sugeridas: poucos padrões textuais bem testados, rating sem fallback permissivo, aplicação ao conjunto final, blacklist explícita e validação antes de publicar com recuperação em falha.

Não houve teste visual, nova consulta Steam, conexão/gravação Firebase, push, deploy, edição de `.env` ou alteração de backups. Os dados públicos e dois arquivos preexistentes foram comparados por hashes para confirmar preservação; os próprios valores secretos não foram exibidos. O build atualiza apenas artefatos ignorados em `dist/`. Nenhum commit foi criado nesta auditoria.

## 10. Veredito final e sequência proposta para aprovação

**REPROVADO.** A arquitetura é simples e compatível com o objetivo, e os JSONs atuais estão coerentes; entretanto faltam barreiras obrigatórias e a publicação em erro não preserva consistência.

Antes de nova sincronização/publicação, aprovar e implementar, nesta ordem:

1. Rule 34 e marcadores adultos básicos, incluindo `18+` sem outra palavra que mascare a regra.
2. Bloqueio de rating ausente/desconhecido no trajeto raw→normalização→moderação.
3. Moderação do conjunto final após merge, para aplicar blacklist a itens antigos.
4. Validação completa antes de escrita e recuperação consistente quando shards falharem.
5. Ajustes pequenos da blacklist; decidir se Firestore legado precisa receber a mesma política.

Essas propostas estão documentadas para revisão. **Nenhuma correção estrutural foi aplicada automaticamente.**
