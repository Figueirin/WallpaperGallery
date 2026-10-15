# Migração para catálogo padrão e remoção da demonstração

Data: **15/10/2026**. Estado da validação local: **PRONTO PARA PRODUÇÃO**. Publicação remota **não realizada**: faltou autenticação de escrita no GitHub e o proprietário escolheu concluir localmente para enviar depois.

## Branches e preservação

O working tree estava limpo, em `dev`. Após `git fetch origin`, `origin/dev` estava em `4607225` e `origin/main` em `d352ffc`. A divergência da main continha somente a linha em branco de `docs/CATALOG_EXPANSION_REPORT.md`. A dev já coincidia com origin/dev; foi feito merge de origin/main em dev, sem conflitos e sem descartar commits. Foi usado o equivalente local de `pull --ff-only` após fetch (`merge --ff-only origin/dev`), evitando uma segunda busca desnecessária.

O README e guia criados em dev foram preservados como base para os ajustes. Nenhum reset, rebase destrutivo ou force push foi utilizado.

## Comportamento anterior e atual

Antes, a ausência de seleção de provider instanciava o provider de demonstração. Agora, `ProviderType` aceita somente `catalog` e `firestore`; a factory usa **`catalog` por padrão**, sem variável. `catalog` explícito continua válido; seleção removida ou desconhecida lança erro. Firestore exige seleção e configuração explícitas, mantendo import dinâmico e dependências existentes.

As mensagens de erro do catálogo deixaram de sugerir outra fonte. Catálogo ausente, inválido ou simulado continua sendo rejeitado. As validações `isSimulated` e os bloqueios de links de itens simulados foram preservados; os avisos defensivos remanescentes identificam conteúdo simulado sem oferecer um modo de produto.

## Arquivos e ocorrências classificados

Removidos da aplicação/publicação:

- `src/services/mockProvider.ts` e sua importação/seleção na factory.
- `public/data/mock-wallpapers.json`, movido para `tests/fixtures/wallpapers.json` como fixture privada, com URLs de mídia fictícias não acessadas.
- `public/data/legacy-simulated-samples.json`, registro simulado fora do catálogo real.
- `public/videos/preview-sample.mp4`, `preview-sample-2.mp4` e `preview-sample.webm`: aproximadamente **2,20 MB** somados, sem uso pelo produto após a remoção.
- Textos e branches de interface que anunciavam catálogo de demonstração.

O gerador offline Firestore manteve sua simulação administrativa, mas sua URL de vídeo agora é `https://example.invalid/offline-fixture.mp4`, sem depender de asset público. Não se alterou a coleta real Steam. Test doubles, fakes de transporte, fixtures sintéticas, simulações administrativas e proteções de integridade permanecem intencionais. Ocorrências de “demonstração” em trailers YouTube e previews web descrevem mídia real da Workshop, não uma fonte alternativa de catálogo. Relatórios históricos mantêm sua evidência.

Os testes de filtro/paginação/recomendação continuam usando os mesmos dados sintéticos em localização privada. O teste do antigo provider foi reescrito para chamar `StaticCatalogProvider` de produção, verificando falha por ausência, rejeição de simulados e recuperação com dados válidos. O teste da factory foi convertido para verificar o padrão real; não houve remoção de suites, skips ou relaxamento de proteções.

Foi identificada uma dependência preexistente do teste de frontend em backup ignorado pelo Git. Os **mesmos 178 IDs** foram copiados para `tests/fixtures/original-catalog-ids.json`; a comparação de preservação de todos eles continua obrigatória, agora reproduzível num checkout sem backups locais. O backup original não foi modificado nem excluído.

## Documentação, ambiente e CI

README e `.env.example` explicam o padrão `catalog`; a variável explícita é opcional. O CI deixou de definir o provider no build, exercitando o default num checkout normal sem `.env`.

O antigo guia Pages foi substituído por [CLOUDFLARE_WORKERS_DEPLOY.md](CLOUDFLARE_WORKERS_DEPLOY.md): **GitHub → Workers Builds → npm run build → dist → npx wrangler deploy → Static Assets → workers.dev**. Documenta `assets.not_found_handling = single-page-application`, Node 24 recomendado, variáveis de build opcionais e validação de detalhes/F5. O relatório pré-deploy recebeu aviso histórico com links atuais.

