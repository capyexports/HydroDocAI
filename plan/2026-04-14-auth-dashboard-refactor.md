# HydroDocAI 重构计划：Supabase Auth + Agent Dashboard

## Context

当前项目是单页应用，无认证、无持久化。要求新增：
- Email + Password 登录页（`/login`）
- Agent Dashboard 作为登录后主页（`/`），显示历史公文记录
- 公文生成页移至 `/generate`
- Supabase Auth 认证 + 数据库持久化（document_threads 表）
- 支持：列表查看、恢复中断流程、查看已完成内容、删除记录
- **UI 风格完全沿用现有 design token，不引入新 UI 库**

---

## 一、Supabase 数据库 Schema

### 表：`document_threads`

```sql
CREATE TABLE public.document_threads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id           TEXT NOT NULL UNIQUE,
  document_type       TEXT NOT NULL CHECK (document_type IN ('限期缴纳通知书', '行政处罚决定书')),
  status              TEXT NOT NULL DEFAULT 'drafting'
                      CHECK (status IN ('drafting', 'reviewing', 'completed')),
  raw_input           TEXT NOT NULL DEFAULT '',
  raw_input_preview   TEXT GENERATED ALWAYS AS (LEFT(raw_input, 60)) STORED,
  document_content    TEXT,
  revision_count      INTEGER NOT NULL DEFAULT 0,
  needs_human_review  BOOLEAN NOT NULL DEFAULT FALSE,
  human_review_reason TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 自动更新触发器
CREATE TRIGGER document_threads_updated_at
  BEFORE UPDATE ON public.document_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 索引
CREATE INDEX idx_document_threads_user_id_created ON public.document_threads(user_id, created_at DESC);
CREATE INDEX idx_document_threads_thread_id ON public.document_threads(thread_id);

-- RLS
ALTER TABLE public.document_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON public.document_threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own" ON public.document_threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own" ON public.document_threads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own" ON public.document_threads FOR DELETE USING (auth.uid() = user_id);
```

---

## 二、路由结构变更

| 路由 | 文件 | 说明 |
|------|------|------|
| `/` | `app/page.tsx` | **改为 Dashboard**（重命名现有 → `generate`） |
| `/generate` | `app/generate/page.tsx` | 公文生成页（原 `app/page.tsx` 逻辑迁移） |
| `/login` | `app/login/page.tsx` | 登录页（新建） |

---

## 三、完整文件清单

### 新建文件

```
packages/frontend/middleware.ts                        # 路由保护
packages/frontend/app/login/page.tsx                  # 登录页
packages/frontend/app/generate/page.tsx               # 公文生成页（原 page.tsx 迁移）
packages/frontend/lib/supabase/client.ts              # 浏览器端 Supabase client
packages/frontend/lib/supabase/server.ts              # Server Component 用 Supabase client
packages/frontend/hooks/useSupabaseUser.ts            # 用户状态 hook
packages/backend/src/services/supabase.ts             # 后端 service_role client
packages/frontend/plan/                               # 计划文件夹（本次新建）
```

### 修改文件

| 文件 | 变更内容 |
|------|---------|
| `packages/frontend/app/page.tsx` | **完全替换**：改为 Dashboard 页面（列表 + 操作） |
| `packages/frontend/app/layout.tsx` | 不改动 Server Component 结构，middleware 处理 cookie |
| `packages/frontend/components/HydroHeader.tsx` | 新增可选 props：`user?: {email:string}`、`onLogout?:()=>void`、`showNav?:boolean`；右侧显示邮箱 + 登出按钮 |
| `packages/backend/src/index.ts` | 新增 3 个端点：`POST /api/threads`、`PATCH /api/threads/:threadId`、`GET /api/threads`、`DELETE /api/threads/:threadId` |
| `packages/backend/package.json` | 添加 `@supabase/supabase-js` 依赖 |
| `packages/frontend/package.json` | 添加 `@supabase/supabase-js`、`@supabase/ssr` 依赖 |
| `packages/shared/src/index.ts` | 新增 `DocumentThreadRecord` 类型 |
| `.env.example` | 新增 Supabase 环境变量说明 |

---

## 四、环境变量（新增）

```bash
# .env（根目录）
SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...（anon/public key）
SUPABASE_SERVICE_ROLE_KEY=eyJ...（service_role key，仅后端使用，不能暴露到前端）
```

---

## 五、各文件详细实现说明

### `middleware.ts`
- 使用 `@supabase/ssr` 的 `createServerClient` + `next/headers` cookies
- `/login` 已登录 → 重定向 `/`
- `/`、`/generate`、`/generate/*` 未登录 → 重定向 `/login?redirectTo=<path>`
- `matcher: ['/', '/generate/:path*', '/login']`

### `lib/supabase/client.ts`
- `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`
- 模块级单例（`let client` 缓存）

### `lib/supabase/server.ts`
- `createServerClient` + `cookies()` from `next/headers`
- 用于 middleware 和 Server Components

### `hooks/useSupabaseUser.ts`
- `useState<User | null>`
- `onAuthStateChange` 订阅用户状态
- 暴露 `user`、`loading`、`signOut()` 三个值
- 模式与现有 `useGenerateStream` 保持一致（useCallback + useState）

