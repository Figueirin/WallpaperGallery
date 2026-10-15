# Segunda auditoria independente — WallpaperGallery

Data: **15/10/2026**, America/Sao_Paulo. Commit auditado: **`c6d6f73`**, branch `main`. Working tree inicial limpo. Referências: [auditoria anterior](CODEX_NSFW_AUDIT.md), [relatório de correções do Gemini](../NSFW_AUDIT_FIX_REPORT.md) e [13 testes revisados](../tests/nsfwAudit.test.mjs).

## Resumo e veredito

**REPROVADO. Não recomendo liberar a próxima sincronização real antes de corrigir os defeitos de recuperação descritos abaixo.** O desenvolvimento e as validações offline podem continuar.

As correções principais de moderação funcionam: Rule 34, `18+`, termos explícitos, blacklist após merge e preservação de `Unrated`. Não consideramos ausência de rating motivo de bloqueio. Também há melhoria real no rollback: várias falhas transitórias agora restauram hashes e permitem leitura pelo provider.

Porém, **quatro cenários de integridade falham**, incluindo rollback que desfaz uma reconstrução concorrente concluída e tratamento incorreto de catálogo vazio. A exceção de placeholder chinês ainda esconde uma ocorrência independente de XXX. Os problemas foram reproduzidos com código de produção, diretórios temporários e injeções controladas em operações locais de filesystem, sem tocar no catálogo real.

Resultado: **seis achados corrigidos e três parcialmente corrigidos**. A conclusão não exige atomicidade absoluta entre arquivos, banco novo, infraestrutura extra ou resistência a disco permanentemente indisponível. Baseia-se em erros tratáveis e numa intercalação concreta entre os fluxos existentes.

## 1. Resultado N-01 a N-09

