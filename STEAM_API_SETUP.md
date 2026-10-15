# Como Obter e Configurar a Steam Web API Key no WallpaperGallery

Este guia contém o passo a passo completo para registrar sua chave da **Steam Web API** da Valve e configurá-la no projeto **WallpaperGallery** para sincronizar wallpapers reais do Wallpaper Engine (AppID 431960) via Steam Workshop.

---

## 1. O que é a Steam Web API e para que ela serve?

A [Steam Web API](https://steamcommunity.com/dev) é a interface oficial fornecida pela Valve para consultar informações da plataforma Steam, incluindo perfis de usuários, itens do Steam Workshop, estatísticas e metadados.

No WallpaperGallery, a chave é utilizada pelo script gerador [`scripts/sync-workshop.ts`](./scripts/sync-workshop.ts) (`npm run sync:workshop`) para:
- Consultar os papéis de parede mais votados ou recentes do Wallpaper Engine.
- Baixar metadados reais: títulos, autores, estatísticas de inscritos/favoritos, resoluções nominais e tags.
- Detectar links de vídeos de demonstração e trailers no YouTube.
- Gerar o arquivo de catálogo [`public/data/catalog.json`](./public/data/catalog.json) utilizado pela galeria.

> [!NOTE]
> **A chave é estritamente para uso no backend ou em scripts locais de geração.** Ela **nunca** deve ser incluída no código frontend (React/Vite) nem enviada ao navegador do usuário.

---

## 2. Requisitos Prévios da Conta Steam

Antes de solicitar a chave, certifique-se de que sua conta Steam atende aos seguintes requisitos da Valve:

1. **Conta Não-Limitada ("Non-Limited Account"):**
   - A Valve exige que a conta tenha gasto no mínimo **\$5,00 USD** (ou valor equivalente em sua moeda local) na Steam Store ou adicionado saldo à Carteira Steam.
   - Contas gratuitas que nunca realizaram compras não podem gerar chaves de API para prevenir bots e abusos.
2. **Steam Guard Ativo:**
   - É recomendável ter a autenticação em duas etapas do Steam Guard ativada (via aplicativo Steam Mobile ou e-mail).

---

## 3. Passo a Passo para Gerar a Chave de API

Siga as etapas abaixo no seu navegador:

### Passo 1: Acessar a página de registro
Acesse a página oficial de gerenciamento de chaves da Valve:
👉 **[https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)**

Faça login com sua conta Steam caso ainda não esteja autenticado.

---

### Passo 2: Preencher o Nome de Domínio (*Domain Name*)
Você verá um formulário simples solicitando o campo **Domain Name** (Nome do Domínio):

```
┌──────────────────────────────────────────────────────────────┐
│  Register Steam Web API Key                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Domain Name: [ localhost                                  ] │
│                                                              │
│  [✓] I agree to the Steam Web API Terms of Use               │
│                                                              │
│  [  Register  ]                                              │
└──────────────────────────────────────────────────────────────┘
```

- **O que preencher em "Domain Name":**
  - Se você vai usar apenas no seu computador para gerar o catálogo do projeto, digite:
    `localhost`
  - Alternativamente, você pode usar o endereço do seu repositório no GitHub:
    `github.com/Figueirin/WallpaperGallery`
  - *Observação:* A Valve não faz validação DNS desse domínio para consultas de leitura pública do Workshop.

---

### Passo 3: Aceitar os Termos e Concluir o Registro
1. Marque a caixa de seleção concordando com os termos de uso (*I agree to the Steam Web API Terms of Use*).
2. Clique no botão **Register** (Registrar).

---

### Passo 4: Copiar e Proteger sua Chave
Após o clique, a página exibirá sua chave exclusiva:

- **Formato:** Uma sequência alfanumérica de 32 caracteres hexadecimais:
  `Key: A1B2C3D4E5F678901234567890ABCDEF`

> [!CAUTION]
> **Mantenha sua chave em segredo!**
> - Nunca compartilhe sua chave publicamente.
> - **Nunca** faça commit da chave no Git (ela não deve subir para o GitHub).
> - Caso sua chave vaze ou seja comprometida, acesse a mesma página e clique em **Revoke My Steam Web API Key** (Revogar chave) para cancelá-la imediatamente.

---

## 4. Configurando a Chave no WallpaperGallery

Existem três maneiras de fornecer a chave para o projeto:

### Método A: Arquivo `.env` local (Recomendado)

Na raiz do projeto (`/home/renato/Documents/VSCode/WallpaperGallery`):

1. Crie uma cópia do arquivo [`.env.example`](./.env.example):
   ```bash
   cp .env.example .env
   ```

2. Abra o arquivo `.env` no seu editor e insira a sua chave:
   ```env
   # Configuração da Steam Web API para o WallpaperGallery
   STEAM_API_KEY=SUA_CHAVE_DE_32_CARACTERES_AQUI
   ```

3. Salve o arquivo. O arquivo `.env` já está incluído no `.gitignore` e não será versionado.

---

### Método B: Variável de Ambiente no Terminal (Linux / Bash)

Se preferir não criar um arquivo `.env`, você pode exportar a variável diretamente no terminal antes de executar o script:

```bash
export STEAM_API_KEY="SUA_CHAVE_DE_32_CARACTERES_AQUI"
npm run sync:workshop
```

---

### Método C: Passando a Chave como Argumento CLI

Você também pode fornecer a chave diretamente na linha de comando:

```bash
npm run sync:workshop -- --key=SUA_CHAVE_DE_32_CARACTERES_AQUI
```

---

## 5. Como Executar a Sincronização do Catálogo

Com a chave configurada, utilize os seguintes comandos dentro da pasta `WallpaperGallery`:

### 1. Sincronização padrão (20 papéis de parede mais populares):
```bash
npm run sync:workshop
```
O script buscará os itens, normalizará tags, categorias e resoluções, gerando o arquivo [`public/data/catalog.json`](./public/data/catalog.json).

### 2. Sincronização com quantidade personalizada:
Para buscar até 100 itens (limite máximo suportado pela API da Steam em uma única consulta):
```bash
npm run sync:workshop -- --limit=50
```

### 3. Definir arquivo de destino diferente:
```bash
npm run sync:workshop -- --out=public/data/custom-catalog.json
```

### 4. Modo Offline / Demonstração (Sem necessidade de chave nem internet):
Caso queira testar o fluxo de geração sem consumir cota da Steam ou sem chave cadastrada:
```bash
npm run sync:workshop -- --mock-export
```

---

## 6. Limites da API e Boas Práticas

| Característica | Limite / Recomendação da Valve |
| :--- | :--- |
| **Limite de Requisições** | Até **100.000 requisições por dia** por chave de API (muito além do necessário para um gerador estático). |
| **CORS (Navegador)** | A API da Steam **não permite chamadas diretas via `fetch()` no navegador** devido a políticas de CORS. Por isso utilizamos scripts Node.js pré-compilados (`scripts/sync-workshop.ts`). |
| **Download de Arquivos** | A Steam Web API fornece apenas metadados e URLs de imagens Akamai (`preview_url`). O download dos arquivos `.pkg` completos só é possível através do cliente Steam oficial ou SteamCMD. |

---

## 7. Solução de Problemas (Troubleshooting)

### Erro: *"Access Denied"* ou botão de registro desabilitado
- **Causa:** Sua conta Steam pode ser limitada (*limited account*).
- **Solução:** É necessário gastar ao menos \$5,00 USD na loja da Steam ou adicionar fundos equivalentes à Carteira Steam.

### Erro: *"Steam API request failed with status 403: Forbidden"*
- **Causa:** A chave informada em `STEAM_API_KEY` ou `--key=` é inválida, foi digitada com espaços extras ou foi revogada.
- **Solução:** Verifique o valor em [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) e certifique-se de que copiou todos os 32 caracteres.

### Erro: *"Steam API request failed with status 429: Too Many Requests"*
- **Causa:** Foram feitas muitas requisições em uma janela muito curta de tempo.
- **Solução:** O script já possui atraso embutido entre páginas. Aguarde alguns minutos antes de tentar novamente.

---

## 8. Automação Diária na Nuvem (GitHub Actions)

Para que o catálogo cresça de forma contínua e autônoma, sem você precisar rodar scripts no seu computador todos os dias, o projeto inclui um workflow de automação em [`.github/workflows/sync-catalog.yml`](./.github/workflows/sync-catalog.yml).

### Como funciona:
1. **Agendamento diário:** O GitHub Actions executa automaticamente todas as madrugadas (às 06:00 UTC / 03:00 de Brasília).
2. **Coleta híbrida (Populares + Recentes):** Consulta tanto os itens mais populares quanto os recém-adicionados ao Workshop.
3. **Fusão incremental:** Os novos wallpapers são mesclados ao [`public/data/catalog.json`](./public/data/catalog.json) existente sem sobrescrever nem perder os itens anteriores.
4. **Commit automático:** Se houver novos wallpapers adicionados, o bot do GitHub Actions faz commit e push do catálogo atualizado para o repositório.

### Como configurar a chave no GitHub (100% Seguro):

> [!IMPORTANT]
> Nunca faça commit do seu arquivo `.env` local. No GitHub, chaves e credenciais devem ser guardadas exclusivamente no **GitHub Secrets**, onde ficam criptografadas e invisíveis no código.

1. Acesse o seu repositório no GitHub: **[https://github.com/Figueirin/WallpaperGallery](https://github.com/Figueirin/WallpaperGallery)**.
2. Clique na aba **Settings** (Configurações) no menu superior do repositório.
3. Na barra lateral esquerda, clique em **Secrets and variables** e depois em **Actions**.
4. Clique no botão verde **New repository secret**.
5. Preencha os campos:
   - **Name:** `STEAM_API_KEY`
   - **Secret:** Cole a sua chave de 32 caracteres da Steam API.
6. Clique em **Add secret**.

Pronto! A partir desse momento, o workflow automatizado terá acesso seguro à chave e rodará diariamente na nuvem. Você também pode disparar a execução manualmente quando quiser pela aba **Actions** > **Sincronizacao Diaria do Catalogo Steam** > **Run workflow**.


