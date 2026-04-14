# 水政通 HydroDoc AI — Claude Code 工作指南

## 项目定位

针对水利执法场景，将碎片化现场证据转化为 GB/T 9704 国标公文的 AI 智能体系统。核心功能：智能起草、法律合规审计、人机协同（Human-in-the-loop）、标准 .docx 导出。

详细产品需求见 [`prd.md`](./prd.md)。

---

## Monorepo 结构

```
HydroDocAI/
├── packages/
│   ├── backend/          # Express + LangGraph.js + RAG + docx 导出
│   ├── frontend/         # Next.js 16 App Router + SSE 客户端
│   └── shared/           # TypeScript 类型定义（SSOT）
├── data/law-library/     # 法律法规 Markdown 原文（RAG 数据源）
├── plan/                 # 重构/功能计划文档
├── test/e2e/             # Playwright E2E 测试
├── prd.md                # 产品需求文档
└── .env                  # 环境变量（不提交）
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js 22, Express, LangGraph.js, MemorySaver checkpointer |
| 前端 | Next.js 16 (App Router), React 19, Tailwind CSS, Lucide React |
| 共享 | TypeScript interfaces (`packages/shared/src/index.ts`) |
| LLM | SiliconFlow API（默认 `Qwen/Qwen3-8B`），key 在 `.env` 的 `API_KEY` |
| Monorepo | pnpm workspaces + Turborepo |
| 测试 | Playwright（`npx playwright test`） |

---

## 开发命令

```bash
pnpm dev          # 启动全栈（前端 :3000，后端 :4001）
pnpm build        # 生产构建
pnpm typecheck    # TypeScript 类型检查
pnpm lint         # ESLint

npx playwright test --project=chromium   # 运行 E2E 测试（需先启动 dev server）
```

---

## 核心代码路径

| 功能 | 文件 |
|------|------|
| LangGraph 工作流（5 个节点） | `packages/backend/src/graph/workflow.ts` |
| Express API（SSE 端点） | `packages/backend/src/index.ts` |
| LLM 客户端（SiliconFlow） | `packages/backend/src/services/llm.ts` |
| RAG 法律检索 | `packages/backend/src/services/rag.ts` |
| Word 导出（GB/T 9704） | `packages/backend/src/services/docx/index.ts` |
| 共享类型定义 | `packages/shared/src/index.ts` |
| SSE 流 hook | `packages/frontend/hooks/useGenerateStream.ts` |
| 人工审核恢复 hook | `packages/frontend/hooks/useResumeStream.ts` |
| 主页（公文生成） | `packages/frontend/app/page.tsx` |
| UI 设计 token | `packages/frontend/tailwind.config.ts` |

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/generate` | 启动公文生成，SSE 流式返回节点进度 |
| POST | `/api/resume` | 人工审核后继续，SSE 流式返回 |
| GET  | `/api/download/:threadId` | 下载已导出的 .docx |
| GET  | `/health` | 健康检查 |

---

## UI 设计规范（不得改动）

所有新页面必须沿用以下 design token，**不引入新 UI 库**：

**颜色**
- 主色：`bg-water-blue`（#1D63B8）— 主按钮、激活态
- 成功：`bg-hydro-success`（#278B45）— 完成、批准按钮
- 错误：`text-gov-red` / `bg-gov-red/5`（#C62127）— 错误信息
- 背景：`bg-hydro-bg`（#F8FAFC）
- 边框/中性：`border-slate-200`、`text-slate-600/700`

**圆角**：全站统一 `rounded-hydro`（4px）

**标准类名组合**
```
容器:   rounded-hydro border border-slate-200 bg-white p-6 mb-6
主按钮: rounded-hydro bg-water-blue px-4 py-2 text-white hover:opacity-90 disabled:opacity-50
次按钮: rounded-hydro border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50
输入框: rounded-hydro border border-slate-200 px-3 py-2 text-slate-800
错误块: rounded-hydro border border-gov-red/30 bg-gov-red/5 p-6 text-gov-red
```

**图标**：来自 `lucide-react`，尺寸 `h-4 w-4` 或 `h-6 w-6`，加 `aria-hidden`

---

## LangGraph 工作流节点顺序

```
draftNode → legalVerificationNode → auditNode
                                        ↓
                          needsHumanReview? ──是──→ humanReviewNode ──→ exportNode
                                        ↓ 否                              ↓
                                    exportNode                           END
```

