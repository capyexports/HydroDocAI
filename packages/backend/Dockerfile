# HydroDocAI backend. Build from repo root: docker build -f packages/backend/Dockerfile .
# FROM base-node per demo-apps-howto & use-base-node-image; push target ACR Shanghai per base-docker-manager.
FROM crpi-5nqoro6hoopis4cp.cn-beijing.personal.cr.aliyuncs.com/capyexports/base-node:latest AS builder
WORKDIR /app

USER root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared packages/shared
COPY packages/backend packages/backend
COPY data data

RUN corepack enable && corepack prepare pnpm@latest --activate \
  && pnpm install --frozen-lockfile \
  && pnpm build:backend \
  && pnpm prune --prod

RUN chown -R node:node /app

FROM crpi-5nqoro6hoopis4cp.cn-beijing.personal.cr.aliyuncs.com/capyexports/base-node:latest AS runner
WORKDIR /app

USER root
COPY --from=builder --chown=node:node /app /app

USER node
WORKDIR /app/packages/backend

EXPOSE 4001
CMD ["node", "dist/index.js"]
