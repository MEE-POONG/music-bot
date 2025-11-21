# 🎵 วิธีตั้งค่า Music Bot แบบหลายตัว

เอกสารนี้อธิบายวิธีการตั้งค่าระบบ Music Bot ที่รองรับหลายบอทพร้อมกัน โดยดึงข้อมูลจาก MongoDB Database

## 📋 สารบัญ

1. [ข้อกำหนดเบื้องต้น](#ข้อกำหนดเบื้องต้น)
2. [การสร้าง Discord Bot Application](#การสร้าง-discord-bot-application)
3. [การตั้งค่า Database](#การตั้งค่า-database)
4. [การเพิ่มข้อมูล Bot ลง Database](#การเพิ่มข้อมูล-bot-ลง-database)
5. [การ Deploy Commands](#การ-deploy-commands)
6. [การเริ่มใช้งาน](#การเริ่มใช้งาน)

---

## ข้อกำหนดเบื้องต้น

- Bun runtime (v1.0+)
- MongoDB instance (local หรือ cloud)
- Lavalink server (สำหรับเล่นเพลง)
- Discord Developer Account

---

## การสร้าง Discord Bot Application

### 1. สร้าง Application

1. ไปที่ [Discord Developer Portal](https://discord.com/developers/applications)
2. คลิก **New Application**
3. ตั้งชื่อ bot (เช่น "Music Bot #1")
4. คลิก **Create**

### 2. สร้าง Bot User

1. ไปที่แท็บ **Bot**
2. คลิก **Add Bot** → **Yes, do it!**
3. เปิดใช้งาน options ต่อไปนี้:
   - ✅ **PUBLIC BOT** (ถ้าต้องการให้คนอื่น invite ได้)
   - ✅ **PRESENCE INTENT**
   - ✅ **SERVER MEMBERS INTENT**
   - ✅ **MESSAGE CONTENT INTENT**

### 3. คัดลอกข้อมูลสำคัญ

#### Bot Token
1. ไปที่แท็บ **Bot**
2. คลิก **Reset Token** (หรือ **Copy** ถ้าเพิ่งสร้าง)
3. **เก็บ token ไว้ให้ปลอดภัย** - ห้ามแชร์กับใคร!

#### Application ID (Client ID)
1. ไปที่แท็บ **General Information**
2. คัดลอก **APPLICATION ID**

### 4. สร้าง Invite URL

1. ไปที่แท็บ **OAuth2** → **URL Generator**
2. เลือก **Scopes**:
   - ✅ `bot`
   - ✅ `applications.commands`
3. เลือก **Bot Permissions**:
   - ✅ Read Messages/View Channels
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Use External Emojis
   - ✅ Connect (Voice)
   - ✅ Speak (Voice)
   - ✅ Use Voice Activity
4. คัดลอก **GENERATED URL** ที่ด้านล่าง

**Permissions Integer:** `36719552` (สำหรับ music bot)

---

## การตั้งค่า Database

### 1. ตั้งค่า Environment Variables

สร้างไฟล์ `.env` จาก `.env.example`:

```bash
cp .env.example .env
```

แก้ไขไฟล์ `.env`:

```env
DATABASE_URL="mongodb://localhost:27017/music-bot"

LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false

APP_PORT=3000
```

### 2. Generate Prisma Client

```bash
bunx prisma generate
```

---

## การเพิ่มข้อมูล Bot ลง Database

### 1. สร้าง Seed Script

Copy template seed script:

```bash
cp prisma/seed-music-bots-example.ts prisma/seed-music-bots-custom.ts
```

### 2. แก้ไขข้อมูล Bot

เปิดไฟล์ `prisma/seed-music-bots-custom.ts` และแก้ไข:

```typescript
const musicBots = [
  {
    name: "Music Bot #1",
    clientId: "YOUR_CLIENT_ID_HERE",      // จาก Discord Developer Portal
    token: "YOUR_BOT_TOKEN_HERE",         // จาก Discord Developer Portal
    inviteUrl: "YOUR_GENERATED_URL_HERE", // OAuth2 URL ที่สร้างไว้
    maxGuilds: 100,
    description: "Music Bot หลัก",
    isActive: true
  },
  // เพิ่ม bot ตัวอื่นๆ ได้ที่นี่
  {
    name: "Music Bot #2",
    clientId: "CLIENT_ID_2",
    token: "TOKEN_2",
    inviteUrl: "INVITE_URL_2",
    maxGuilds: 100,
    description: "Music Bot สำรอง",
    isActive: true
  }
];
```

### 3. รัน Seed Script

```bash
bun run prisma/seed-music-bots-custom.ts
```

ผลลัพธ์:

```
🎵 เริ่มการ seed ข้อมูล Music Bots...

✅ สร้าง "Music Bot #1" สำเร็จ
   Client ID: 1234567890123456789
   Invite URL: https://discord.com/api/oauth2/authorize?...

✅ สร้าง "Music Bot #2" สำเร็จ
   Client ID: 9876543210987654321
   Invite URL: https://discord.com/api/oauth2/authorize?...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ สร้างสำเร็จ: 2 bot(s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## การ Deploy Commands

### Deploy Commands ให้ทุก Bots

```bash
bun run deploy:commands
```

### Deploy Commands ให้ Bot เฉพาะ

```bash
bun run deploy:commands [CLIENT_ID]
```

### Deploy Commands แบบ Guild-Specific (ทันที)

```bash
bun run deploy:commands [CLIENT_ID] [GUILD_ID]
```

**หมายเหตุ:**
- Global commands ใช้เวลา up to 1 ชั่วโมงในการอัปเดต
- Guild-specific commands อัปเดตทันที (เหมาะสำหรับ testing)

---

## การเริ่มใช้งาน

### 1. เริ่ม Lavalink Server

```bash
cd lavalink
java -jar Lavalink.jar
```

หรือใช้ Docker:

```bash
docker-compose up lavalink
```

### 2. เริ่ม Music Bot

Development mode:

```bash
bun run dev
```

Production mode:

```bash
bun run start
```

### 3. Invite Bots เข้า Discord Server

ใช้ Invite URL ที่ได้จาก seed script หรือดูจาก:

```bash
# API endpoint
curl http://localhost:3000/bots
```

---

## การจัดการ Bots

### ดูรายการ Bots ทั้งหมด

```bash
curl http://localhost:3000/bots
```

ตัวอย่างผลลัพธ์:

```json
{
  "bots": [
    {
      "name": "Music Bot #1",
      "clientId": "1234567890123456789",
      "guilds": 5,
      "users": 1250
    },
    {
      "name": "Music Bot #2",
      "clientId": "9876543210987654321",
      "guilds": 3,
      "users": 850
    }
  ]
}
```

### Clear Commands

Clear commands จากทุก bots:

```bash
bun run clear:commands
```

Clear commands จาก bot เฉพาะ:

```bash
bun run clear:commands [CLIENT_ID]
```

### ปิดการใช้งาน Bot

ใช้ MongoDB client หรือ admin panel:

```javascript
// ใช้ MongoDB Shell หรือ Compass
db.MusicBotDB.updateOne(
  { clientId: "YOUR_CLIENT_ID" },
  { $set: { isActive: false } }
)
```

---

## โครงสร้าง Database

### MusicBotDB Collection

```typescript
{
  _id: ObjectId,
  name: string,              // ชื่อ bot
  clientId: string,          // Discord Application ID
  token: string,             // Bot Token (เก็บไว้ปลอดภัย!)
  inviteUrl: string,         // OAuth2 Invite URL
  status: "AVAILABLE" | "ASSIGNED" | "FULL" | "OFFLINE",
  maxGuilds: number,         // จำนวน guild สูงสุด
  currentGuilds: number,     // จำนวน guild ปัจจุบัน
  description?: string,
  avatarUrl?: string,
  isActive: boolean,         // เปิด/ปิดใช้งาน
  createdAt: Date,
  updatedAt: Date
}
```

### ServerMusicBotDB Collection

```typescript
{
  _id: ObjectId,
  serverId: string,                    // Discord Guild ID
  musicBotId: ObjectId,                // อ้างอิงถึง MusicBotDB
  status: "PENDING_INVITE" | "ACTIVE" | "REMOVED" | "FAILED",
  invitedBy?: string,
  assignedAt: Date,
  activatedAt?: Date,
  removedAt?: Date
}
```

---

## เคล็ดลับและข้อควรระวัง

### ⚠️ ความปลอดภัย

1. **อย่า commit** ไฟล์ที่มี token เข้า git
2. ใช้ environment variables สำหรับข้อมูลสำคัญ
3. พิจารณาเข้ารหัส token ใน database (production)
4. ตั้งสิทธิ์ database ให้เหมาะสม

### 💡 Best Practices

1. **ใช้ Guild Commands สำหรับ Testing**
   - อัปเดตทันที
   - ไม่รบกวน production guilds

2. **Monitor Bot Status**
   - ตั้ง health check endpoint
   - ใช้ logging service

3. **Load Balancing**
   - กระจาย guilds ให้เท่าๆ กันระหว่าง bots
   - ตั้ง maxGuilds ให้เหมาะสม

4. **Backup**
   - Backup database เป็นประจำ
   - เก็บ bot tokens ใน secure vault

---

## Troubleshooting

### Bot ไม่เริ่มต้น

1. ตรวจสอบ `DATABASE_URL` ใน `.env`
2. ตรวจสอบว่า MongoDB ทำงานอยู่
3. ตรวจสอบ bot token ใน database

```bash
# ตรวจสอบ bots ใน database
bunx prisma studio
```

### Commands ไม่แสดงใน Discord

1. รอให้ global commands sync (up to 1 hour)
2. ลอง kick bot ออกแล้ว invite ใหม่
3. ใช้ guild commands แทน:

```bash
bun run deploy:commands [CLIENT_ID] [GUILD_ID]
```

### Lavalink Connection Failed

1. ตรวจสอบ Lavalink server ทำงานอยู่
2. ตรวจสอบ `LAVALINK_HOST` และ `LAVALINK_PASSWORD` ใน `.env`
3. ตรวจสอบ firewall settings

---

## การอัปเดต Schema

เมื่อมีการแก้ไข `schema.prisma`:

```bash
# Generate Prisma Client ใหม่
bunx prisma generate

# (Optional) สร้าง migration ถ้าใช้ relational database
bunx prisma migrate dev
```

---

## ทรัพยากรเพิ่มเติม

- [Discord.js Documentation](https://discord.js.org/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Lavalink Documentation](https://github.com/lavalink-devs/Lavalink)
- [MongoDB Documentation](https://www.mongodb.com/docs/)

---

## การสนับสนุน

หากพบปัญหาหรือมีคำถาม กรุณาเปิด issue ใน GitHub repository

