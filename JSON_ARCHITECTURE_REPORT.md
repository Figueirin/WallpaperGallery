# WallpaperGallery — Relatório Técnico de Arquitetura JSON-First (Fase 2)

**Data de Emissão:** 14 de Outubro de 2026  
**Status do Repositório:** Pronto para Produção (Coleta Real Bloqueada)  
**AppID Alvo:** `431960` (Wallpaper Engine — Steam Workshop)  
**Ambiente de Testes:** Node.js 24 (100% Offline, Sandbox Isolado)

---

## 1. Visão Geral da Arquitetura JSON-First

O projeto **WallpaperGallery** foi concebido como uma galeria responsiva de wallpapers inspirada no Steam Workshop para usuários de Linux (KDE Plasma) e desktop moderno.

### 1.1 Motivação da Transição Arquitetural
Inicialmente, a arquitetura previa o Firebase Cloud Firestore (Plano Spark gratuito) como fonte de persistência primária. No entanto, uma análise detalhada de custos, limites de cota e performance revelou os seguintes gargalos no uso do Firestore Spark como catálogo principal:
1. **Limites de Leitura Diária (50.000 leituras/dia):** Cada visitação à galeria e paginação consumia leituras do banco, criando risco de indisponibilidade rápida com o crescimento de tráfego.
2. **Consultas Complexas e Índices Compostos:** Filtragem combinada de múltiplas tags com ordenação por popularidade ou data no Firestore exige criação prévia de índices compostos manuais rígidos e não suporta busca textual livre (full-text search) nativa sem serviços pagos adicionais (como Algolia).
3. **Sobrecarga do SDK Cliente:** As bibliotecas `@firebase/firestore` e `@firebase/app` adicionavam mais de 560 kB ao bundle JavaScript principal baixado pelo usuário final.

### 1.2 O Modelo JSON-First Shardado
A Fase 2 consolida a transição para um modelo **JSON-First estático particionado em shards**:
- **Custo Zero de Infraestrutura:** O catálogo é gerado em tempo de compilação ou sincronização agendada e hospedado como arquivos estáticos puros (compatível com GitHub Pages, Vercel, Netlify ou Cloudflare CDN).
- **Desempenho Imediato:** Leituras estáticas em CDN têm latência de milissegundos e cache HTTP agressivo (`Cache-Control: public, max-age=...`).
- **Escala Progressiva:** Em vez de forçar o navegador a baixar um arquivo monolítico de dezenas de megabytes, o catálogo é dividido em **Shards de 24 itens** e um **Índice Compacto de Busca**.
- **Firestore Preservado:** A integração Firestore permanece intacta no repositório, porém isolada, desacoplada e disponível para casos de uso dinâmicos futuros (como favoritos salvos na nuvem, autenticação e preferências de usuário).

---

## 2. Estrutura de Arquivos e Formato dos Dados

A arquitetura particionada estrutura o catálogo no diretório estático acessível via web (`public/data/catalog/`):

```
public/data/
├── catalog.json                  # Fallback de compatibilidade monolítico legado
└── catalog/                      # Catálogo Shardado de Alta Performance (v2.0.0)
    ├── manifest.json             # Metadados globais, contagens e mapa de shards
    ├── index.json                # Índice compacto e minificado para busca/filtros
    └── pages/                    # Shards contendo os itens completos
        ├── 000001.json           # Shard da Página 1 (itens 1 a 24)
        ├── 000002.json           # Shard da Página 2 (itens 25 a 48)
        └── ...                   # Shards subsequentes
```

### 2.1 `manifest.json` (Manifesto Global)
Fornece informações imediatas sobre a versão do catálogo, contagem total de itens, configurações de paginação, mapeamento de IDs para páginas e os filtros disponíveis (tags, resoluções e tipos já consolidados):

