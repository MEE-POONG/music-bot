# 🎵 Changelog: Multi-Bot Support Implementation

## สรุปการเปลี่ยนแปลง

ระบบ Music Bot ได้รับการอัปเกรดให้รองรับการทำงานหลาย bots พร้อมกัน โดยดึงข้อมูล `CLIENT_ID`, `TOKEN`, และ `GUILD_ID` จาก MongoDB Database

---

## 📋 ไฟล์ที่ถูกสร้าง/แก้ไข

### ✅ Schema Database

**ไฟล์:** `prisma/schema.prisma`

- ✨ **เพิ่ม**: ฟิลด์ `token` ใน `MusicBotDB` model
  ```prisma
  model MusicBotDB {
    ...
    token          String // Discord Bot Token
    ...
  }
  ```

### ✅ Database Layer

**ไฟล์:** `src/lib/database.ts` *(ใหม่)*

- ✨ Prisma Client singleton
- ✨ ฟังก์ชันจัดการข้อมูล bot:
  - `getActiveMusicBots()` - ดึง bots ที่เปิดใช้งาน
  - `getMusicBotByClientId()` - ดึง bot จาก client ID
  - `getMusicBotForGuild()` - ดึง bot ที่ assign ให้ guild
  - `updateBotGuildCount()` - อัปเดตจำนวน guilds
  - `activateBotInGuild()` - activate bot ใน guild

### ✅ Bot Manager

**ไฟล์:** `src/lib/botManager.ts` *(ใหม่)*

- ✨ `BotManager` class สำหรับจัดการหลาย bots:
  - `initialize()` - โหลดและเริ่ม bots จาก database
  - `getBotForGuild()` - ดึง bot instance สำหรับ guild
  - `getMusicServiceForGuild()` - ดึง music service สำหรับ guild
  - `shutdown()` - ปิด bots ทั้งหมดอย่างปลอดภัย
- ✨ Auto-detect guild join/leave และอัปเดต database
- ✨ Event listeners แยกต่างหากสำหรับแต่ละ bot

### ✅ Main Application

**ไฟล์:** `src/index.ts`

- 🔄 **แก้ไข**: ใช้ `BotManager` แทน single client
- ✨ รองรับหลาย bots ทำงานพร้อมกัน
- ✨ Setup interaction handlers สำหรับแต่ละ bot
- ✨ Graceful shutdown (SIGINT, SIGTERM)
- ✨ `/health` endpoint แสดงจำนวน active bots
- ✨ `/bots` endpoint แสดงสถานะทุก bots

### ✅ Command Scripts

**ไฟล์:** `src/scripts/deploy-commands.ts`

- 🔄 **แก้ไข**: รองรับ deploy commands ให้หลาย bots
- ✨ Deploy ทุก bots: `bun run deploy:commands`
- ✨ Deploy bot เฉพาะ: `bun run deploy:commands [CLIENT_ID]`
- ✨ Guild-specific: `bun run deploy:commands [CLIENT_ID] [GUILD_ID]`

**ไฟล์:** `src/scripts/clear-commands.ts`

- 🔄 **แก้ไข**: รองรับ clear commands จากหลาย bots
- ✨ Clear ทุก bots: `bun run clear:commands`
- ✨ Clear bot เฉพาะ: `bun run clear:commands [CLIENT_ID]`

### ✅ Seed Script

**ไฟล์:** `prisma/seed-music-bots-example.ts` *(ใหม่)*

- ✨ Template สำหรับเพิ่ม bots ลง database
- ✨ คำแนะนำการใช้งานแบบละเอียด
- ✨ Validation ป้องกันการใส่ข้อมูลผิดพลาด
- ✨ Auto-generate invite URLs

### ✅ Security

**ไฟล์:** `.gitignore`

- ✨ เพิ่ม ignore patterns:
  - `prisma/seed-music-bots-custom.ts`
  - `prisma/seed-*.custom.ts`

**ไฟล์:** `.env.example`

- ✨ เพิ่ม `DATABASE_URL`
- 🔄 ทำ `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` เป็น optional (ใช้สำหรับ dev/test เท่านั้น)

### ✅ Documentation

**ไฟล์:** `docs/SETUP_MULTI_BOTS.md` *(ใหม่)*

- ✨ คู่มือการตั้งค่าระบบแบบละเอียด
- ✨ วิธีสร้าง Discord Bot Application
- ✨ วิธีเพิ่ม bots ลง database
- ✨ Troubleshooting guide
- ✨ Security best practices

**ไฟล์:** `README.md`

- ✨ เพิ่มส่วน Multi-Bot Support
- ✨ Quick start guide
- ✨ ลิงก์ไปยัง documentation

**ไฟล์:** `package.json`

- ✨ เพิ่ม scripts:
  - `prisma:generate` - Generate Prisma Client
  - `prisma:studio` - เปิด Prisma Studio
  - `seed:bots` - รัน seed script

---

## 🗄️ Database Schema Changes

