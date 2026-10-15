# Deploy no Cloudflare Workers

O WallpaperGallery está publicado como **Worker com Static Assets e Workers Builds**, conforme informado pelo proprietário. O endereço é fornecido pelo Cloudflare em `*.workers.dev`; use a URL real do Worker existente. Este guia substitui o fluxo anterior de Pages e não presume acesso ao painel nem inventa um domínio.

## Fluxo atual

```text
GitHub (main)
      ↓
Cloudflare Workers Builds
      ↓
npm run build
      ↓
dist/
      ↓
npx wrangler deploy
      ↓
Worker Static Assets → *.workers.dev
```

Workers Builds executa a compilação e depois o comando de publicação. O CI do GitHub valida testes, tipagem e build separadamente; não é ele que publica o Worker. Fonte: [configuração oficial de Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Desenvolvimento e validação local

Use Node.js 24 na raiz do repositório:

```bash
npm ci
npm run dev
```

O catálogo JSON real é o provider padrão. Não é necessário configurar `VITE_DATA_PROVIDER`, Steam API ou Firebase para navegar pelos 15.000 wallpapers.

Antes de integrar alterações para produção:

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

O build escreve em `dist/`. O preview serve a compilação local e não publica nada. Não execute sincronização Steam ou reconstrução do catálogo como parte do build.

## Configuração do projeto existente

Em **Workers & Pages**, selecione o **Worker já existente** e confira a seção **Settings → Build**. Não crie um projeto Pages para esse fluxo.

| Configuração | Valor esperado |
| --- | --- |
| Repositório | `Figueirin/WallpaperGallery` |
| Branch de produção | `main` |
| Root directory | Raiz do repositório, onde está `package.json` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Diretório de assets | `./dist` |
| Versão do Node no build | `NODE_VERSION=24`, recomendado |
| Provider | `catalog` por padrão; `VITE_DATA_PROVIDER=catalog` é opcional |

A variável opcional pode permanecer no ambiente atual: seu valor explícito não muda o resultado. Sem ela, o build também usa o catálogo. Firestore exige `VITE_DATA_PROVIDER=firestore` e configuração própria; permanece legado, fora do fluxo normal.

As variáveis `VITE_*` são incorporadas no build, não configuram dinamicamente um bundle já publicado. Defina eventuais valores no ambiente de **build**, em vez de presumir que bindings de runtime do Worker chegam ao Vite. Não inclua segredos em `VITE_*`. Não são necessárias credenciais Steam/Firebase para esse site estático. Fontes: [variáveis de Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) e [Node na imagem de build](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

## SPA e URLs de detalhes

A configuração de Static Assets precisa manter o equivalente a este fragmento:

```json
{
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

O fallback SPA permite abrir `/wallpaper/:id` diretamente e recarregar com F5. O frontend continua interpretando a rota, sem novo framework de routing. Fonte: [SPA em Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).

A configuração completa está em [wrangler.jsonc](../wrangler.jsonc), com os valores confirmados pelo proprietário no deploy existente: nome `wallpapergallery`, `compatibility_date` `2026-10-12` e observabilidade habilitada. O fallback SPA permanece explícito.

O log anterior confirmou duas compilações: Workers Builds executava `npm run build` e, depois, `wrangler deploy` entrava em autoconfiguração de Vite e repetia o build. O arquivo explícito evita essa autoconfiguração. Não há `build.command` no Wrangler: mantenha **Build command `npm run build`** e **Deploy command `npx wrangler deploy`** no Cloudflare. Assim, o primeiro gera `dist/` e o segundo publica os assets já gerados. Fonte: [como evitar autoconfiguração](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/#skipping-automatic-configuration).

O caminho `$schema` atende às ferramentas de edição quando Wrangler estiver instalado; esta mudança não adiciona dependências. Sem esse pacote instalado localmente, o editor pode não encontrar o schema, o que não altera a configuração de publicação. Não foram alterados settings remotos. No próximo deployment, confira que existe uma única execução de `npm run build` e que o acesso direto/F5 em detalhes continua funcionando.

## Branches e próximas publicações

Desenvolva em `dev`. Após validação e aprovação, incorpore em `main`; com a integração atual habilitada, o push em `main` dispara Workers Builds. Publicar `dev` só gera build/preview se essa branch estiver habilitada nas configurações do Worker. Não trate `dev` automaticamente como o ambiente Preview de Pages.

Confira branch, commit, build command e deploy command nos registros do Worker. Esta documentação não modifica a integração, permissões, domínio ou outros settings remotos.

## Verificação após a publicação

- [ ] O deployment corresponde ao commit esperado da `main`, com build e publicação bem-sucedidos.
- [ ] O site mostra **15.000 wallpapers reais** no snapshot atual.
- [ ] Busca, filtros, ordenação e infinite scroll funcionam; são 600 shards de 25 itens, incluindo o último.
- [ ] O detalhe abre a partir de um card, diretamente em nova aba e após F5.
- [ ] Os links apontam para o item original na Steam Workshop.
- [ ] O layout funciona em tela móvel.
- [ ] As requisições de manifesto, índice e páginas retornam JSON válido.
- [ ] O provider padrão não faz consultas Firestore.

Uma rota do snapshot atual é `/wallpaper/3326873240`. Para snapshots futuros, copie o endereço de um item presente no catálogo publicado.

## Solução de problemas

| Sintoma | Conferência |
| --- | --- |
| Provider desconhecido | Remova uma seleção antiga inválida ou use `catalog`. O app lança erro explícito, sem mudar silenciosamente de fonte. |
| Catálogo indisponível | Confira `dist/data/catalog/manifest.json`, `index.json` e `pages/`, além das respostas em Network. |
| Detalhe retorna 404 no acesso direto | Confira `assets.not_found_handling` na configuração efetivamente usada pelo Worker. |
| Alteração de variável não aparece | Compile e publique novamente; valores Vite pertencem ao build. |
| Build falha | Primeiro erro dos logs, Node 24, lockfile e comandos locais de validação. |
| Aviso de chunk grande | O chunk Firestore legado continua lazy. O aviso conhecido não equivale a falha de compilação. |
| Preview de mídia externa falha | Confira a resposta da origem e outros itens; o site utiliza previews de terceiros. |

Se precisar recuperar uma versão, utilize os controles de versões/deployments do **Worker existente**, confirme o alvo e valide a URL novamente. Não use o procedimento de rollback de Pages nem exclua o projeto. A recuperação no host não corrige o código Git; corrija e valide em desenvolvimento antes de outra publicação.

Depois de confirmar a URL pública, atualize homepage, canonical, sitemap e imagem social usando endereços reais. Mantenha `robots.txt`, favicon e metadados existentes; a licença do código é [MIT](../LICENSE), sem conceder direitos sobre mídias e marcas de terceiros.

[Voltar ao README](../README.md)
