## Discord Music Bot (Elysia + Shoukaku + Lavalink)

This project bundles a simple HTTP control plane built with [Elysia](https://elysiajs.com/) on Bun, a Discord music bot powered by [Shoukaku](https://github.com/Deivu/Shoukaku), and a self-hosted [Lavalink](https://github.com/lavalink-devs/Lavalink) server running via Docker Compose.

### Features
- Minimal REST API (`/music` namespace) to play, skip, stop, and inspect the queue
- Discord voice playback backed by Lavalink v4 พร้อม Slash Commands (`/play`, `/skip`, `/stop`, `/queue`)
- Music Dashboard สวยงามบน Discord: แสดง Embed สถานะเพลงพร้อมปุ่มควบคุม (Pause/Resume, Skip, Stop, Refresh)
- Docker Compose environment that boots both the bot (Bun image) and Lavalink (Java 17+)
- TypeScript-first project structure with strict runtime configuration validation

### Prerequisites
1. [Install Bun](https://bun.sh/docs/installation) `>= 1.0` on your host (optional if you only run via Docker).
2. Create a Discord application & bot, then enable the **MESSAGE CONTENT INTENT** and invite the bot to your server.
3. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - Optionally override Lavalink host/port/password if you need custom values.

#### Deploy slash commands
```bash
bun run deploy:commands
```
หากตั้งค่า `DISCORD_GUILD_ID` จะลงทะเบียนคำสั่งเฉพาะในกิลด์ (มีผลทันที) หากไม่ตั้งค่าจะเป็น Global (อาจใช้เวลาราว 1 ชั่วโมงให้คำสั่งปรากฏ)

หากต้องการลบคำสั่ง Slash ทั้งหมด:
```bash
bun run clear:commands
```
คำสั่งนี้จะลบทั้งใน Guild ที่ตั้งค่าไว้ (`DISCORD_GUILD_ID`) และคำสั่ง Global

### Local development (Bun)
```bash
cp .env.example .env
bun install
bun run src/index.ts
```

The HTTP API is available at `http://localhost:3000` by default.

#### Example requests
- `POST /music/play` body:
  ```json
  {
    "guildId": "1234567890",
    "channelId": "0987654321",
    "query": "yoasobi idol",
    "requester": "your-name"
  }
  ```
- `POST /music/skip` body:
  ```json
  { "guildId": "1234567890" }
  ```
- `POST /music/stop` body:
  ```json
  { "guildId": "1234567890" }
  ```
- `GET /music/queue/{guildId}`

### Docker Compose
The stack uses the official Bun image for the app and the Lavalink v4 container (Java 17 LTS).

```bash
cp .env.example .env
docker compose up --build
```

Compose exposes:
- Bot HTTP interface on `${APP_PORT:-3000}`
- Lavalink WS+REST on `2333`

Stop the stack with `docker compose down`.

### Project structure
- `src/index.ts` – boots Discord client, Elysia server, and wires REST routes.
- `src/discord/client.ts` – Discord.js client factory with required intents.
- `src/services/musicService.ts` – Shoukaku integration (queue + playback helpers).
- `src/routes/music.ts` – REST endpoints for controlling playback.
- `lavalink/application.yml` – Lavalink server configuration mounted in Docker.

### Notes
- Lavalink requires outbound internet connectivity to fetch tracks from sources (YouTube, etc.).
- For production deployment, consider tightening the Lavalink password, running the HTTP API behind authentication, and persisting Lavalink logs/metrics.
- หากปรับแก้คำสั่ง Slash ให้รัน `bun run deploy:commands` อีกครั้งเพื่ออัปเดตคำสั่งบน Discord
