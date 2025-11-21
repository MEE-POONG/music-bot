## Discord Music Bot (Elysia + Shoukaku + Lavalink)

This project bundles a simple HTTP control plane built with [Elysia](https://elysiajs.com/) on Bun, a Discord music bot powered by [Shoukaku](https://github.com/Deivu/Shoukaku), and a self-hosted [Lavalink](https://github.com/lavalink-devs/Lavalink) server running via Docker Compose.

### Features
- Minimal REST API (`/music` namespace) to play, skip, stop, and inspect the queue
- Discord voice playback backed by Lavalink v4 พร้อม Slash Commands (`/play`, `/skip`, `/stop`, `/queue`)
- Music Dashboard สวยงามบน Discord: แสดง Embed สถานะเพลงพร้อมปุ่มควบคุม (Pause/Resume, Skip, Stop, Refresh)
- ระบบ Autoplay อัจฉริยะ เลือกเพลงต่ออัตโนมัติตามแนวเพลงกว่า 20 หมวด พร้อมตัวกรองคุณภาพและ fallback อัตโนมัติ
- Docker Compose environment that boots both the bot (Bun image) and Lavalink (Java 17+)
- TypeScript-first project structure with strict runtime configuration validation

### Prerequisites
1. [Install Bun](https://bun.sh/docs/installation) `>= 1.0` on your host (optional if you only run via Docker).
2. Create a Discord application & bot, then enable the **MESSAGE CONTENT INTENT** and invite the bot to your server.
3. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DJ_ROLE_IDS` (optionallyกำหนด role ที่ถือสิทธิ์ DJ เพิ่มเติม แยกด้วยคอมมา)
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

### Multi-Bot Support 🤖

ระบบรองรับการทำงานหลาย Discord bots พร้อมกัน โดยดึงข้อมูล `CLIENT_ID`, `TOKEN`, และ `GUILD_ID` จาก MongoDB Database

#### Database Models
- **MusicBotDB** - เก็บข้อมูล Music Bot แต่ละตัว (clientId, token, status, maxGuilds)
- **ServerMusicBotDB** - Junction table เชื่อม Guild กับ Bot (serverId, musicBotId, status)

#### Setup Multi-Bot System

1. **Setup MongoDB**
```bash
# ใน .env
DATABASE_URL="mongodb://localhost:27017/music-bot"
```

2. **Generate Prisma Client**
```bash
bunx prisma generate
```

3. **Add Bots to Database**
```bash
# Copy template และแก้ไขข้อมูล
cp prisma/seed-music-bots-example.ts prisma/seed-music-bots-custom.ts

# แก้ไข CLIENT_ID และ TOKEN ใน seed file
# จากนั้นรัน:
bun run prisma/seed-music-bots-custom.ts
```

4. **Deploy Commands ให้ทุก Bots**
```bash
bun run deploy:commands                    # Deploy ทุก bots
bun run deploy:commands [CLIENT_ID]        # Deploy bot เฉพาะ
bun run deploy:commands [CLIENT_ID] [GUILD_ID]  # Guild-specific
```

5. **Start Bot System**
```bash
bun run dev
```

ดูคู่มือละเอียดได้ที่: **[docs/SETUP_MULTI_BOTS.md](docs/SETUP_MULTI_BOTS.md)**

### Notes
- Lavalink requires outbound internet connectivity to fetch tracks from sources (YouTube, etc.).
- For production deployment, consider tightening the Lavalink password, running the HTTP API behind authentication, and persisting Lavalink logs/metrics.
- หากปรับแก้คำสั่ง Slash ให้รัน `bun run deploy:commands` อีกครั้งเพื่ออัปเดตคำสั่งบน Discord
- 🔒 **Security**: อย่า commit ไฟล์ `seed-music-bots-custom.ts` ที่มี token จริงเข้า git!
