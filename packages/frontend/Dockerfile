# HydroDocAI frontend. Build from repo root: docker build -f packages/frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... .
FROM crpi-5nqoro6hoopis4cp.cn-beijing.personal.cr.aliyuncs.com/capyexports/base-node:latest AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

USER root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

RUN corepack enable && corepack prepare pnpm@latest --activate \
  && pnpm install --frozen-lockfile \
  && pnpm build:frontend \
  && pnpm prune --prod

RUN chown -R node:node /app

FROM crpi-5nqoro6hoopis4cp.cn-beijing.personal.cr.aliyuncs.com/capyexports/base-node:latest AS runner
WORKDIR /app

USER root
COPY --from=builder --chown=node:node /app /app
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN chown -R node:node /app

USER node
WORKDIR /app/packages/frontend

EXPOSE 3000
CMD ["pnpm", "start"]
