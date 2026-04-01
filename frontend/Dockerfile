FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/dist dist
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/serve.mjs serve.mjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "serve.mjs"]
