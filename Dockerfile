FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lockb tsconfig.json ./

RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
