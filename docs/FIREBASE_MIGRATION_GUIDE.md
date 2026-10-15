# Guia de Migração e Infraestrutura: Firebase Cloud Firestore

Este documento descreve a arquitetura, regras de segurança, planejamento de cotas do plano Spark (gratuito), configurações manuais no Firebase Console e os procedimentos para a sincronização com o Steam Workshop no projeto **WallpaperGallery**.

---

## 1. Visão Geral da Arquitetura

O WallpaperGallery transiciona de um catálogo estático/mock para uma arquitetura híbrida com **Firebase Cloud Firestore**:

```
                                      [ GitHub Actions / Local CLI ]
                                                     │
                                       (Steam Web API: AppID 431960)
                                                     │
                                                     ▼
                                      scripts/sync-firestore.ts
                                  (Deduplicação, sanitização e lotes)
                                                     │
                                            (Firebase Admin SDK)
                                                     │
                                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Firebase Cloud Firestore (Spark)                  │
│                                                                        │
│   • Coleção /wallpapers/{publishedfileid}                              │
│   • Metadados /sync_metadata/status                                    │
│   • Regras de Segurança: Leitura pública, escrita estritamente negada  │
└────────────────────────────────────────────────────────────────────────┘
                                                     │
                                             (Firebase Client SDK)
                                                     │
                                                     ▼
                                         FirestoreWallpaperProvider
                                        (Cache em memória inteligente)
                                                     │
                                                     ▼
                                            WallpaperGallery (React)
```

### Princípios de Arquitetura:
1. **Zero Escrita pelo Cliente:** O navegador dos visitantes possui acesso apenas de leitura (`allow write: if false`). Nenhuma operação de escrita, modificação ou exclusão é permitida pelo frontend web.
2. **Separação de Chaves e Privilégios:**
   - A `STEAM_API_KEY` e o `FIREBASE_SERVICE_ACCOUNT_KEY` residem **exclusivamente** no ambiente seguro de sincronização (Node.js local ou GitHub Actions Secrets).
   - O frontend web recebe apenas as credenciais públicas padrão do Firebase (`VITE_FIREBASE_*`), que identificam o projeto e autorizam leituras públicas conforme as regras de segurança.
3. **Provider Pattern Intercambiável:** A aplicação utiliza `IWallpaperDataProvider`. A alternância entre `MockWallpaperProvider` e `FirestoreWallpaperProvider` ocorre de forma transparente através da variável de ambiente `VITE_DATA_PROVIDER=firestore`.

---

## 2. Estimativa e Análise de Cotas — Firebase Plano Spark (Gratuito)

O plano gratuito **Spark** do Firebase possui limites diários e mensais rigorosos:
- **Armazenamento:** 1 GiB total
- **Gravações no Firestore:** 20.000 gravações por dia
- **Leituras no Firestore:** 50.000 leituras por dia
- **Exclusões no Firestore:** 20.000 exclusões por dia
- **Transferência de saída (Egress):** 10 GiB por mês

### Tabela Comparativa de Dimensionamento

| Métrica / Volume | 200 Wallpapers (Inicial) | 1.000 Wallpapers | 10.000 Wallpapers | 100.000 Wallpapers |
| :--- | :--- | :--- | :--- | :--- |
| **Tamanho Médio por Doc** | ~1 KB | ~1 KB | ~1 KB | ~1 KB |
| **Armazenamento Total** | ~200 KB (0,02% de 1 GiB) | ~1 MB (0,1% de 1 GiB) | ~10 MB (1% de 1 GiB) | ~100 MB (10% de 1 GiB) |
| **Gravações para Carga Inicial** | 201 gravações (1% do limite diário) | 1.001 gravações (5% do limite diário) | 10.001 gravações (50% do limite diário) | 100.001 gravações (Excede cota diária de 20k) |
| **Dias para Ingestão Inicial** | 1 dia (execução imediata) | 1 dia | 1 dia | 5 a 6 dias (20k gravações/dia) |
| **Leituras por Visita (Sem Cache)** | 200 leituras | 1.000 leituras | 10.000 leituras | 100.000 leituras (inviável sem paginação) |
| **Leituras com Cache em Memória** | 200 leituras na 1ª carga | 1.000 leituras na 1ª carga | 100 leituras por página (cursor) | 50 a 100 leituras por página |
| **Visitas Diárias Suportadas** | ~250 visitas/dia (sem cache adicional) | ~50 visitas/dia | ~500 sessões paginadas/dia | ~500 a 1.000 sessões paginadas/dia |

### Estratégia de Mitigação de Cotas no Código:
1. **Cache em Memória no Cliente (`firestoreProvider.ts`):** Na primeira consulta, a lista é armazenada na memória da sessão do usuário. Todas as operações de busca textual, filtragem de tags, filtros de resolução e ordenação ocorrem no lado do cliente com **0 leituras adicionais no Firestore**.
2. **Atualização Condicional com Deduplicação (`sync-firestore.ts`):** O script compara a data de modificação (`time_updated`) e dados do item antes de gravar. Se o item não sofreu alterações no Workshop, a gravação é ignorada, economizando gravações na cota diária.
3. **Gravação em Lote (`commitBatch`):** Gravações agrupadas em blocos atômicos de até 400 documentos por commit, garantindo estabilidade e integridade.

---

## 3. Limitações Técnicas Identificadas

