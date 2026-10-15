# Configuração e sincronização Steam

A chave privada `STEAM_API_KEY` pertence apenas ao processo Node. Nunca use prefixo `VITE_`, argumento `--key=`, logs, arquivos públicos ou commits para fornecê-la. Configure-a no ambiente ou em `.env` local ignorado pelo Git. Não alteramos o `.env` existente durante a auditoria.

A chave pode ser gerenciada na [página oficial Steam](https://steamcommunity.com/dev/apikey). Os termos e a elegibilidade da conta devem ser verificados no serviço pelo proprietário.

## Validação offline

```bash
npm run sync:workshop -- --mock-export
npm run sync:firestore -- --mock-data --limit=200
```

A exportação mock usa `public/data/demo-catalog.json`, marca todos os itens como simulados e não acessa serviços externos. Ausência de chave em modo real é erro. Dados reais e sintéticos não podem ser mesclados.

## Primeira execução real — ainda NÃO autorizada

Somente após a mensagem expressa do proprietário `AUTORIZO A PRIMEIRA SINCRONIZAÇÃO DE 200 WALLPAPERS.`, configure `WALLPAPER_SYNC_AUTHORIZATION` no processo com essa frase exata. Ela é uma confirmação operacional; a existência dessa variável não substitui a autorização do proprietário para o agente.

Decida um único destino para a primeira coleta. Para o Firestore, use o guia específico; não execute também a exportação JSON sem autorização para os dois destinos.

Para JSON local, após autorização e preparação do catálogo sem dados simulados:

```bash
npm run sync:workshop -- --authorize-real-sync --mode=all --pages=1
```

`--mode=all` consulta até 100 populares e 100 recentes, deduplicados por ID; `popular` e `recent` consultam uma página cada. A CLI da primeira coleta rejeita mais de uma página por ordenação. Não há opção `--limit` neste script; o limite de 200 do Firestore está no comando separado. O coletor usa `query_type=0` para popularidade e `1` para data, conforme [enum oficial da Valve](https://partner.steamgames.com/doc/api/ISteamUGC#EUGCQuery).

`--out=caminho.json` altera o destino local. Catálogo corrompido causa falha preservando o original. A gravação usa lock exclusivo, arquivo temporário e rename. Uma interrupção forçada pode deixar lock; inspecione o processo e o arquivo antes de remover o lock manualmente.

O transporte tem timeout de 15 segundos por tentativa e até três tentativas com backoff para falhas de rede, HTTP 429 e 5xx. Isso pode gerar mais de duas requisições físicas na coleta inicial. Não há checkpoint por página: falha definitiva preserva o catálogo anterior e exige reexecução. Cursores e varredura histórica permanecem pendentes; as ordenações do topo não garantem cobertura de todo o Workshop.

## Automação

Os dois workflows disponíveis têm somente `workflow_dispatch`, permissões de leitura e validação offline. Não coletam Steam, não recebem secrets e não fazem push. Ativação de automação real exige nova decisão explícita; não está autorizada por esta auditoria.
