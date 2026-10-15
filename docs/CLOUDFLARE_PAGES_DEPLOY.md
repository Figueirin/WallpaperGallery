# Deploy manual no Cloudflare Pages

Guia para o proprietário de **Figueirin/WallpaperGallery** publicar o catálogo estático. A configuração é feita manualmente no painel; este documento não executa operações remotas. Instruções consultadas na documentação oficial em **15/10/2026**; os nomes dos menus podem mudar.

## 1. Antes de começar

Você precisará de acesso ao repositório no GitHub e a uma conta Cloudflare. O projeto usa Node.js 24 e o catálogo já versionado: não é necessário coletar novos dados da Steam, executar rebuild ou configurar Firebase.

O fluxo recomendado é **`dev` para desenvolvimento/preview e `main` para produção**. As alterações aprovadas precisam estar disponíveis no GitHub na branch correspondente antes de o Pages conseguir compilá-las. Publicar branches ou integrar mudanças em `main` é uma ação separada, a ser realizada pelo proprietário; este guia não altera o Git.

Na raiz do checkout, valide a versão que pretende publicar:

```bash
npm ci
npm test
npm run typecheck
VITE_DATA_PROVIDER=catalog npm run build
npm run preview
```

Os dois últimos comandos usam Bash/POSIX; em outro shell, defina `VITE_DATA_PROVIDER=catalog` em `.env.local` antes do build. Confira o endereço informado pelo Vite. `npm run preview` é apenas uma prévia local, não o servidor do Cloudflare.

## 2. Escolher o modo de publicação

Este guia usa **Cloudflare Pages com integração GitHub**. Você configura o primeiro deploy manualmente no painel, mas essa integração pode publicar automaticamente os próximos pushes das branches habilitadas. Ela é independente do workflow CI do repositório.

