# Docker 与 .env 配置说明

按照 [base-docker-manager](.cursor/rules/base-docker-manager.mdc)、[demo-apps-howto](.cursor/rules/demo-apps-howto.mdc)、[use-base-node-image](.cursor/rules/use-base-node-image.mdc) 的打包规则，**.env 不得进入镜像、不得硬编码密码**，由部署侧在构建/运行时注入。

---

## 1. 原则

| 规则 | 要求 |
|------|------|
| base-docker-manager | 严禁硬编码密码；敏感信息一律使用 Organization secrets 或运行时注入。 |
| demo-apps-howto | 镜像可构建、端口与约定一致；环境由集成方在 Compose/Nginx 侧配置。 |
| 本仓库 | .env 不提交（已 .gitignore）、不 COPY 进 Dockerfile（已 .dockerignore）。 |

**结论**：镜像内不包含 `.env`；本地开发用 `.env`（不提交），Docker/Compose 通过 **env_file** 或 **environment** / **build args** 注入。

---

## 2. 环境变量一览

### 2.1 后端（运行时）

在 **运行时** 注入（如 `docker-compose` 的 `env_file` 或 `environment`），不要写进 Dockerfile。

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| API_KEY | 是 | LLM 调用密钥（如 SiliconFlow） | 由部署侧保管，不写入镜像 |
| PORT | 否 | 服务端口，默认 4001 | 4001 |
| CORS_ORIGIN | 否 | 允许的前端来源（生产建议设置） | https://your-app.domain |
| SILICONFLOW_BASE_URL | 否 | LLM API 地址，默认硅基流动 | https://api.siliconflow.cn/v1 |
| LLM_MODEL | 否 | 模型名，默认 Qwen/Qwen3-8B | Qwen/Qwen3-8B |

后端会从 `process.env` 读取；若使用 `loadEnvFile`，仅用于本地开发，**镜像内不放置 .env 文件**，由容器运行时环境提供上述变量。

### 2.2 前端（构建时）

Next.js 的 `NEXT_PUBLIC_*` 在 **构建时** 打入产物，需在 **docker build** 阶段通过 **ARG** 传入，或在 CI 中通过 build 环境变量传入。

| 变量 | 说明 | 示例 |
|------|------|------|
| NEXT_PUBLIC_API_URL | 后端 API 根地址（浏览器请求用） | http://backend:4001 或 https://api.yourdomain.com |

构建示例（多阶段 Dockerfile 中）：

```dockerfile
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm build
```

或 CI 中：`NEXT_PUBLIC_API_URL=https://api.yourdomain.com pnpm build`。

---

## 3. 部署侧如何提供 .env

### 3.1 本地 / 演示栈（docker-compose）

- **后端**：在宿主机维护 `.env` 文件（不提交），Compose 通过 `env_file` 或 `environment` 注入：

```yaml
services:
  hydrodocai-backend:
    image: your-registry/hydrodocai-backend:latest
    env_file: .env   # 或 path/to/.env，仅宿主机存在
    # 或显式写敏感项用 secrets / environment，不写进镜像
    environment:
      - PORT=4001
      - CORS_ORIGIN=https://your-frontend.domain
    # 敏感值建议用 secrets 或 env_file，不要硬编码
```

- **前端**：构建时传入 `NEXT_PUBLIC_API_URL`（build args 或 CI 环境变量），见上文。

### 3.2 CI/CD（如 GitHub Actions）

- **构建镜像**：不把 .env 打进镜像；如需在 CI 中构建前端，用 **Organization / Repository secrets** 或 **Variables** 提供 `NEXT_PUBLIC_API_URL` 和任何 build-time 变量，在 workflow 中设为 `env` 再执行 `pnpm build`。
- **推送镜像**：ACR 等凭据使用 **Organization secrets**（如 base-docker-manager 中的 `ACR_USERNAME`、`ACR_PASSWORD`、`ACR_NAMESPACE`），不在 workflow 中写死。

### 3.3 本仓库提供的模板

- 根目录 **`.env.example`**：列出所有变量名与说明，无真实密钥。部署时复制为 `.env` 并填写，仅用于本地或宿主机，不提交、不 COPY 进镜像。
- **`.dockerignore`**：已排除 `.env`、`.env.*`，确保 `docker build` 时不会把 .env 打进镜像。

---

## 4. 检查清单