- `interruptAfter: ["humanReviewNode"]`，中断后通过 `/api/resume` 继续
- `checkpointer: MemorySaver`（内存，进程重启后 threadId 失效）

---

## 环境变量

```bash
# 必填
API_KEY=                        # SiliconFlow LLM API key

# 可选
SILICONFLOW_BASE_URL=           # 默认 https://api.siliconflow.cn/v1
LLM_MODEL=                      # 默认 Qwen/Qwen3-8B
PORT=                           # 默认 4001
CORS_ORIGIN=                    # 默认允许所有来源
NEXT_PUBLIC_API_URL=            # 前端构建时的后端地址，默认 http://localhost:4001
```

---

## 计划文档

重构和功能规划存放在 [`plan/`](./plan/) 目录：

| 文件 | 内容 |
|------|------|
| [`plan/2026-04-14-auth-dashboard-refactor.md`](./plan/2026-04-14-auth-dashboard-refactor.md) | Supabase Auth + Agent Dashboard 重构计划（登录页、历史记录、数据持久化） |

---

## 参考文档

### 开发问题记录

[`docs/development-issues.md`](./docs/development-issues.md) — 已解决的关键问题及根因，包含：

| # | 问题 | 根因 |
|---|------|------|
| 1 | 流程完成后仍显示「处理中…」 | `done` 时未同步设置 `state.status = "completed"` |
| 2 | 点击下载返回 404 | `exportNode` 默认不执行导出，未写入 buffer |
| 3 | 进度条不按节点逐步高亮 | SSE 缓冲 + 前端批量 setState；需后端 `await` 写回调 + 前端 `flushSync` |
| 4 | 内容预览不显示正文 | LangGraph 发 `on_chain_*` 而非 `on_node_*`；后端只发 delta 导致前端丢失 `documentContent` |
| 5 | 内容预览与草案区重复 | 两处都展示 documentContent，移除草案区块 |
| 6 | Resume 与 Generate SSE 行为不一致 | resume 仍用旧事件名，复用 `on_chain_*` + 累积 state 逻辑修复 |

### 部署文档

| 文件 | 内容 |
|------|------|
| [`docs/docker-env-config.md`](./docs/docker-env-config.md) | `.env` 不进镜像原则、构建时/运行时变量注入方式、docker-compose 配置示例 |
| [`docs/docker-build-and-ci.md`](./docs/docker-build-and-ci.md) | Dockerfile 构建规范、GitHub Actions CI/CD、ACR 推送流程 |
| [`docs/monorepo-separate-deployment.md`](./docs/monorepo-separate-deployment.md) | 前后端分离部署方案 |

### Cursor 规则（`.cursor/rules/`）

| 文件 | 作用域 | 内容 |
|------|--------|------|
| [`000-project-architecture.mdc`](./.cursor/rules/000-project-architecture.mdc) | 全局 | Monorepo 目录职能、SSE 协议、导入限制 |
| [`100-langgraph-logic.mdc`](./.cursor/rules/100-langgraph-logic.mdc) | `backend/src/graph/` | 状态机规则、节点日志、`on_chain_*` 事件规范 |
| [`200-legal-rag-standards.mdc`](./.cursor/rules/200-legal-rag-standards.mdc) | `backend/src/services/rag/` | 双路检索、时效性校验、禁止幻觉 |
| [`300-gov-doc-formatter.mdc`](./.cursor/rules/300-gov-doc-formatter.mdc) | `backend/src/services/docx/` | GB/T 9704 字体、字号、行距、页边距硬约束 |
| [`400-hydro-ui-design-system.mdc`](./.cursor/rules/400-hydro-ui-design-system.mdc) | `frontend/**` | 水政蓝/政府红/生态绿色值、`rounded-hydro`、禁止外部组件库 |
| [`base-docker-manager.mdc`](./.cursor/rules/base-docker-manager.mdc) | Dockerfile / CI | Base 镜像规范、ACR 推送、40GB 磁盘约束 |

---

## 编码规范

- 新增类型定义必须放在 `packages/shared/src/index.ts`，前后端共用
- 后端节点函数必须有 `console.log('[Flow] Node: xxx | Thread: yyy')` 日志
- 禁止 AI 编造法律条文；RAG 检索无结果时设 `insufficientLegalGrounds: true`
- SSE 事件类型：`node_start` / `node_end` / `state_update` / `done` / `error`
- 公文排版（GB/T 9704）：字体仿宋_GB2312，三号(16pt)，行距 28pt，页边距上3.7/下3.5/左2.8/右2.6 cm
