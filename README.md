# 水政通 (HydroDoc AI)

AI-powered document assistant for water administration: turn field evidence into GB/T 9704–compliant official documents.

## Features

- **Smart drafting**: Input violation descriptions, OCR text, or survey notes; AI extracts entities, links legal provisions via RAG, and drafts notices or penalty decisions.
- **Legal compliance**: Citations are validated against the law library; no hallucinated articles.
- **Human-in-the-loop**: Low-confidence steps pause for review; resume after approve/edit.
- **Standards-compliant export**: One-click `.docx` export with correct fonts, spacing, and margins (GB/T 9704).

## Tech stack

| Layer      | Stack |
|-----------|--------|
| Backend   | Node.js 22, Express, LangGraph.js, RAG (law library), docx.js |
| Frontend  | Next.js 16, React 19, Tailwind CSS, Lucide React |
| Shared    | TypeScript interfaces (SSOT) |
| Monorepo  | pnpm workspaces, Turborepo |

## Project structure

```
HydroDocAI/
├── packages/
│   ├── backend/    # LangGraph workflow, RAG, Word export, SSE API
│   ├── frontend/   # Next.js app, SSE client, document preview
│   └── shared/     # TypeScript types (GraphState, etc.)
├── data/
│   └── law-library/   # Law sources (e.g. 水法.md) for RAG
├── prd.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Prerequisites

- **Node.js** ≥ 22
- **pnpm** (recommended; project uses `packageManager: "pnpm@10.28.2"`)

## Getting started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Environment**

   Create `.env` in the repo root or in `packages/backend` as needed. Backend may expect an API key for the LLM (e.g. for RAG/generation); see `packages/backend` and `docs/` for details.

3. **Run in development**

   ```bash
   pnpm dev
   ```

   This starts both backend and frontend (Turborepo). Open the frontend URL (e.g. `http://localhost:3000`) and use the drafting flow.

4. **Build**

   ```bash
   pnpm build
   ```

5. **Lint & typecheck**

   ```bash
   pnpm lint
   pnpm typecheck
   ```

## Data

- **Law library**: Place law sources (Markdown or processed text) under `data/law-library/`. They are used for RAG retrieval so citations match the library exactly.

## Documentation

- **Product & roadmap**: `prd.md`
- **Development notes**: `docs/development-issues.md`
- **Deployment**: `docs/monorepo-separate-deployment.md` (frontend/backend split), `docs/edgeone-pages-deployment.md` (EdgeOne Pages), `docs/docker-env-config.md` (Docker & .env), `docs/docker-build-and-ci.md` (Dockerfile & GitHub Actions push to ACR)
- **Architecture / rules**: `.cursorrules` and `.cursor/rules/`

## License

Private repository.
