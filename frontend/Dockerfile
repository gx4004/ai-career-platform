FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ARG VITE_AUTOPILOT_EXPERIMENT_ENABLED
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTOPILOT_EXPERIMENT_ENABLED=$VITE_AUTOPILOT_EXPERIMENT_ENABLED
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY --from=build --chown=node:node /app/dist dist
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/serve.mjs serve.mjs
EXPOSE 3000
ENV PORT=3000
USER node
CMD ["node", "serve.mjs"]
