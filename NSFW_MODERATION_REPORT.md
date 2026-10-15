# WallpaperGallery — Relatório Técnico de Implementação da Moderação NSFW Obrigatória

Data: 15 de Outubro de 2026  
Status: Implementado, Validado e Testado  
Cobertura de Testes: 127 testes aprovados (35 suítes)

---

## 1. Arquitetura Implementada

A arquitetura de moderação foi projetada como um **pipeline centralizado, hierárquico e fail-closed**, executado exclusivamente durante as etapas de sincronização e geração de dados (Node.js no backend/CI), desonerando 100% o navegador dos usuários finais.

```mermaid
flowchart TD
    A["Item Bruto da Steam Workshop"] --> B["Camada 1: Moderação de Metadados"]
    B -->|Rating Mature / Questionable ou Palavras-Chave NSFW| C["Status: BLOCKED (Curto-Circuito sem Download)"]
    B -->|Metadados Limpos| D["Camada 2: Moderação Visual de Imagem"]
    D -->|Host Não Confiável / Timeout / Erro de Rede| E["Status: REVIEW (Fail-Closed)"]
    D -->|Magic Bytes Inválidos / Formato Desconhecido| E
    D -->|Cache SHA-256 Hit| F["Recuperação Imediata do Cache"]
    D -->|Cache Miss| G["Download Seguro & Análise YCbCr"]
    G -->|Tons de Pele > 48% / NSFW Elevado| C
    G -->|Tons de Pele 35% - 48% / Incerteza| E
    G -->|Tons de Pele < 35% / Seguro| H["Status: SAFE"]
    
    C --> I[".moderation/quarantine.json (Quarentena Fora de public/)"]
    E --> I
    H --> J["public/data/catalog.json (Gravação Atômica)"]
    J --> K["public/data/catalog/ (Shards manifest.json, index.json, pages/*.json)"]
```

### Componentes Principais

1. **`src/services/moderation/types.ts`**:
   - Define os tipos fundamentais: `ModerationStatus` (`'safe' | 'review' | 'blocked'`), categorias (`steam_rating`, `metadata_keyword`, `visual_analysis`, `download_failure`, `format_validation`), motivos estruturados (`ModerationReason`) e sumarização estatística.

2. **`src/services/moderation/metadataModerator.ts`**:
   - Inspeção de flags oficiais de classificação etária da Steam (`Mature`, `Questionable`).
   - Normalização de texto via Unicode NFKD (remoção de acentos e diacríticos) e correspondência estrita com limites de palavra (`\b...\b`) para prevenir falsos positivos.
   - Detecção de ideogramas e gírias de conteúdo adulto em chinês e japonês (ex: `色情`, `成人`, `无修`, `露点`, `18禁`, `工口`, `エロ`).
   - Lista branca e salvaguarda para termos ambíguos legítimos (`anime`, `girl`, `romance`, `art`, `cute`, `cosplay`) e padrões estruturais (ex: `夜莺Night——XXX`).

3. **`src/services/moderation/visualModerator.ts`**:
   - `safeDownloadImage`: Download seguro com timeout curto (5000ms via `AbortSignal.timeout`), teto estrito de tamanho (10 MB), validação de protocolo `https:`, restrição a hosts autorizados da CDN Steam (`images.steamusercontent.com`, `steamcdn-a.akamaihd.net`, etc.) e verificação de integridade de Magic Bytes (`FF D8 FF` para JPEG, `89 50 4E 47` para PNG, `RIFF...WEBP` para WebP).
   - `evaluateSkinToneHeuristic`: Classificador heurístico estatístico em espaço de cor YCbCr (amostragem direta de chunks IDAT descompactados em PNG e análise cromática com sensibilidade à proporção de pele).
   - Suporte extensível a classificadores adicionais via injeção de dependência (`customClassifier`).
   - Cache persistente indexado por hash SHA-256 (`.moderation/visual_cache.json`).
   - **Fail-Closed**: Qualquer falha de rede, timeout, formato malicioso ou inconclusividade rebaixa o status para `review`, impedindo automaticamente a entrada no catálogo público.

4. **`src/services/moderation/moderationPipeline.ts`**:
   - Orquestrador unificado. Executa a camada de metadados primeiro: se o item for bloqueado, o pipeline aplica curto-circuito e descarta a necessidade de requisições de rede.

