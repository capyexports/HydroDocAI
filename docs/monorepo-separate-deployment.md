# Monorepo 前后端分离部署指南

本仓库为 pnpm workspace + Turborepo 的 monorepo，前端（Next.js）与后端（Express）可**独立构建、独立部署**。本文说明如何分离部署及注意事项。

---

## 1. 构建产物与部署目标

| 包 | 构建命令 | 产物目录 | 运行时 |
|----|----------|----------|--------|
| **frontend** | `pnpm build`（在 frontend 下）或见下节 | `packages/frontend/.next/` | `next start` 或托管平台（EdgeOne Pages / Vercel 等） |
| **backend** | `pnpm build`（在 backend 下） | `packages/backend/dist/` | `node dist/index.js`（需 Node 22） |
| **shared** | 无独立产物 | 被 frontend/backend 编译进各自产物 | 不单独部署 |

- **Frontend**：部署的是 **Next.js 应用**。托管平台通常从 Git 拉代码后执行 `build` + 自带 Node 运行或静态导出；自建则用 `next start` 或 [standalone 输出](https://nextjs.org/docs/app/api-reference/next-config-js/output) 做容器/进程托管。
- **Backend**：部署的是 **Node 进程**。需把 `dist/`、`node_modules`（或打包成单文件）、以及运行时需要的 `data/law-library/`、`.env` 等一起放到服务器/容器，用 `node dist/index.js` 启动。

---

## 2. 只构建前端或只构建后端

在**仓库根目录**执行（Turborepo 会按依赖顺序先构建 `shared`，再构建指定包）：

```bash
# 只构建前端（会先构建 shared）
pnpm turbo build --filter=@hydrodocai/frontend

# 只构建后端（会先构建 shared）
pnpm turbo build --filter=@hydrodocai/backend
```

也可用根目录已配置的便捷脚本：

```bash
pnpm build:frontend   # 仅前端
pnpm build:backend    # 仅后端
```

进入各包目录单独构建也可以（需确保 shared 已构建，否则类型可能报错）：

```bash
pnpm --filter @hydrodocai/shared exec pnpm run build  # shared 无 build 可跳过
cd packages/frontend && pnpm build
cd packages/backend  && pnpm build
```

---

## 3. 前端分离部署要点

1. **API 地址**：前端通过 `NEXT_PUBLIC_API_URL` 请求后端，部署时在**构建时**设置该变量为生产后端地址（如 `https://api.yourdomain.com`）。  
   - 若使用 EdgeOne Pages / Vercel 等，在项目设置中配置 **Build 环境变量** 即可。

2. **构建上下文**：若 CI/平台从根目录构建，需指定前端目录为“根”或指定构建命令。例如：
   - **EdgeOne Pages**：多数支持设置 **Root Directory** 为 `packages/frontend`，**Build Command** 为 `pnpm install && pnpm build`（在 monorepo 中也可用根目录 `pnpm build:frontend`，取决于平台是否在仓库根执行）。
   - 若平台只在子目录执行，则在 `packages/frontend` 下执行 `pnpm install` 时需在**仓库根**执行一次 `pnpm install` 以安装 workspace 依赖，或使用 [pnpm deploy](https://pnpm.io/cli/deploy) 打出可部署子集。

3. **可选：Standalone 输出**（自建 Node 或 Docker）：在 `packages/frontend/next.config.ts`（或 `next.config.js`）中设置 `output: 'standalone'`，构建后会生成 `packages/frontend/.next/standalone`，可单独拷贝到服务器运行，减少对整仓 `node_modules` 的依赖。

---

## 4. 后端分离部署要点

1. **运行环境**：Node.js ≥ 22；需可写目录（如 SQLite Checkpointer、可选日志）。

2. **环境变量**：在运行环境中配置，例如：
   - `API_KEY`：LLM 调用（如 Gemini）
   - `PORT`：服务端口，默认 4001
   - `CORS_ORIGIN`：允许的前端来源（生产环境建议设为前端域名，如 `https://your-app.pages.dev`）

3. **必要文件**：
   - `packages/backend/dist/`（构建产物）
   - 若使用文件系统 Checkpointer，需持久化 SQLite 文件所在目录
   - `data/law-library/`：RAG 法规库（若路径通过相对路径或环境变量指向仓库内目录，部署时需一并拷贝或挂载）

4. **依赖安装**：部署目录需有 `node_modules`。在 monorepo 根执行 `pnpm install --prod` 后，将 `packages/backend/node_modules`、`packages/shared` 及 `node_modules` 中 backend 所依赖的包一起拷贝，或使用 `pnpm deploy` 在 backend 下打出可部署包。

---

## 5. CORS 与跨域

前端与后端分属不同域名时，后端必须允许前端来源。当前后端通过 `cors({ origin: process.env.CORS_ORIGIN ?? true })` 配置。分离部署时建议：

- 生产环境设置 `CORS_ORIGIN=https://你的前端域名`（或逗号分隔多域名），避免使用 `true`（允许任意来源）。

---

## 6. CI/CD 示例思路

- **前端流水线**：克隆仓库 → 安装依赖（根目录 `pnpm install`）→ `pnpm build:frontend` → 将 `packages/frontend/.next`（及 `public` 等）交给托管或 `next start`。
- **后端流水线**：克隆仓库 → 安装依赖 → `pnpm build:backend` → 将 `packages/backend/dist`、必要 `node_modules`、`data/law-library`、`.env` 打包并部署到 Node 服务器/容器。

两套流水线可完全独立，使用不同分支或 tag 亦可（只要构建时依赖的 `shared` 版本一致）。

---

## 7. 小结

| 步骤 | 前端 | 后端 |
|------|------|------|
| 仅构建 | `pnpm build:frontend` | `pnpm build:backend` |
| 产物 | `packages/frontend/.next/` | `packages/backend/dist/` |
| 运行 | 托管平台 或 `next start` | `node dist/index.js` |
| 关键环境变量 | `NEXT_PUBLIC_API_URL` | `API_KEY`, `PORT`, `CORS_ORIGIN` |
| 跨域 | — | 设置 `CORS_ORIGIN` 为前端域名 |

按上述方式即可在 monorepo 下实现前后端分离部署；与 [EdgeOne Pages 部署方案](edgeone-pages-deployment.md) 中的「仅前端上 Pages、后端自管」完全兼容。