```json
{
  "version": "2.0.0",
  "generatedAt": "2026-10-15T02:00:00.000Z",
  "appId": 431960,
  "totalItems": 200,
  "pageSize": 24,
  "totalPages": 9,
  "metadata": {
    "tags": ["Anime", "Cyberpunk", "Nature", "Rain", "Space"],
    "resolutions": ["1920x1080", "2560x1440", "3840x2160"],
    "types": ["Scene", "Video", "Web", "Application"]
  },
  "shards": [
    {
      "page": 1,
      "file": "pages/000001.json",
      "count": 24,
      "idRange": ["2987102911", "2987102934"]
    }
  ],
  "itemToPage": {
    "2987102911": 1,
    "2987102935": 2
  }
}
```

### 2.2 `index.json` (Índice Compacto de Busca)
Projetado para transferência ultrarrápida. Contém apenas os campos indispensáveis para busca, filtragem e ordenação, utilizando chaves abreviadas para economizar bytes (`pop` para popularidade, `res` para resolução, `desc` para descrição):

```json
[
  {
    "id": "2987102911",
    "title": "Neon Sakura Cyberpunk City Rain",
    "type": "Scene",
    "res": "3840x2160",
    "tags": ["Cyberpunk", "Rain", "City"],
    "rating": "Everyone",
    "author": "SteamArtist",
    "desc": "Cenário cyberpunk em Neo-Tokyo com chuva reativa.",
    "pop": 54200,
    "date": 1723636800000,
    "page": 1
  }
]
```

### 2.3 `pages/XXXXXX.json` (Shards de Itens Completos)
Cada shard armazena até 24 itens com o schema completo `WallpaperItem` (URLs de previews, estatísticas detalhadas da Steam, badges de mídia, links do cliente Steam e tags completas).

---

## 3. Fluxo de Geração e Sincronização

A geração do catálogo particionado é executada pelo script `scripts/sync-workshop.ts` com salvaguardas estritas:

```mermaid
flowchart TD
    A["Início: sync-workshop.ts"] --> B["Verificar Autorização Expressa"]
    B -- "Sem Autorização" --> C["Abortar: Código de Saída 1"]
    B -- "Autorizado" --> D["Coleta Incremental via Steam Web API"]
    D --> E["Validação de Esquema e Filtro de Indisponíveis"]
    E --> F["Normalização Determinística de Metadados"]
    F --> G["Merge Incremental com Catálogo Anterior"]
    G --> H["Aquisição de Lock Exclusivo (.lock)"]
    H --> I["Geração dos Shards e Manifesto em Pasta Temp"]
    I --> J["Substituição Atômica (Rename)"]
    J --> K["Liberação de Lock e Relatório Final"]
```

### 3.1 Salvaguardas Implementadas
1. **Bloqueio de Execução Real Sem Autorização:** O script exige explicitamente o argumento `--auth="AUTORIZO A PRIMEIRA SINCRONIZAÇÃO DE 200 WALLPAPERS."` para conectar aos servidores da Valve.
2. **Tolerância Zero a Contaminação de Dados Simulados:** O gerador rejeita atomicamente qualquer item marcado como `isSimulated: true` se o destino for o catálogo de produção.
3. **Escrita Atômica Concorrente:** Utiliza flags `wx` com arquivos `.lock` e escrita em diretórios temporários (`.catalog_tmp_*`) finalizada com renomeação atômica (`renameSync`), prevenindo corrupção em caso de queda de energia ou terminação prematura do processo.

---

## 4. Estratégia de Navegação, Busca, Filtragem e Paginação

O provedor `StaticCatalogProvider` (`src/services/staticCatalogProvider.ts`) implementa a interface `IWallpaperDataProvider` com otimizações direcionadas aos diferentes fluxos do usuário:

### 4.1 Navegação Padrão (Caminho Crítico / Fast Path)
Quando o usuário entra na galeria pela primeira vez (sem filtros ativos e ordenação padrão por popularidade):
1. O cliente faz a requisição apenas do `manifest.json` (~3 KB).
2. O método `getFilterMetadata()` resolve instantaneamente em 0 ms utilizando o objeto `manifest.metadata`.
3. O método `getWallpapers({ page: 1 })` busca diretamente o shard correspondente: `pages/000001.json` (~15 KB).
4. **Volume total trafegado:** Menos de 20 KB de dados transferidos. Zero processamento de CPU do cliente gasto para indexação.

