# WallpaperGallery

Galeria React + TypeScript + Vite + Tailwind de wallpapers do Wallpaper Engine (AppID 431960). Firestore Spark permanece a arquitetura da fase inicial.

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Use Node.js 24. Os testes bloqueiam rede e removem credenciais do ambiente de teste. Não há lint configurado.

A fonte é explícita em `VITE_DATA_PROVIDER`: `mock` (padrão, 16 exemplos identificados como demonstração), `catalog` (JSON real, falha sem fallback se inválido/simulado) ou `firestore` (configuração obrigatória). O antigo `public/data/catalog.json` contém três exemplos agora marcados como simulados: preserve-os em arquivo de demonstração antes de substituir esse catálogo por dados reais. O provider `catalog` rejeita esse arquivo intencionalmente.

Validação offline autorizada:

```bash
npm run sync:firestore -- --mock-data --limit=200
npm run sync:workshop -- --mock-export
```

O segundo comando gera `public/data/demo-catalog.json` e os shards correspondentes em `public/data/demo-catalog/`. Nunca mistura demonstração com catálogo real. Os workflows são manuais e executam somente validações offline, sem secrets, cron, commits ou push.

A arquitetura do catálogo estático de alta escala utiliza particionamento em shards (`manifest.json`, `index.json` e `pages/*.json`). A primeira coleta real está pendente da autorização expressa do proprietário. Veja [arquitetura JSON-First](JSON_ARCHITECTURE_REPORT.md), [guia Steam](STEAM_API_SETUP.md), [guia Firestore](docs/FIREBASE_MIGRATION_GUIDE.md), [auditoria independente](CODEX_AUDIT_REPORT.md) e [alterações](CODEX_CHANGELOG.md). Nenhum ambiente real foi validado; testes aprovados não significam prontidão para produção.
