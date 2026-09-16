# wxq-lab — 万象棋房（多阶段构建）
# 用法：docker compose up -d --build   → http://localhost:8082

# ---------- 阶段一：编译前端 ----------
FROM node:22-bookworm-slim AS build
WORKDIR /src/ui
# 先装依赖（利用层缓存：package 变了才重装）
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY ui/ ./
# vite build.outDir = ../dist → /src/dist
RUN npm run build

# ---------- 阶段二：运行 ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=5177

# 服务端零第三方依赖（serve/update-service/fetch-meta 全用内置模块），无需 npm install
COPY scripts/serve.mjs scripts/update-service.mjs scripts/fetch-meta.mjs scripts/strength-survey.mjs scripts/update.sh ./scripts/
COPY --from=build /src/dist ./dist

# data/ 不打进镜像：含 API 密钥（.secrets.json）与每日快照，运行时挂载宿主机 ./data
VOLUME ["/app/data"]
EXPOSE 5177

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5177/__/meta-dirs >/dev/null 2>&1 || exit 1

CMD ["node", "scripts/serve.mjs"]