### 4.2 Busca e Filtragem Avançada (Search & Filter Path)
Quando o usuário digita um termo de busca ou seleciona múltiplos filtros:
1. O `StaticCatalogProvider` baixa sob demanda o `index.json`.
2. Executa a filtragem em memória utilizando a mesma lógica matemática formal de `filterWallpapers.ts`.
3. Identifica com precisão quais IDs compõem a página resultante solicitada.
4. Consulta o mapa `manifest.itemToPage` para determinar quais shards contêm esses itens.
5. Baixa apenas os shards necessários em paralelo e monta a página de resultado com itens completos.
6. Os shards e itens carregados são armazenados em um cache em memória (`Map<number, CatalogShard>` e `Map<string, WallpaperItem>`), eliminando requisições HTTP repetidas.

### 4.3 Visualização de Detalhes (`getWallpaperById`)
Ao clicar em um wallpaper ou abrir diretamente uma URL com seu ID:
1. O provedor consulta `manifest.itemToPage[id]` em tempo $O(1)$.
2. Carrega especificamente o shard que contém o item e o retorna instantaneamente.

---

## 5. Análise de Escalabilidade e Projeções de Desempenho

| Escala do Catálogo | Tamanho do Manifesto | Tamanho do Índice (`index.json`) | Quantidade de Shards | Download Inicial (Fast Path) | Download c/ Busca Ativa |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **200 Itens (Fase 1)** | ~3 KB | ~30 KB (gzip ~7 KB) | 9 arquivos (~15 KB/shard) | **~18 KB** | **~48 KB** |
| **1.000 Itens** | ~10 KB | ~150 KB (gzip ~32 KB) | 42 arquivos (~15 KB/shard) | **~25 KB** | **~175 KB** |
| **10.000 Itens** | ~90 KB | ~1.5 MB (gzip ~310 KB) | 417 arquivos (~15 KB/shard) | **~105 KB** | **~1.6 MB** |
| **100.000 Itens** | ~850 KB | ~15 MB (gzip ~3.1 MB) | 4.167 arquivos | **~865 KB** | **~15.8 MB** |
| **1.000.000 Itens** | Particionado | Índice distribuído | 41.667 arquivos | Shards sob demanda | Motor de busca dedicado |

### 5.1 Conclusões sobre a Escala
- **De 200 a 10.000 wallpapers:** A arquitetura JSON-First é incomparavelmente superior a qualquer banco relacional ou NoSQL em termos de simplicidade, velocidade e custo (totalmente grátis).
- **Acima de 50.000 wallpapers:** O índice compacto em memória ultrapassa 7 MB; nesse patamar, recomenda-se a introdução de busca indexada no cliente com Pagefind ou SQLite compilado para WebAssembly (WASM).

---

## 6. Otimização do Bundle e Desacoplamento do Firebase

Durante a implementação, foi identificado que a simples presença do `FirestoreWallpaperProvider` importado estaticamente causava a inclusão de todos os módulos de rede e criptografia do Firebase no bundle principal do aplicativo React.

### 6.1 Solução Implementada
1. Criação de `src/config/firebaseEnv.ts`: Detector de variáveis de ambiente sem nenhuma dependência do SDK do Firebase.
2. Implementação de `LazyFirestoreWallpaperProvider` em `src/services/providerFactory.ts`: Carregamento dinâmico via `import('./firestoreProvider.ts')` somente se `VITE_DATA_PROVIDER=firestore` estiver explicitamente ativado.

### 6.2 Resultados de Bundle (`npm run build`)
- **Antes da otimização:**
  - `dist/assets/index.js`: **881.45 kB** (238.10 kB gzip) — *Firebase incluído compulsoriamente*.