A hospedagem e seu tratamento SPA foram informados pelo proprietário. Não havia configuração Wrangler versionada no checkout; não se inventou nome de Worker nem se alterou configuração remota. O guia diferencia esse limite de inspeção da configuração esperada. O push autorizado é o gatilho da integração existente; não foi executado Wrangler diretamente.

## Validações

| Verificação | Resultado |
| --- | --- |
| `npm test` em dev | **192 aprovados**, 37 suites; zero falhas, skips ou todo. |
| `npm run typecheck` | Aprovado. |
| `npm run build`, sem definir o provider no comando | Aprovado; o `.env` local já continha `catalog` e foi preservado. |
| Cópia limpa em `/tmp`, sem `.env`, sem provider no ambiente e sem backups ignorados | **192 testes**, typecheck e **`npm run build` aprovados**. Prova independente do default, sem depender da configuração local. |
| Factory de produção sem variável | Carrega 979 itens, busca, filtra, ordena, pagina e retorna detalhes via fetch de arquivos local. Página 40 com 4 itens. |
| Valores explícitos | `catalog` aceito; seleção removida e valores desconhecidos rejeitados; Firestore configurado continua lazy sem conexão. |
| Bundle sem variável | Caminho default `catalog` presente; provider de demonstração, IDs da fixture antiga e assets demonstrativos ausentes. JS principal aproximadamente 309,62 kB; Firestore continua lazy, com o aviso conhecido de chunk grande. |
| `npm run preview` da cópia sem `.env` | HTTP 200 na raiz e rota direta `/wallpaper/3326873240`, mesmo HTML SPA; manifesto/índice/páginas inicial e final corretos. Servidor encerrado após a conferência. |
| Dados protegidos | **60 hashes SHA-256 idênticos**: catálogo consolidado, manifesto, índice, páginas, `.env` e arquivos locais de moderação/backups. |
| Resíduos | Nenhum provider/import/seleção de demonstração no código da aplicação. Referências remanescentes classificadas acima. |

Não há navegador automatizado instalado: não se afirma validação visual de cliques/F5. As interações de dados foram exercitadas por testes de produção e a rota SPA pelo preview HTTP. Não houve chamada Steam/Firebase, reconstrução do catálogo real ou alteração de dependências.

## Integração e publicação

- Merge de `origin/main` em `dev`: **`173ee9f`**, preservando `d352ffc` e o histórico da documentação em dev, sem conflitos.
- Migração de código/testes/documentação: **`9f270d0`** (`refactor: make static catalog the default data source`).
- Integração em main: **fast-forward de `d352ffc` para `9f270d0`**. Typecheck e build foram executados novamente na main, sem definir o provider no comando, e passaram.
- Nova busca antes da integração confirmou que os remotos não haviam mudado: `origin/dev=4607225`, `origin/main=d352ffc`.
- Tentativa de `git push origin dev`: bloqueada por autenticação ausente (`could not read Username for https://github.com`). Nenhuma referência remota foi atualizada. O push de main, condicionado ao sucesso do primeiro, não chegou a ser executado.
- Após ser informado, o proprietário escolheu **“Concluir localmente; farei os pushes depois”**. Não haverá nova tentativa nesta tarefa. O registro final é incluído em commit documental local e incorporado também em main, mantendo as duas branches alinhadas.
- **CI remoto/deploy:** não acionados por esta tarefa. Não há resultado novo para verificar no GitHub ou no painel Cloudflare. A integração existente só receberá o código quando o proprietário publicar as branches.

Para o proprietário, após autenticar e conferir novamente se os remotos não mudaram:

```bash
git push origin dev
git push origin main
```

Esses comandos são a etapa manual pendente; não foram concluídos pelo agente. O segundo enviará o código para a branch ligada ao deploy automático informado. Não usar força se algum remoto avançar.

**Parecer: PRONTO PARA PRODUÇÃO**, quanto ao código, catálogo e validações locais. Publicação e validação hospedada ficam pendentes do envio pelo proprietário. Nenhum token foi solicitado ou exposto; não houve alteração de settings remotos, execução direta de Wrangler ou chamadas Steam/Firebase.