| 项目 | 要求 |
|------|------|
| .env | 不提交（.gitignore）、不 COPY 进 Dockerfile、不在 Dockerfile 中写死密钥 |
| .env.example | 已提供，仅键名与说明，无真实值 |
| .dockerignore | 已排除 .env、.env.*，避免构建上下文带入 |
| 后端配置 | 运行时通过 env_file / environment / secrets 注入 |
| 前端配置 | 构建时通过 ARG 或 CI env 传入 NEXT_PUBLIC_API_URL |
| 敏感信息 | 使用 Organization/Repo secrets 或部署侧 env_file，严禁硬编码 |

按上述方式即可在满足三条打包规则的前提下，统一、安全地处理本项目的 .env 配置。

---

## 5. 服务器部署时如何使用 .env

在服务器上 **.env 只存在于宿主机**，不放进镜像、不提交到 Git。按部署方式二选一即可。

### 5.1 直接部署（非 Docker）

在服务器上克隆仓库、构建后，用 Node 直接跑后端、Next 直接跑前端时：

1. **在服务器上创建 .env**
   - 将仓库里的 `.env.example` 复制为 `.env`（或从本机 scp 已填好的 `.env`）：
     ```bash
     cd /path/to/HydroDocAI
     cp .env.example .env
     ```
   - 用编辑器填写 `API_KEY`、`PORT`、`CORS_ORIGIN` 等，保存。

2. **.env 放在哪、后端才能读到**
   - 后端会按 **当前工作目录** 读：先读 `./.env`，若还没有 `API_KEY` 再读 `../../.env`。
   - 因此任选其一即可：
     - **方式 A**：在 **仓库根** 放一份 `.env`，从根或从 `packages/backend` 启动后端都会读到。
     - **方式 B**：只在 **`packages/backend`** 下放一份 `.env`，启动时 `cd packages/backend` 再执行 `node dist/index.js`（或 `pnpm start`）。

3. **启动示例**
   ```bash
   # 在仓库根
   pnpm build:backend
   cd packages/backend
   node dist/index.js
   ```
   此时若 `.env` 在仓库根或 `packages/backend` 下，且含 `API_KEY`，后端即可正常用。

4. **前端**：若也在同一台机用 `next start`，构建时需带上后端地址，例如：
   ```bash
   NEXT_PUBLIC_API_URL=http://服务器IP:4001 pnpm build:frontend
   cd packages/frontend && pnpm start
   ```
   `.env` 里如有 `NEXT_PUBLIC_API_URL`，需在 **构建前** 设置好（Next 会在 build 时把该值打进前端资源）。

5. **权限建议**：`chmod 600 .env`，避免被其他用户读取。

### 5.2 Docker / Docker Compose 部署

使用镜像 + Compose 时，**.env 只放在服务器上**，通过 Compose 注入容器，不 COPY 进镜像。

1. **在服务器上创建 .env**
   - 在 **运行 docker-compose 的目录**（例如 `/opt/demos/` 或项目目录）创建 `.env`：
     ```bash
     cd /opt/demos   # 或你的 compose 所在目录
     cp /path/to/HydroDocAI/.env.example .env
     # 编辑 .env，填写 API_KEY、CORS_ORIGIN 等
     chmod 600 .env
     ```

2. **在 docker-compose.yml 中引用**
   ```yaml
   services:
     hydrodocai-backend:
       image: your-registry/hydrodocai-backend:latest
       env_file: .env   # 相对当前 compose 所在目录的 .env
       environment:
         - PORT=4001
       # ...
   ```
   容器内没有 .env 文件，变量由 Compose 从宿主机的 `.env` 注入，符合「不把 .env 打进镜像」的规则。

3. **若 .env 不在 compose 同目录**
   - 使用绝对路径或相对路径均可，例如：`env_file: /opt/secrets/hydrodocai.env`。

4. **前端**：`NEXT_PUBLIC_API_URL` 在 **构建镜像时** 用 `ARG` 传入（见第 2 节），运行时不需要在服务器 .env 里再写一份给前端容器；若用宿主机构建再 COPY 进镜像，则在构建前在宿主机环境或 CI 中设置该变量即可。

### 5.3 小结

| 部署方式 | .env 放在哪 | 如何生效 |
|----------|-------------|----------|
| 直接跑 Node | 仓库根或 `packages/backend/` | 后端按 cwd 自动读 `.env` 和 `../../.env` |
| Docker Compose | 宿主机（compose 所在目录或指定路径） | `env_file: .env` 注入容器，不放进镜像 |

无论哪种方式，**.env 仅存在于服务器本地**，不提交、不随镜像分发；密钥只填在服务器上的 .env 中即可。