- **Após a otimização:**
  - `dist/assets/index-KonExyD1.js`: **316.92 kB** (93.00 kB gzip) — **Redução de 64% no bundle principal!**
  - `dist/assets/firestoreProvider-CCI3gB-t.js`: **570.23 kB** (149.24 kB gzip) — *Carregado exclusivamente se o usuário optar por Firestore*.

---

## 7. Evidências de Testes e Equivalência de Referência

A robustez da nova arquitetura foi comprovada através de uma nova suíte de testes dedicada (`tests/shardedCatalog.test.mjs`) e pela execução da suíte completa do repositório:

### 7.1 Resultados Consolidados
- **Total de Suítes Executadas:** 29 suítes
- **Total de Casos de Teste:** 109 testes
- **Taxa de Sucesso:** 100% de aprovação (0 falhas, 0 cancelamentos)
- **Tempo de Execução:** ~760 ms (totalmente offline)
- **Verificação de Tipos (`npm run typecheck`):** 0 erros TypeScript (`tsc -b && tsc -p tsconfig.scripts.json`).

### 7.2 Teste de Equivalência Matemática de Referência
O teste `Comparação de Referência: busca e filtros no provedor shardado coincidem 100% com a filtragem de referência` submeteu o `StaticCatalogProvider` e o algoritmo puro em memória `filterAndSortWallpapers` a 11 cenários complexos de teste com 60 wallpapers diversificados:
- Busca textual por termos parciais e insensíveis a maiúsculas/minúsculas.
- Filtros unitários e múltiplos de tipo (`Scene`, `Video`, `Web`).
- Filtros de resolução (`1080p`, `1440p`, `4K`, `Ultrawide`).
- Filtros com união de tags temáticas (`Cyberpunk`, `Rain`, `Anime`).
- Ordenações distintas (`popularity_desc`, `date_desc`, `date_asc`, `title_asc`).
- Paginação com diferentes offsets e cálculo exato de `hasMore` e `total`.

**Resultado:** O `StaticCatalogProvider` apresentou **100% de paridade lógica, quantitativa e ordinal** com o algoritmo de referência.

---

## 8. Limitações Técnicas e Próximos Passos

1. **Catálogo de Produção Atual:**
   - O arquivo `public/data/catalog.json` existente ainda contém 3 itens marcados como simulados legados. O provider `catalog` em modo estrito rejeita propositalmente esse arquivo para evitar a exibição de dados falsos em ambiente de produção.
2. **Primeira Sincronização Real Pendente:**
   - Nenhuma chamada à Steam Web API foi executada até o momento.
   - O repositório aguarda a autorização do proprietário para realizar a primeira coleta de exatamente 200 itens.
3. **Automação Contínua Futura:**
   - Quando autorizado, a atualização diária poderá ser configurada via GitHub Actions (executando o particionamento em shards e gerando commit seguro no repositório de dados estáticos).

---

## 9. Instruções para Autorização da Primeira Coleta Real (200 Itens)

Para efetuar a primeira coleta real e popular o catálogo particionado oficial:

1. Certifique-se de que a variável `STEAM_API_KEY` está configurada no seu arquivo `.env` local:
   ```env
   STEAM_API_KEY=sua_chave_steam_workshop_aqui
   ```
2. Para que o agente possa executar a coleta autorizada, envie explicitamente a seguinte mensagem:
   ```
   AUTORIZO A PRIMEIRA SINCRONIZAÇÃO DE 200 WALLPAPERS.
   ```
3. O comando executado internamente com a referida autorização será:
   ```bash
   node --experimental-strip-types scripts/sync-workshop.ts --mode=all --pages=1 --auth="AUTORIZO A PRIMEIRA SINCRONIZAÇÃO DE 200 WALLPAPERS."
   ```
   *Nota: O modo `all` com `--pages=1` busca 1 página de populares (100 itens) e 1 página de recentes (100 itens), totalizando exatamente os 200 itens autorizados.*

---
*Relatório emitido e validado com sucesso pela auditoria de engenharia.*
