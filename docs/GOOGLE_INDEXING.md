# Preparar a indexação do wewallpapers.cc

Este guia é para o proprietário executar **depois de aprovar, integrar e publicar** as mudanças. A tarefa de SEO não acessou Search Console, DNS ou configurações Cloudflare.

## Após o deploy

1. Abra o Google Search Console com a conta responsável e adicione uma propriedade de **domínio**, `wewallpapers.cc`, sem protocolo ou caminho.
2. Siga a verificação DNS fornecida pelo Google. No DNS Cloudflare, publique exatamente o registro solicitado. Não invente o token. A verificação por DNS não exige meta tag no código. [Guia oficial de verificação](https://support.google.com/webmasters/answer/9008080).
3. Confirme que `https://wewallpapers.cc/robots.txt` retorna texto com `Sitemap: https://wewallpapers.cc/sitemap.xml` e que o sitemap retorna **XML**, não a home pelo fallback SPA. Esta última condição falhava no site público durante a auditoria.
4. Em **URL Inspection**, inspecione `https://wewallpapers.cc/`. Execute o teste ao vivo, confira o HTML renderizado e solicite indexação se estiver correto.
5. Inspecione também `https://wewallpapers.cc/wallpaper/3299228616`, que existe no snapshot auditado. Verifique título específico, conteúdo, imagem, canonical autorreferente e carregamento dos JSONs. Confira tanto o canonical declarado quanto o escolhido pelo Google quando disponível. O teste ao vivo não garante indexação. [Documentação de URL Inspection](https://support.google.com/webmasters/answer/9012289).
6. Em **Sitemaps**, envie `https://wewallpapers.cc/sitemap.xml`. O snapshot atual tem 5.001 URLs: home e 5.000 wallpapers. Não envie URLs de filtros, localhost ou workers.dev e não solicite individualmente 5.000 indexações.
7. Acompanhe **Pages / Indexing**, **Sitemaps**, **Core Web Vitals** e **HTTPS**, quando os relatórios tiverem dados. Investigue erros de renderização, canonical divergente, recursos bloqueados e URLs descobertas/rastreadas mas não indexadas; o processamento pode levar tempo.

## O que esta implementação entrega

- Origem canônica HTTPS, sem www, centralizada em `src/config/site.ts`.
- `npm run seo:generate` gera sitemap e robots a partir do catálogo oficial, sem rede. `npm run build` executa essa geração antes do Vite, copiando os arquivos para `dist/`.
- Links absolutos no sitemap, sem parâmetros, duplicatas ou datas inventadas. O namespace XML `http://www.sitemaps.org/...` é o identificador padrão do formato, não uma URL pública do site.
- Canonical único e metadados sociais por rota após execução do JavaScript. Os filtros da home canonizam para a home.
- Uma imagem social local real e previews individuais HTTPS quando disponíveis. Não há promessa de que todos os serviços sociais executem JavaScript ou consigam buscar previews Steam.

## Limitação importante da SPA

O HTML bruto é compartilhado por todas as rotas. Ele já tem título, descrição, OG/Twitter e JSON-LD genéricos, mas o conteúdo e os metadados específicos de cada wallpaper dependem do JavaScript e dos JSONs. O canonical também é inserido pelo cliente; ele foi omitido do shell compartilhado para não declarar a home como canonical de todos os detalhes. O Google [documenta essa alternativa para SPAs](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

Não basta ver 5.001 URLs enviadas para concluir que todas estão indexadas. Após o deploy, valide primeiro a renderização de uma amostra de detalhes no Search Console. Se houver atraso persistente, falhas de renderização ou necessidade de previews sociais específicos sem JS, avalie prerender/SSR em uma tarefa separada. Nesta etapa não foram gerados 5.000 HTMLs nem alterada a hospedagem.

O infinite scroll mantém links `<a href="/wallpaper/ID">` nos cards e recomendações, mas não se presume que o crawler role até o final. O sitemap oferece descoberta direta de todos os itens; não substitui avaliação do conteúdo renderizado. Leia a [orientação Google para lazy loading](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading).

## Domínios e manutenção

O endereço oficial é `https://wewallpapers.cc/`. O teste local do canonical não comprova redirects do host. A auditoria pública observou HTTP → HTTPS e falha de resolução de www a partir deste ambiente; nenhuma alteração DNS foi feita. O hostname antigo workers.dev não foi informado. Se continuar acessível, confirme o canonical no HTML renderizado e considere redirecioná-lo ao domínio oficial no painel, como ação separada do proprietário.

Após remover/adicionar wallpapers, gere novamente o sitemap e valide antes de publicar. Não é necessário manter as 5.000 URLs manualmente. O gerador não coleta Steam, não reconstrói o catálogo e não usa secrets. Não insira `noindex` em robots.txt nem bloqueie `/data/` ou os arquivos JS/CSS necessários à renderização.

[Auditoria e evidências](SEO_INDEXING_AUDIT.md)
