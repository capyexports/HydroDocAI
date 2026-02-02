# Docker 构建与 GitHub Actions 推送

按照 [base-docker-manager](.cursor/rules/base-docker-manager.mdc)、[demo-apps-howto](.cursor/rules/demo-apps-howto.mdc)、[use-base-node-image](.cursor/rules/use-base-node-image.mdc) 编写 Dockerfile 与 GitHub Actions，将镜像推送到阿里云 ACR 上海。

---

## 1. Dockerfile 位置与构建方式

| 镜像 | Dockerfile | 构建命令（仓库根执行） |
|------|------------|------------------------|
| 后端 | `packages/backend/Dockerfile` | `docker build -f packages/backend/Dockerfile .` |
| 前端 | `packages/frontend/Dockerfile` | `docker build -f packages/frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL=<后端地址> .` |

- **构建上下文**：必须在**仓库根**执行，以便 COPY 到 `packages/`、`data/`、`pnpm-lock.yaml` 等。
- **Base 镜像**：均使用 ACR 北京个人版 `capyexports/base-node:latest`（demo-apps-howto / use-base-node-image）。
- **推送目标**：阿里云 ACR 上海 `registry.cn-shanghai.aliyuncs.com`（base-docker-manager）。

---

## 2. 本地构建示例

```bash
# 后端（无需 build-arg）
docker build -f packages/backend/Dockerfile -t hydrodocai-backend:local .

# 前端（需传入后端 API 地址，构建时打入前端）
docker build -f packages/frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:4001 \
  -t hydrodocai-frontend:local .
```

运行后端时需通过 `env_file` 或 `environment` 注入 `API_KEY` 等，见 [Docker 与 .env 配置](docker-env-config.md)。

---

## 3. GitHub Actions 流水线

- **工作流文件**：`.github/workflows/docker-push.yml`
- **触发条件**：`master` / `main` 分支上 **Dockerfile** 或 **.github/workflows/** 变更时触发；也可手动 `workflow_dispatch`。
- **逻辑**：登录 ACR 上海 → 构建 backend 与 frontend → 打标签 `:latest` 和 `:YYYYMMDD` → 推送 → `docker image prune -f`。

### 3.1 所需 Secrets（严禁硬编码）

在 **Repository secrets** 或 **Organization secrets** 中配置，并为该仓库授予访问权限：

| Secret | 说明 |
|--------|------|
| `ACR_USERNAME` | 阿里云 ACR 上海登录用户名 |
| `ACR_PASSWORD` | 阿里云 ACR 上海登录密码 |
| `ACR_NAMESPACE` | ACR 命名空间（镜像路径为 `$REGISTRY/$ACR_NAMESPACE/hydrodocai-backend`） |

推送后的镜像示例：

- `registry.cn-shanghai.aliyuncs.com/<ACR_NAMESPACE>/hydrodocai-backend:latest`
- `registry.cn-shanghai.aliyuncs.com/<ACR_NAMESPACE>/hydrodocai-backend:20260131`
- `registry.cn-shanghai.aliyuncs.com/<ACR_NAMESPACE>/hydrodocai-frontend:latest`
- `registry.cn-shanghai.aliyuncs.com/<ACR_NAMESPACE>/hydrodocai-frontend:20260131`

### 3.2 前端构建时的 NEXT_PUBLIC_API_URL

当前 workflow 中前端构建**未**传入 `NEXT_PUBLIC_API_URL`，构建出的前端会使用运行时默认（如 `getApiUrl()` 的 fallback）。若需在 CI 中写死后端地址，可在 workflow 中为 `docker/build-push-action` 增加 `build-args`：

```yaml
with:
  build-args: |
    NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL }}
```

并在仓库 Variables 中配置 `NEXT_PUBLIC_API_URL`（或使用 Secrets，视是否敏感而定）。

---

## 4. 与演示栈集成（demo-apps-howto）

- **建议服务名**：`hydrodocai-backend`、`hydrodocai-frontend`
- **监听端口**：后端 4001，前端 3000
- **建议路径前缀**：如 `/hydrodocai/`（前端）、`/hydrodocai-api/`（后端）
- 在演示栈 `docker-compose.yml` 中拉取上述镜像，使用 `env_file` 注入后端环境变量，并设置 **logging: driver, options: max-size: 20m**（base-docker-manager 40GB 磁盘约束）。

详见 [Docker 与 .env 配置](docker-env-config.md) 与 [Monorepo 前后端分离部署](monorepo-separate-deployment.md)。