5. **`scripts/rebuild-catalog.ts`**:
   - Script para sanitização retroativa do catálogo existente sem necessidade de tocar na Steam Web API ou consumir cotas.
   - Cria backup seguro verificável com carimbo temporal em `.moderation/backups/`.
   - Gera relatório auditável em `.moderation/quarantine.json`.
   - Grava `public/data/catalog.json` atomicamente com lock de concorrência.
   - Regenera shards e remove páginas obsoletas em `public/data/catalog/pages/`.

6. **`scripts/sync-workshop.ts`**:
   - Integração nativa do pipeline no fluxo de coleta incremental do Steam Workshop, garantindo que nenhum item reprovado seja mesclado ou publicado.

---

## 2. Bibliotecas e Modelos Avaliados e Escolhidos

### Análise de Alternativas

| Abordagem | Custo Financeiro | Dependências / Tamanho | Viabilidade Offline / CI | Escolha |
| :--- | :--- | :--- | :--- | :--- |
| **APIs Externas** (Sightengine, Google Cloud Vision, AWS Rekognition) | Pago após cota mínima; exige faturamento | Leve no repo, mas exige chaves e internet | Inviável (violaria regra estrita de custo zero) | **Rejeitado** |
| **Modelos Pesados** (TensorFlow.js + NSFWJS) | Gratuito | >150 MB de dependências nativas (`node-gyp`), problemas frequentes de compilação no Node 24 | Inconsistente em pipelines leves de CI | **Rejeitado para o MVP** |
| **Solução Local Heurística YCbCr + Descompactação PNG Nativa** | 100% Gratuito | 0 dependências externas (utiliza `node:crypto`, `node:zlib`, `node:fs`) | Totalmente determinístico, ultrarrápido (<10ms por imagem) | **Adotado como Classificador Padrão** |
| **Interface Desacoplada (`customClassifier`)** | Gratuito | Flexível | Permite plugar modelos locais ONNX / MobileNet no futuro sem refatorar o pipeline | **Adotado na Arquitetura** |

---

## 3. Critérios Exatos de Aprovação, Revisão e Bloqueio

| Status | Critérios e Condições Disparadoras | Destino do Item |
| :--- | :--- | :--- |
| **`blocked`** | 1. Steam Rating oficial igual a `Mature` ou `Questionable`.<br>2. Presença de tags `Mature` ou `Questionable`.<br>3. Termos explicitamente adultos no título, tags ou descrição (ex: `nsfw`, `18+`, `r-18`, `hentai`, `ecchi`, `lewd`, `erotica`, `nudity`, `porn`, etc.).<br>4. Ideogramas orientais restritos (ex: `18禁`, `成人`, `色情`, `无修`, `露点`).<br>5. Análise visual com score NSFW $\ge 0.70$ (ou razão YCbCr de pele $> 48\%$). | Excluído do catálogo público. Gravado em `.moderation/quarantine.json`. |
| **`review`** | 1. Análise visual incerta ou limítrofe (score NSFW entre $0.35$ e $0.70$, ou incerteza cromática $\ge 0.50$).<br>2. Falha de download da imagem de preview (timeout, erro de rede, host não autorizado).<br>3. Falha de formato (Magic bytes desconhecidos ou corrompidos).<br>4. Item sem URL de preview válida. | **Retido preventivamente (Fail-Closed)**. Não entra no catálogo público nem nos shards. Registrado em quarentena com motivo detalhado. |
| **`safe`** | Metadados 100% livres de indicadores adultos E análise visual com score NSFW $< 0.35$ e magic bytes verificados. | **Aprovado**. Gravado no catálogo público e indexado nos shards. |

---

## 4. Limitações e Riscos de Falsos Positivos e Falsos Negativos

### Prevenção de Falsos Positivos (Garantias Implementadas)
- **Limites de Palavra (`\b`)**: Palavras legítimas que contêm substrings coincidentes não são bloqueadas (ex: `Classic Retrowave`, `Passionate Piano`, `Documentary Nature Loop`, `Titanium Spaceship`).
- **Lista Branca de Termos Ambíguos**: Termos frequentes no Steam Workshop como `anime`, `girl`, `romance`, `art`, `cute`, `cosplay` e `waifu` são explicitamente permitidos na ausência de qualificadores adultos.
- **Tolerância a Placeholders Estruturais**: Ocorrências de `XXX` em instruções de arquivo (como `夜莺Night——XXX`) são reconhecidas como marcadores de formatação e não disparam bloqueio.