Se quiser controlar manualmente cada publicação futura, revise os controles de deploy automático após a configuração, conforme a seção 7. Não é necessário instalar Wrangler ou configurar um projeto Workers para seguir este guia. A distinção entre integração Git e upload direto está no [guia oficial de integração Git](https://developers.cloudflare.com/pages/get-started/git-integration/).

## 3. Conectar o repositório

1. No painel Cloudflare, abra **Workers & Pages**.
2. Selecione **Create application → Pages → Connect to Git**.
3. Escolha GitHub e autorize a integração para o repositório necessário.
4. Selecione **Figueirin/WallpaperGallery** e avance para a configuração.
5. Escolha o nome do projeto e confira a branch de produção: **`main`**.

Use o caminho de **Pages** na criação. O procedimento do painel e a seleção de repositório estão descritos na [documentação oficial](https://developers.cloudflare.com/pages/get-started/git-integration/). Se o repositório não aparecer, confira a conta GitHub selecionada e a permissão da integração sobre ele.

## 4. Configurar o build

| Campo | Valor |
| --- | --- |
| Production branch | `main` |
| Framework preset | React (Vite), se disponível; conferir manualmente os valores abaixo |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Raiz do repositório (`/`); pode deixar vazio se o painel já usar a raiz por padrão |

A raiz correta é a pasta que contém `package.json`, `package-lock.json`, `src/` e `public/`. No repositório GitHub, não configure uma subpasta `WallpaperGallery` apenas porque esse é o nome da pasta no computador local.

O comando gera `dist/`, que contém o frontend e os arquivos de `public/`, incluindo o catálogo. A combinação de comando e diretório segue a [configuração oficial de build para React/Vite](https://developers.cloudflare.com/pages/configuration/build-configuration/). O projeto não precisa de comando de inicialização de servidor no host.

## 5. Configurar Production e Preview

Defina estas variáveis de build nos **dois ambientes**:

| Nome | Production | Preview |
| --- | --- | --- |
| `VITE_DATA_PROVIDER` | `catalog` | `catalog` |
| `NODE_VERSION` | `24` | `24` |

Cadastre Production antes do primeiro build. Se o formulário inicial não oferecer Preview, configure-o nas variáveis do projeto em **Settings**, selecionando o ambiente **Preview**, antes de criar o primeiro preview. Confira ambos os ambientes separadamente; não presuma que os valores foram copiados.

**`VITE_DATA_PROVIDER=catalog` é obrigatório para exibir o catálogo real.** Sem a variável, o aplicativo usa `mock`. `NODE_VERSION=24` alinha o host ao ambiente de desenvolvimento e ao CI; o Cloudflare permite definir a versão dessa forma, conforme a [documentação de build image](https://developers.cloudflare.com/pages/configuration/build-image/).

O arquivo `.env` do computador está ignorado pelo Git e não é enviado pela integração. As configurações precisam existir no painel. Valores `VITE_*` são incorporados ao JavaScript durante o build: não coloque segredos neles e faça uma nova compilação após alterá-los.

Para este site estático, não cadastre `STEAM_API_KEY`, credenciais Firebase, service accounts ou tokens de sincronização. Também não acrescente scripts de sync, enriquecimento ou moderação ao comando de build: os dados já estão publicados nos JSONs versionados.

## 6. Fazer e validar o primeiro deploy

Após revisar branch, comando, diretório e variáveis, clique em **Save and Deploy**. Acompanhe os logs de instalação e build; ao concluir, abra a URL efetivamente fornecida pelo Pages. Confira na tela do deployment a branch e o commit publicados. O procedimento está no [guia oficial do primeiro deploy](https://developers.cloudflare.com/pages/get-started/git-integration/).

Valide no navegador:

- [ ] A galeria mostra o catálogo real, atualmente com **979 wallpapers**, e não a demonstração.
- [ ] Busca, filtros, ordenação e navegação entre páginas funcionam.
- [ ] A página de detalhe abre e os links levam ao item correto na Steam Workshop.
- [ ] Uma URL de detalhe abre diretamente em nova aba e continua funcionando após recarregar.
- [ ] A interface funciona em uma largura de tela móvel.
- [ ] Em Network, manifesto, índice quando solicitado e páginas JSON respondem com JSON válido, sem erros de carregamento.
- [ ] O modo `catalog` não faz requisições ao Firestore.
- [ ] Previews carregam quando disponíveis; eventuais falhas da mídia externa não impedem navegar pelo catálogo.

Uma rota real do snapshot atual é `/wallpaper/3326873240`. Você também pode copiar o link de qualquer item exibido; prefira um ID presente no catálogo que acabou de publicar.

### Rotas SPA

O frontend interpreta `/wallpaper/:id` no navegador. O host deve entregar `index.html` ao abrir diretamente essa rota. O Pages fornece esse fallback para SPAs **quando não há `404.html` na raiz publicada**; o projeto atual atende a essa condição. Não é necessário adicionar `_redirects` ou mudar o router para este deploy. Fonte: [Serving Pages — comportamento SPA](https://developers.cloudflare.com/pages/configuration/serving-pages/).

O fallback é desejável para rotas de interface, mas não prova que um JSON existe: um caminho de dados errado pode receber HTML. Por isso, confira também o conteúdo e o tipo de resposta das requisições de dados.

## 7. Preview e próximas publicações

Mantenha `main` como produção e use `dev` para preview. Com a integração e os deploys automáticos habilitados, commits enviados às branches permitidas geram novas publicações. Um preview não substitui a versão de produção; use a URL exibida pelo deployment para testá-lo. Fontes: [previews](https://developers.cloudflare.com/pages/configuration/preview-deployments/) e [controle de branches](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

Em **Settings → Builds & deployments**, revise os controles de produção e preview. É possível limitar previews a `dev` com **Custom branches**, ou desabilitar publicações automáticas. Escolha esse comportamento conscientemente se desejar acionar cada build manualmente pelo painel; confirme a branch/commit e use a opção de nova tentativa/redeploy disponível no deployment apropriado. Veja os [controles oficiais](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

O workflow `.github/workflows/ci.yml` valida instalação, testes, tipagem e build. Ele **não publica** no Cloudflare, e a integração Pages não deve ser presumida como dependente de o CI terminar. O proprietário pode configurar proteção de `main` com verificações obrigatórias antes de aprovar futuras integrações.

Sempre que alterar variáveis, solicite um novo build do ambiente correspondente; apenas salvar a variável não muda um bundle já publicado.

## 8. Solução de problemas

| Sintoma | O que conferir |
| --- | --- |
| Aparece a demonstração em vez dos wallpapers reais | `VITE_DATA_PROVIDER=catalog` no ambiente do deployment e novo build após definir a variável. |
| Preview está correto, produção não, ou vice-versa | Variáveis separadas de Production/Preview e branch/commit de cada deployment. |
| Build não encontra `package.json` | Root directory deve ser a raiz do repositório, não uma pasta local ou `dist/`. |
| Instalação ou compilação falha | Primeiro erro dos logs, Node 24, lockfile presente e comandos locais da seção 1. Não ignore falhas de testes/tipagem para publicar. |
| Arquivos compilados não são encontrados | Build command `npm run build` e output `dist`, sem barra ou subpasta extra indevida. |
| Detalhes funcionam ao clicar, mas dão 404 ao recarregar | Fallback SPA, ausência de `404.html` na raiz e eventuais regras externas que interceptem a rota. |
| Erro ao ler JSON ou resposta começando com HTML | URL solicitada em Network e presença de `data/catalog/manifest.json`, `index.json` e `pages/` na saída do build. |
| Um preview de imagem/vídeo falha | URL externa e resposta do servidor da mídia. Compare com outros itens antes de atribuir a falha ao catálogo. |
| Aviso de chunk acima de 500 kB | O chunk Firebase legado é lazy; o aviso conhecido não é uma falha de compilação. Confirme o sucesso final do build. |

O [relatório pré-deploy](PREDEPLOY_REPOSITORY_REPORT.md) registra a inspeção anterior do bundle e dos dados; é histórico, não substitui os logs do novo deployment.

## 9. Recuperar uma publicação anterior

Se uma atualização de produção introduzir um problema, abra **Deployments**, encontre uma versão anterior de produção compilada com sucesso e use **Rollback to this deployment** no menu de ações. Confirme o alvo e valide a URL de produção novamente. Um preview não é um alvo válido de rollback de produção, e o primeiro deploy ainda não terá uma versão anterior disponível. Fonte: [rollbacks oficiais](https://developers.cloudflare.com/pages/configuration/rollbacks/).

O rollback do host não corrige o código no Git: antes de publicar novamente, ajuste o problema em desenvolvimento e valide a correção. Não exclua o projeto nem backups para tentar recuperar uma publicação.

## 10. Depois de validar a URL pública

- Registrar a URL real como homepage do repositório e, quando definido, configurar o domínio próprio.
- Preparar canonical, sitemap e imagem social usando o domínio e arquivos reais; conferir também os metadados das páginas individuais.
- Manter `robots.txt`, favicon e metadados existentes. Não inventar URLs para antecipar essas etapas.
- Confirmar o resultado do CI no GitHub e decidir a proteção de branches.
- A licença do código já é [MIT](../LICENSE); os direitos sobre mídias e marcas de terceiros permanecem com seus titulares.

[Voltar ao README](../README.md)