### MusicBotDB
```typescript
{
  // ... existing fields
  token: string              // ✨ ใหม่: Bot Token
}
```

### ServerMusicBotDB
```typescript
{
  serverId: string           // Discord Guild ID
  musicBotId: ObjectId       // → MusicBotDB
  status: string             // PENDING_INVITE | ACTIVE | REMOVED | FAILED
  activatedAt?: Date
  removedAt?: Date
}
```

---

## 📦 Dependencies Added

```json
{
  "@prisma/client": "5.22.0",
  "prisma": "5.22.0" // devDependencies
}
```

---

## 🚀 วิธีใช้งาน

### 1. Setup Database

```bash
# ตั้งค่า .env
echo 'DATABASE_URL="mongodb://localhost:27017/music-bot"' >> .env

# Generate Prisma Client
bunx prisma generate
```

### 2. เพิ่ม Bots ลง Database

```bash
# Copy template
cp prisma/seed-music-bots-example.ts prisma/seed-music-bots-custom.ts

# แก้ไขข้อมูล bot (CLIENT_ID, TOKEN, etc.)
# จากนั้นรัน:
bun run seed:bots
```

### 3. Deploy Commands

```bash
# Deploy ทุก bots
bun run deploy:commands

# หรือ deploy เฉพาะ bot
bun run deploy:commands YOUR_CLIENT_ID
```

### 4. Start Bot System

```bash
bun run dev
```

---

## 🔍 ตรวจสอบสถานะ

### Health Check
```bash
curl http://localhost:3000/health

# Response:
{
  "status": "ok",
  "uptime": 123.456,
  "activeBots": 2
}
```

### Bot Status
```bash
curl http://localhost:3000/bots

# Response:
{
  "bots": [
    {
      "name": "Music Bot #1",
      "clientId": "1234567890",
      "guilds": 5,
      "users": 1250
    },
    {
      "name": "Music Bot #2",
      "clientId": "0987654321",
      "guilds": 3,
      "users": 850
    }
  ]
}
```

### Prisma Studio
```bash
bun run prisma:studio
# เปิด http://localhost:5555
```

---

## ✨ Features ใหม่

1. **Multi-Bot Management**
   - รองรับหลาย Discord bots ทำงานพร้อมกัน
   - Auto-load bots จาก database
   - Dynamic bot assignment ต่อ guild

2. **Database-Driven Configuration**
   - เก็บ CLIENT_ID, TOKEN ใน database
   - ไม่ต้องใช้ environment variables สำหรับแต่ละ bot
   - Update configuration แบบ real-time (ไม่ต้อง restart)

3. **Auto Guild Management**
   - Auto-detect เมื่อ bot เข้า/ออก guild
   - อัปเดต guild count อัตโนมัติ
   - Track assignment status ใน database

4. **Enhanced Commands Management**
   - Deploy/Clear commands แบบ batch
   - Target specific bot หรือทุก bots
   - Guild-specific deployment support

5. **Monitoring & Health Checks**
   - `/health` endpoint
   - `/bots` endpoint สำหรับดูสถานะ
   - Graceful shutdown

---

## 🔒 Security Considerations

1. **Token Storage**
   - ⚠️ Tokens เก็บใน database (plaintext)
   - ✅ Seed scripts ที่มี token ถูก gitignore
   - 🔐 **แนะนำ**: ใช้ encryption สำหรับ production

2. **Access Control**
   - ตั้งสิทธิ์ database ให้เหมาะสม
   - ใช้ environment-specific credentials
   - Limit network access to database

3. **Best Practices**
   - อย่า commit tokens เข้า git
   - ใช้ .env files สำหรับ local dev
   - Use secret management services (production)

---

## 🐛 Known Issues & Limitations

1. **Token Encryption**
   - Tokens ยังไม่ได้เข้ารหัสใน database
   - Plan: ใช้ encryption library ใน future update

2. **Hot Reload**
   - เพิ่ม/ลบ bot ต้อง restart application
   - Plan: Implement hot reload mechanism

3. **Load Balancing**
   - ยังไม่มี automatic load balancing
   - ต้อง assign guilds manually ผ่าน invite

---

## 📚 เอกสารเพิ่มเติม

- [docs/SETUP_MULTI_BOTS.md](docs/SETUP_MULTI_BOTS.md) - คู่มือการตั้งค่าแบบละเอียด
- [prisma/schema.prisma](prisma/schema.prisma) - Database schema
- [prisma/seed-music-bots-example.ts](prisma/seed-music-bots-example.ts) - Seed script template

---

## 🎯 Next Steps

1. ✅ อ่านคู่มือใน `docs/SETUP_MULTI_BOTS.md`
2. ✅ Setup MongoDB และ .env
3. ✅ Generate Prisma Client
4. ✅ สร้าง seed script และเพิ่ม bots
5. ✅ Deploy commands
6. ✅ Start bot system
7. ✅ Invite bots เข้า Discord servers

---

**สร้างเมื่อ:** 2025-01-21  
**เวอร์ชัน:** 1.0.0  
**Status:** ✅ Complete