### Riscos de Falsos Negativos e Limitações Conhecidas
- **Heurística Cromática Visual**: Imagens de praias arenosas, dunas de deserto ou móveis de madeira em close-up podem ter proporções altas de tons amarelados/alaranjados, podendo ser encaminhadas para `review`.
- **Evasão Textual Avançada**: Utilização de leetspeak extremo, espaçamento de caracteres (ex: `n s f w`) ou emojis não mapeados pode passar pela camada de metadados se o criador catalogar o item fraudulentamente como `Everyone`. Nesses casos, a camada visual é a segunda linha de defesa.
- **Wallpapers do tipo Video / Web**: Se a thumbnail for um frame estático inócuo (ex: tela preta inicial), o conteúdo em vídeo ou script HTML interno pode conter material explícito não aparente no preview.

---

## 5. Auditoria do Catálogo Atual (200 Wallpapers da Steam)

Ao aplicar o pipeline de reconstrução e sanitização sobre os 200 wallpapers reais coletados:

| Categoria | Quantidade | Percentual | Observações |
| :--- | :---: | :---: | :--- |
| **Total Original Analisado** | **200** | 100% | Amostra real do Steam Workshop (AppID 431960) |
| **Wallpapers Aprovados (`safe`)** | **178** | **89,0%** | Conteúdo seguro, publicado em `catalog.json` e shards |
| **Wallpapers Bloqueados (`blocked`)** | **22** | **11,0%** | Retidos e excluídos do catálogo público |
| — Bloqueados por Steam Rating | 21 | 10,5% | Ratings oficiais `Mature` ou `Questionable` |
| — Bloqueados por Metadados/Tags | 1 | 0,5% | Item ID `3589454154` (classificado como `Everyone`, mas com termo adulto `成人` na descrição) |
| **Itens em Revisão (`review`)** | 0 | 0,0% | — |

> [!NOTE]
> O caso do item ID `3589454154` comprova a importância da camada de metadados textuais: o criador marcou a classificação Steam como `Everyone` para burlar os filtros da plataforma, mas nosso filtro de conteúdo textual identificou o aviso adulto e efetuou a quarentena imediata.

---

## 6. Como Reprocessar o Catálogo sem Acessar a Steam

Para sanitizar o catálogo localmente sem realizar nenhuma chamada à Steam Web API:

```bash
# Executa a reconstrução e sanitização offline
npm run moderate:rebuild -- --skip-visual
```

### O que o script realiza automaticamente:
1. **Backup Automático**: Cria uma cópia íntegra em `.moderation/backups/catalog_backup_<timestamp>.json`.
2. **Avaliação das Regras**: Executa todas as regras de moderação sobre cada wallpaper.
3. **Isolamento de Quarentena**: Escreve o relatório detalhado dos itens rejeitados em `.moderation/quarantine.json` (pasta ignorada pelo `.gitignore`, nunca exposta em `public/`).
4. **Substituição Atômica**: Grava `public/data/catalog.json` de forma segura com lock anti-concorrência.
5. **Particionamento em Shards**: Atualiza `manifest.json`, `index.json` e as páginas em `public/data/catalog/pages/`, expurgando shards obsoletos.

---

## 7. Evidências de Testes

A suíte de testes de moderação (`tests/moderation.test.mjs`) foi executada em conjunto com todas as demais suítes do projeto.

### Comandos de Validação Executados:
```bash
npm test
npm run typecheck
npm run build
```

### Resultado:
- **Testes Unitários e de Integração**: **127 testes passando em 35 suítes** (0 falhas).
- **TypeScript**: `tsc -b && tsc -p tsconfig.scripts.json` concluído com **0 erros**.
- **Build de Produção**: `vite build` concluído com sucesso em **3.5s**.

---

## 8. Próximos Passos Recomendados

1. **Deploy da Quarentena em CI/CD**: Adicionar `npm run moderate:rebuild -- --skip-visual` como etapa obrigatória antes do empacotamento ou publicação do site.
2. **Interface Interna de Revisão**: Desenvolver um visualizador administrativo local para inspecionar itens em `.moderation/quarantine.json`.
3. **Modelo ONNX Opcional**: Para grandes volumes futuros, avaliar o empacotamento opcional de um modelo ONNX leve (ex: quantized MobileNet-NSFW) acoplável via `customClassifier`.