1. **Ausência de Cloud Functions no Spark:** No plano Spark do Firebase, o Cloud Functions não permite conexões externas à internet (como chamar a Steam Web API). Portanto, a sincronização **não pode** ser feita via Firebase Functions sem migrar para o plano pago Blaze. **Solução adotada:** Executar o script de sincronização via GitHub Actions (com cron ou manual) ou localmente via Node.js, comunicando-se com o Firestore através do Firebase Admin SDK.
2. **Limite de 20.000 gravações diárias:** Não é possível ingerir mais de 20.000 novos itens por dia no plano gratuito. Para um catálogo massivo de mais de 100.000 itens, o pipeline de ingestão deve obrigatoriamente operar de forma incremental ao longo de vários dias com checkpoints salvos.
3. **Mídias Externas:** O Firestore não armazena arquivos binários (imagens e vídeos). Todos os wallpapers armazenam apenas as URLs de prévia CDN públicas da Valve/Steam Workshop.

---

## 4. Configurações Manuais no Firebase Console

Siga o passo a passo abaixo para preparar seu ambiente no Firebase:

### Passo 1: Criar o Projeto no Firebase
1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Clique em **Adicionar projeto** e nomeie como `wallpaper-gallery` (ou similar).
3. O Google Analytics é opcional (pode desativar para simplificar).
4. Certifique-se de manter o plano **Spark (Gratuito)**. **NÃO** adicione cartão de crédito nem ative o plano Blaze.

### Passo 2: Criar o Banco de Dados Cloud Firestore
1. No menu lateral esquerdo, vá em **Compilação** (Build) > **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha o modo de inicialização: selecione **Modo de produção**.
4. Selecione a região do banco de dados (ex: `southamerica-east1` em São Paulo, ou `us-central1`).
5. Confirme a criação.

### Passo 3: Aplicar as Regras de Segurança
1. No Cloud Firestore, vá na aba **Regras** (Rules).
2. Cole o seguinte conteúdo (presente no arquivo `firestore.rules` do repositório):
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /wallpapers/{wallpaperId} {
         allow read: if true;
         allow write: if false;
       }
       match /sync_metadata/{docId} {
         allow read: if true;
         allow write: if false;
       }
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```
3. Clique em **Publicar** (Publish).

### Passo 4: Registrar a Aplicação Web (Frontend)
1. Nas configurações do projeto (ícone de engrenagem no topo esquerdo > **Configurações do projeto**).
2. Na aba **Geral**, role até "Seus aplicativos" e clique no ícone **Web** (`</>`).
3. Registre o app com o nome `WallpaperGallery Web`.
4. O Firebase exibirá um objeto de configuração com as variáveis:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. Copie essas chaves e adicione-as ao seu arquivo `.env` local:
   ```env
   VITE_DATA_PROVIDER=firestore
   VITE_FIREBASE_API_KEY=sua_api_key
   VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=seu_project_id
   VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
   VITE_FIREBASE_APP_ID=seu_app_id
   ```

### Passo 5: Gerar a Chave da Conta de Serviço (Para Ingestão/Admin)
1. Em **Configurações do projeto**, clique na aba **Contas de serviço** (Service accounts).
2. Selecione **Firebase Admin SDK** (Node.js).
3. Clique no botão **Gerar nova chave privada** e confirme.
4. Um arquivo JSON será baixado no seu computador.
5. **ATENÇÃO MÁXIMA DE SEGURANÇA:**
   - **NUNCA** coloque este arquivo no Git nem compartilhe seu conteúdo.
   - O `.gitignore` do projeto já protege arquivos como `*serviceAccountKey*.json` e `firebase-service-account*.json`.
   - Salve o arquivo na raiz do projeto como `firebase-service-account.json`.
   - No `.env`, aponte para ele:
     ```env
     FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
     ```

---

## 5. Checklist de Segurança Realizado

- [x] `.gitignore` atualizado para bloquear arquivos de conta de serviço (`*serviceAccountKey*.json`, `service-account*.json`, `firebase-service-account*.json`).
- [x] Histórico Git auditado: Nenhuma chave Steam ou Firebase vazada no repositório.
- [x] Regras de segurança do Firestore configuradas para bloquear 100% das tentativas de escrita vindas do cliente web (`allow write: if false`).
- [x] `STEAM_API_KEY` mantida estritamente privada, nunca prefixada com `VITE_` e inacessível no bundle do frontend.
- [x] Script de sincronização implementa modo `--dry-run` ativado por padrão.
- [x] Workflow do GitHub Actions configurado com disparo agendado desativado (`# cron`), permitindo apenas execução manual sob demanda e com confirmação explícita.

---

## 6. Procedimento e Comandos para a Primeira Sincronização Real

> ⚠️ **IMPORTANTE:** O script está programado para **NÃO** sincronizar dados reais sem o parâmetro `--real` e sem as credenciais configuradas. O limite do lote inicial é rigidamente travado em **200 wallpapers**.

Quando autorizado, os comandos para execução da sincronização real são:

### Simulação Local (Dry Run — Não consome cota nem grava dados):
```bash
npm run sync:firestore -- --mock-data --limit=200
```

### Sincronização Real Local (Somente com autorização explícita e credenciais no .env):
```bash
npm run sync:firestore -- --real --limit=200
```

### Validação Pós-Sincronização:
1. Abra o Firebase Console > **Firestore Database**.
2. Verifique a coleção `wallpapers` contendo 200 documentos identificados pelos `publishedfileid` da Steam.
3. Verifique o documento `sync_metadata/status` confirmando a contagem e data/hora da sincronização.
4. Execute `npm run dev` com `VITE_DATA_PROVIDER=firestore` no `.env` e confirme o carregamento fluido dos 200 wallpapers na interface.