### `app/login/page.tsx`（`"use client"`）
- 表单：邮箱 input + 密码 input + 提交按钮
- 调用 `supabase.auth.signInWithPassword()`
- 登录成功 → `router.push('/')` 或 `redirectTo` 参数中的地址
- 错误显示：沿用 `border border-gov-red/30 bg-gov-red/5 text-gov-red` 样式
- **UI 完全沿用现有 design token**：
  - 容器：`max-w-md mx-auto mt-20 rounded-hydro border border-slate-200 bg-white p-8`
  - input：`rounded-hydro border border-slate-200 px-3 py-2 w-full text-slate-800`
  - 按钮：`rounded-hydro bg-water-blue px-4 py-2 text-white w-full hover:opacity-90`

### `app/page.tsx`（Dashboard，`"use client"`）
- 使用 `useSupabaseUser` 获取当前用户
- 调用 `GET /api/threads?userId=<uid>` 获取历史列表
- 列表每行显示：
  - 公文类型 badge（`water-blue/10` 背景）
  - `raw_input_preview`（前 60 字）
  - `created_at` 格式化
  - 状态 badge：drafting=灰色、reviewing=橙色(`border-amber-400 bg-amber-50 text-amber-700`)、completed=绿色(`hydro-success` 系列)
  - 操作按钮：查看/恢复（`water-blue`）、删除（`text-gov-red hover:bg-gov-red/5`）
- 顶部："新建公文"按钮 → `router.push('/generate')`
- HydroHeader 传入 `user` + `onLogout`

### `app/generate/page.tsx`
- 将现有 `app/page.tsx` 完整逻辑迁移过来
- 新增：`startGenerate` 前调用 `POST /api/threads` 预注册
- 新增：SSE `done` 后调用 `PATCH /api/threads/:threadId` 更新 status/content
- HydroHeader 传入 `user` + `onLogout`

### `components/HydroHeader.tsx`
- 新增可选 props（保持后向兼容，现有调用无需改动）：
  ```ts
  user?: { email: string }
  onLogout?: () => void
  ```
- 右侧 `flex gap-4` 区域：有 `user` 时，在 `AgentStatusBadge` 前插入：
  - `<span className="text-sm text-slate-500">{user.email}</span>`
  - `<button className="rounded-hydro border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">登出</button>`

### `backend/src/services/supabase.ts`
- `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })`
- 模块级单例 `getSupabaseAdmin()`

### `backend/src/index.ts` 新增端点

```
POST /api/threads
  body: { threadId, userId, documentType, rawInput, status?, documentContent?, revisionCount? }
  → supabaseAdmin.from('document_threads').upsert({ thread_id: threadId, user_id: userId, ... })
  → { ok: true }

PATCH /api/threads/:threadId
  body: { status?, documentContent?, revisionCount?, needsHumanReview?, humanReviewReason? }
  → supabaseAdmin.from('document_threads').update({...}).eq('thread_id', threadId)
  → { ok: true }

GET /api/threads
  query: ?userId=<uuid>
  → supabaseAdmin.from('document_threads').select('id,thread_id,document_type,status,raw_input_preview,created_at,updated_at,needs_human_review').eq('user_id', userId).order('created_at', { ascending: false })
  → { threads: [...] }

DELETE /api/threads/:threadId
  → supabaseAdmin.from('document_threads').delete().eq('thread_id', threadId)
  → { ok: true }
```

### `packages/shared/src/index.ts` 新增类型

```ts
export interface DocumentThreadRecord {
  id: string;
  threadId: string;
  userId: string;
  documentType: WaterDocumentState["documentType"];
  status: "drafting" | "reviewing" | "completed";
  rawInput: string;
  rawInputPreview: string;
  documentContent: string | null;
  revisionCount: number;
  needsHumanReview: boolean;
  humanReviewReason: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 六、plan 文件夹

在项目根目录新建 `plan/` 文件夹，存放本次重构计划的 Markdown 文档：

```
plan/
└── 2026-04-14-auth-dashboard-refactor.md   # 本次重构计划归档
```

---

## 七、实现顺序

1. 新建 `plan/` 文件夹 + 归档计划文件
2. 安装依赖（`@supabase/supabase-js`、`@supabase/ssr`）
3. 更新 `packages/shared/src/index.ts`（新增 `DocumentThreadRecord`）
4. 新建 `backend/src/services/supabase.ts`，扩展 `backend/src/index.ts`（4 个端点）
5. 新建 `frontend/lib/supabase/client.ts` + `server.ts`
6. 新建 `frontend/middleware.ts`（路由保护）
7. 新建 `frontend/app/login/page.tsx`
8. 新建 `frontend/hooks/useSupabaseUser.ts`
9. 修改 `frontend/components/HydroHeader.tsx`（新增 user/logout props）
10. **迁移**：`app/page.tsx` → `app/generate/page.tsx`（+注册/更新 thread 逻辑）
11. **替换** `app/page.tsx` 为 Dashboard 页面

---

## 八、验证方式

1. `pnpm dev` 启动前后端
2. 访问 `http://localhost:3000` → 应跳转 `/login`
3. 登录后 → Dashboard（`/`），显示空历史列表
4. 点击"新建公文" → `/generate`，填写素材生成
5. 返回 Dashboard → 新记录出现，状态正确
6. 点击"查看/恢复" → 跳转 `/generate?threadId=xxx`，显示已有内容
7. 点击"删除" → 记录消失
8. 点击"登出" → 跳转 `/login`，再访问 `/` 重定向回 `/login`
9. 运行 `npx playwright test` → 现有 20 个测试全部通过（generate 路径改为 `/generate`）