| Achado | Status | Implementação e evidência | Resultado independente |
|---|---|---|---|
| N-01 — Rule 34 | **CORRIGIDO** | [src/services/moderation/metadataModerator.ts:21](../src/services/moderation/metadataModerator.ts#L21), [src/services/moderation/metadataModerator.ts:34](../src/services/moderation/metadataModerator.ts#L34), [tests/nsfwReaudit.test.mjs:102](../tests/nsfwReaudit.test.mjs#L102) | `rule34`, `rule 34`, `rule-34`, `r34` e full-width bloqueados. Skyline R34 permitido; Skyline com `rule34` bloqueado. Testes anteriores também exercitam case e os três campos. |
| N-02 — termos, separadores e 18+ | **CORRIGIDO** | [src/services/moderation/metadataModerator.ts:29](../src/services/moderation/metadataModerator.ts#L29), [src/services/moderation/metadataModerator.ts:99](../src/services/moderation/metadataModerator.ts#L99), [tests/nsfwReaudit.test.mjs:102](../tests/nsfwReaudit.test.mjs#L102) | `18+` isolado, nude/naked/nudez/pornography/sexo explícito e XXX bloqueados; campo textual unificado. Os novos testes verificam título, descrição e tags separadamente. |
| N-03 — rating | **CORRIGIDO**, conforme política definitiva | [scripts/sync-workshop.ts:171](../scripts/sync-workshop.ts#L171), [src/types/wallpaper.ts:8](../src/types/wallpaper.ts#L8), [tests/nsfwReaudit.test.mjs:88](../tests/nsfwReaudit.test.mjs#L88) | Ausência é normalizada como Unrated, sem convertê-la para Everyone ou tratá-la como adulta. Mature > Questionable > Everyone, independentemente da ordem. Blacklist/texto continuam bloqueando Everyone, Unrated e ausente. |
| N-04 — itens antigos após merge | **CORRIGIDO** | [scripts/sync-workshop.ts:605](../scripts/sync-workshop.ts#L605), [tests/nsfwAudit.test.mjs:128](../tests/nsfwAudit.test.mjs#L128) | O cenário original agora publica apenas ID 200, retirando IDs 100 e 300 da blacklist. O conjunto final é avaliado antes da geração. A concorrência pode desfazer o resultado por outro defeito, R-01, sem invalidar a correção do filtro pós-merge em execução isolada. |
| N-05 — recuperação JSON/locks | **PARCIALMENTE CORRIGIDO** | [src/utils/catalogSharder.ts:237](../src/utils/catalogSharder.ts#L237), [scripts/rebuild-catalog.ts:152](../scripts/rebuild-catalog.ts#L152), [scripts/sync-workshop.ts:653](../scripts/sync-workshop.ts#L653) | Staging e rollback existem e passam em vários pontos de falha. Permanecem quatro defeitos comprovados: R-01 a R-04. |
| N-06 — blacklist | **CORRIGIDO** no requisito operacional | [src/services/moderation/blacklist.ts:52](../src/services/moderation/blacklist.ts#L52), [src/services/moderation/blacklist.ts:80](../src/services/moderation/blacklist.ts#L80), [tests/nsfwAudit.test.mjs:81](../tests/nsfwAudit.test.mjs#L81) | Formato decimal positivo string, trim, duplicatas, tipo incorreto e JSON inválido tratados. Arquivo obrigatório por padrão; required:false é opção explícita. Limite uint64 não é validado, mas era melhoria opcional, não bloqueador: não há conversão para Number/perda de precisão. |
| N-07 — pré-validação/simulados | **CORRIGIDO** no fluxo de publicação oficial | [scripts/rebuild-catalog.ts:123](../scripts/rebuild-catalog.ts#L123), [scripts/sync-workshop.ts:626](../scripts/sync-workshop.ts#L626), [tests/nsfwAudit.test.mjs:120](../tests/nsfwAudit.test.mjs#L120) | Rebuild rejeita simulado antes de substituir o consolidado; shape e duplicatas são verificados antes da publicação. A migração de catálogo inteiramente simulado ainda arquiva exemplos em arquivo legado separado, sem misturá-los ao catálogo real; não é garantia de inexistência de qualquer JSON de demonstração em public/. |
| N-08 — Firestore legado | **PARCIALMENTE CORRIGIDO** | [scripts/sync-firestore.ts:4](../scripts/sync-firestore.ts#L4), [package.json:12](../package.json#L12) | Existe aviso no comentário do arquivo; o comando real continua executável sem moderação, sem banner operacional novo ou bloqueio. Não atribuídos riscos desse destino ao JSON-First atual. |
| N-09 — XXX e CJK | **PARCIALMENTE CORRIGIDO** | [src/services/moderation/metadataModerator.ts:72](../src/services/moderation/metadataModerator.ts#L72), [tests/nsfwReaudit.test.mjs:202](../tests/nsfwReaudit.test.mjs#L202) | A ocorrência `-XXX-` não libera mais o campo inteiro, e `成人の日` é permitido. Porém, `例如：夜莺——XXX。 XXX wallpaper` ainda passa: R-05. A constante de termos ambíguos continua sem ser uma whitelist executada; nomes comuns permanecem permitidos pela regra efetiva. |

## 2. Política de rating aplicada nesta avaliação

A política atual substitui o critério da auditoria anterior de bloquear ausência/desconhecimento. Portanto, mudar testes de rating ausente de `blocked` para `safe` **é uma adequação autorizada, não um enfraquecimento indevido**.

Verificado com código de produção:

- `Mature` e `Questionable`, inclusive com trim/case: bloqueados.
- `Everyone`, `Unrated` e rating ausente: permitidos quando texto e blacklist deixam passar.
- Texto explícito e blacklist: bloqueiam independentemente desses ratings permissivos.
- Tags conflitantes: o normalizador prioriza o rating restritivo; a ordem das tags não muda o resultado.
- Tag ausente/Unrated: preserva distinção em relação a Everyone no modelo normalizado e schema.

Não foram criadas novas exigências de classificação obrigatória. A identificação de uma classificação não reconhecida como Unrated não é tratada aqui como indicação de conteúdo adulto.

## 3. Integridade transacional: o que funciona

O particionador escreve manifesto, índice e páginas em staging antes de promover **os shards**. Esse staging não inclui uma geração única com o consolidado: sync/rebuild já substituem `catalog.json` antes de chamar o escritor dos shards.

O arquivo de lock do consolidado agora permanece aberto durante a escrita dos shards. Ambos os scripts usam o mesmo `catalog.json.lock`, e o escritor usa `catalog.lock`. Isso serializa a parte final de escrita, mas **leitura, backup e cálculo da geração acontecem antes do lock**, e a verificação preventiva de catalog.lock é `existsSync`, não aquisição antecipada com O_EXCL. O relatório do Gemini exagera ao afirmar que os dois locks são adquiridos antecipadamente e que todos os arquivos mantêm paridade absoluta.

Os novos testes passaram nos seguintes cenários, comparando SHA-256 por caminho e bytes armazenados do estado original:

| Ponto da falha | Resultado |
|---|---|
| Escrita de index.json no staging | Geração anterior intacta. |
| Promoção de index.json | Manifesto, índice e páginas restaurados. Provider retorna 25 itens. |
| Promoção da primeira página | Geração anterior restaurada. Provider funciona. |
| Promoção da segunda página, sem expansão de número de shards | Geração anterior restaurada. Provider funciona. |
| Remoção de shard obsoleto | Erro propagado, rollback restaura geração anterior. |
| Rebuild, promoção da primeira página | Consolidado e shards restaurados byte a byte; backup original preservado; provider funciona. |
| Lock dos shards já ocupado antes da escrita | O teste revisado anterior confirma aborto sem alterar o consolidado. |
| Rebuild normal, redução de 25 para um item | O teste anterior confirma remoção dos bloqueados e da página obsoleta e backup exato. |

Esses resultados são melhorias concretas sobre a versão anterior. Não exigimos snapshot atômico para visitantes durante os milissegundos de publicação nem recuperação garantida após SIGKILL/falta permanente de disco. A avaliação é da capacidade de recuperar **falhas tratáveis** sem descartar uma geração válida.

## 4. Problemas restantes comprovados

### R-01 — ALTO — Guard de concorrência do sync desfaz rebuild já concluído

Código: [scripts/sync-workshop.ts:661](../scripts/sync-workshop.ts#L661), [scripts/sync-workshop.ts:670](../scripts/sync-workshop.ts#L670).

Teste: [tests/nsfwReaudit.test.mjs:184](../tests/nsfwReaudit.test.mjs#L184).

Intercalação determinística de funções reais:

1. O sync já leu catálogo original com ID 100; blacklist contém 100.
2. Antes de o sync adquirir `catalog.json.lock`, executamos `rebuildCatalog` real no fixture. Ele conclui corretamente: consolidado e shards ficam vazios, e o lock é liberado.
3. O sync adquire o lock e detecta que o arquivo mudou. Até aqui o comportamento é correto.
4. O catch, porém, **reescreve originalDiskCatalog mesmo sem ter publicado sua própria alteração**. ID 100 volta ao consolidado, enquanto o manifesto/índice continuam vazios.

O teste usa hook em `openSync` para controlar a ordem das operações, não depende de sorte ou timer. Nenhum algoritmo concorrente foi reimplementado. O rebuild tem corpo síncrono e é concluído antes de o open do sync prosseguir. O hash do consolidado depois da falha difere do snapshot válido concluído pelo rebuild.

Correção proposta: não restaurar arquivo que esta execução ainda não substituiu; manter indicador de publicação própria e/ou adquirir lock antes da leitura e do backup. O rebuild também deve reler/validar seu snapshot sob o lock para evitar gravar uma visão antiga. Não é necessário lock distribuído.

### R-02 — ALTO — Sync não restaura catálogo vazio após falha

Código: [scripts/sync-workshop.ts:670](../scripts/sync-workshop.ts#L670). Teste: [tests/nsfwReaudit.test.mjs:176](../tests/nsfwReaudit.test.mjs#L176).

Com geração anterior válida vazia e um item novo, injetamos **uma falha transitória** na promoção do índice dos shards. O rollback do escritor repõe manifesto/índice vazios, mas o catch do sync só restaura o consolidado se `originalDiskCatalog.length > 0`. Resultado: consolidado com item novo e shards vazios. Não é diferença de formatação: o conteúdo JSON diverge.

A mesma condição é inadequada para primeira geração sem arquivo anterior, por inspeção; a ausência inicial não foi o fixture desta reprodução e não é contada como outro defeito comprovado.

Correção proposta: registrar existência e bytes originais separadamente da quantidade de itens; restaurar `[]` quando esse era o estado anterior, ou remover somente o arquivo criado por esta tentativa se antes não existia.

### R-03 — MÉDIO — Rollback não remove páginas criadas pela tentativa que falhou

Código: [src/utils/catalogSharder.ts:324](../src/utils/catalogSharder.ts#L324). Teste: [tests/nsfwReaudit.test.mjs:139](../tests/nsfwReaudit.test.mjs#L139).

Geração anterior com uma página; geração nova com 50 itens/três páginas. A promoção da terceira página recebe uma falha transitória. Manifesto, índice e página 1 voltam ao estado anterior, **mas a página 2 recém-criada permanece acessível em pages/**. O conjunto de caminhos JSON depois da falha é diferente do snapshot original.

O provider do manifesto anterior pode continuar funcionando; não afirmamos indisponibilidade total nesse caso. O defeito é conteúdo órfão público e recuperação incompleta. Pode expor registros que não pertencem à geração vigente; não foi introduzido conteúdo adulto no fixture.

Correção proposta: guardar o inventário original de páginas e remover apenas as novas criadas por esta tentativa durante a restauração. Preservar a pasta de rollback se qualquer etapa de recuperação falhar.

### R-04 — MÉDIO — Backup de página pode falhar em silêncio, com perda na recuperação posterior

Código: [src/utils/catalogSharder.ts:282](../src/utils/catalogSharder.ts#L282), [src/utils/catalogSharder.ts:283](../src/utils/catalogSharder.ts#L283), [src/utils/catalogSharder.ts:316](../src/utils/catalogSharder.ts#L316).

Teste: [tests/nsfwReaudit.test.mjs:147](../tests/nsfwReaudit.test.mjs#L147).

A cópia de uma página para rollback lança erro, mas o código engole esse erro e continua promovendo arquivos. No fixture, uma falha posterior de rename ativa o rollback, que não tem a cópia daquela página: manifesto/índice antigos são restaurados, mas a página permanece da geração nova. O **StaticCatalogProvider real passa a devolver IDs da geração nova sob o total/manifesto anterior**.

Esse teste usa **dois erros locais controlados**, um no backup e outro na promoção; não confundir com falha única. Não exigimos sobreviver a todo dano múltiplo. O problema evitável é prosseguir depois de detectar que o próprio backup necessário à recuperação não foi preparado. Bastava abortar antes de promover qualquer arquivo. O filesystem volta a operar normalmente nas outras chamadas.

O catch da restauração também ignora erros e o finally apaga a pasta de rollback mesmo após recuperação incompleta, por inspeção. Essa segunda falha de restauração não foi injetada nesta rodada e não fundamenta uma reprovação adicional.

### R-05 — BAIXO — Placeholder chinês ainda remove uma ocorrência XXX independente

Código: [src/services/moderation/metadataModerator.ts:77](../src/services/moderation/metadataModerator.ts#L77). Teste: [tests/nsfwReaudit.test.mjs:202](../tests/nsfwReaudit.test.mjs#L202).

`例如：夜莺——XXX。 XXX wallpaper` é aprovado. A primeira substituição remove o placeholder junto ao travessão; a regra seguinte `例如[：:][^.\n]*xxx` consome até a última ocorrência XXX porque só exclui ponto ASCII/newline, não `。`, e é gulosa. O exemplo tem uma ocorrência estrutural e outra independente que deveria continuar sujeita à regra.

Correção proposta: delimitar o exemplo à sua ocorrência/pontuação ou retirar somente a referência de nome de arquivo. Não há motivo para bloquear todo texto chinês.

## 5. Firestore legado, falsos positivos e limitações

N-08 recebeu apenas comentário no topo do script. O diff não adiciona bloqueio, chamada ao moderador ou novo banner na execução. Portanto a alegação de isolamento operacional integral não é sustentada. Classificação: **médio, secundário**. Recomendação simples: se não é usado para produção, desabilitar o caminho real ou exigir uma opção claramente separada; se for usado, aplicar a política comum. Nenhuma gravação remota foi realizada para verificar isso.

As exceções automotiva e cultural não liberam outros termos explícitos. A regra de `r34` ainda considera qualquer termo automotivo no mesmo campo como justificativa; pode ser abrangente, mas não classificamos uma frase ambígua como prova de conteúdo adulto. Isso não fundamenta o veredito.

O falso positivo `No NSFW content` permanece comportamento lexical esperado: resolver negação geral exigiria complexidade desproporcional. A lista exportada `ALLOWED_AMBIGUOUS_TERMS` continua sendo auxiliar dos testes, não uma whitelist executada; isso é principalmente precisão documental. A política não bloqueia anime, personagens femininas ou franquias inteiras.

Metadados fraudulentos, mídia explicitamente adulta sem palavras/tags e toda evasão Unicode possível continuam fora da garantia. Não solicitamos classificador visual nem modelos de IA.

## 6. Qualidade dos 13 testes anteriores

Comparação feita com `git diff 67ee232 c6d6f73 -- tests/`:

- As antigas caracterizações que aceitavam Rule 34, nudez, `18+` e IDs antigos bloqueados foram transformadas em expectativas de bloqueio/remoção corretas. Isso é melhoria.
- Alterações para permitir rating ausente/Unrated correspondem à política definitiva e são legítimas.
- Nenhum teste existente foi desativado por skip/todo nesta revisão. Não encontramos evidência de que a nova contagem resulte de implementação paralela falsa dos filtros.
- O teste de falha de página continua insuficiente: cria diretório onde deveria haver página 1, ignora o erro ao copiá-la para rollback e verifica somente manifesto, índice e página 2. Não verifica recuperação de toda a geração nem uso pelo provider. Assim, pode passar com página 1 inutilizável. Trata-se de lacuna de assertividade, não prova de intenção de mascarar defeito.
- O caso N-06 deixou de testar o limite uint64 e o ID não decimal diretamente no moderador. A blacklist agora valida decimal; o sharder valida esquema antes da publicação. Limite uint64 estrito não é requisito para aprovar a operação pessoal atual e não é motivo da reprovação.
- Os 13 casos não possuem teste operacional dedicado do caminho Firestore: o relatório superestima cobertura integral de N-08.
- Os cenários de sync/rebuild usam cwd e dados temporários. Não dependem do catálogo real de 178 itens. Algumas suítes antigas de filtro/paginação/recomendação dependem do JSON **mock** versionado em public/data/mock-wallpapers.json; não confundir com catálogo real. O provider mock também importa essa fixture.

## 7. Testes adicionais e resultados

Novo arquivo: [tests/nsfwReaudit.test.mjs:1](../tests/nsfwReaudit.test.mjs#L1). São **13 casos adicionais**, executando moderador, normalizador, pipeline, escritor, rebuild, main de sync e StaticCatalogProvider de produção. Não alteramos os testes anteriores nem produção.

O helper de injeção substitui operações específicas de `node:fs` e atualiza os exports ESM para que o código de produção receba o erro. As substituições são restauradas em finally; os pontos de falha de escrita miram caminhos temporários. O transporte Steam é substituído por Response sintética, com chave fictícia, cwd temporário sem `.env` e restauração do ambiente em finally. O preload offline continua bloqueando rede.

Snapshots guardam SHA-256 e conteúdo por caminho. As asserções comparam o inventário completo dos JSONs e seus hashes; a leitura pelo provider confirma comportamento após rollback em vários cenários. Backup do rebuild é comparado byte a byte com o consolidado original. Não fazemos assert de sucesso para resultados corrompidos.

| Verificação | Resultado |
|---|---|
| `npm test` em c6d6f73, antes dos casos adicionais | **145 aprovados**, zero falhas, 36 suites. Confere a contagem informada. |
| Novos casos isolados | **8 aprovados e 5 falhando**. Quatro falhas de N-05, uma de N-09. |
| `npm test` com regressões adicionais | **158 testes: 153 aprovados, 5 falhando**, 36 suites, zero skip/todo. Exit code 1. |
| `npm run typecheck` | Aprovado. |
| `npm run build` | Aprovado, com aviso conhecido do chunk Firestore de aproximadamente 570 kB. |

**As cinco regressões ficam falhando de propósito para exigir o comportamento correto, não para aceitar o defeito observado.** Corrigir o código deve fazê-las passar. Não recomendamos apagar ou enfraquecer essas expectativas para recuperar um resultado verde.

## 8. Estado dos dados reais e restrições

Inspeção somente leitura recalculou manifesto e índice em memória: **178 itens, oito páginas, zero simulados, zero shards obsoletos**, payloads concordantes entre consolidado e páginas. O snapshot atual é consistente; os defeitos foram reproduzidos só em fixtures.

`.env`, arquivos públicos e backups originais foram comparados por hash e preservados. Nenhum segredo foi exibido. Nenhuma chamada Steam real, sincronização/rebuild real, conexão/escrita Firebase, deploy, push, remoção de backups reais ou comando Git destrutivo ocorreu. O build atualiza dist/, ignorado pelo Git. O estado inicial estava limpo; esta auditoria adiciona teste e relatório sem alterar os documentos existentes. Nenhum commit foi criado.

O relatório de correção menciona `9c6207a` e “commit subsequente”; auditamos o HEAD solicitado **c6d6f73**, sem assumir que o hash citado no texto seja a implementação definitiva.

## 9. Recomendação objetiva

**Não liberar a próxima sincronização real ainda.** Corrigir primeiro R-01 e R-02, completar o inventário de rollback (R-03) e impedir promoção com backup incompleto (R-04). R-05 é uma correção textual pequena e pode entrar no mesmo ciclo. Delimitar operacionalmente o Firestore legado sem alterar a arquitetura JSON-First.

Depois, repetir os testes de falha: todos os casos deverão preservar a geração anterior ou concluir uma nova geração coerente. Isso é um patamar prático de recuperação, não perfeição teórica. As melhorias já aprovadas de moderação devem ser preservadas, inclusive **permitir Unrated/ausente sujeito aos demais filtros**.

Não foram aplicadas correções estruturais automaticamente; este relatório e as regressões deixam os problemas concretos prontos para revisão.
