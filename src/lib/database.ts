import { PrismaClient } from "@prisma/client";

// Singleton pattern สำหรับ Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ฟังก์ชันสำหรับดึงข้อมูล Music Bots ที่เปิดใช้งาน
export async function getActiveMusicBots() {
  return await prisma.musicBotDB.findMany({
    where: {
      isActive: true
    },
    include: {
      ServerMusicBot: {
        where: {
          status: "ACTIVE"
        }
      }
    }
  });
}

// ฟังก์ชันสำหรับดึงข้อมูล Bot ตาม Client ID
export async function getMusicBotByClientId(clientId: string) {
  return await prisma.musicBotDB.findUnique({
    where: {
      clientId
    },
    include: {
      ServerMusicBot: true
    }
  });
}

// ฟังก์ชันสำหรับดึง Bot ที่ assign ให้กับ Guild ID
export async function getMusicBotForGuild(guildId: string) {
  const assignment = await prisma.serverMusicBotDB.findFirst({
    where: {
      serverId: guildId,
      status: "ACTIVE"
    },
    include: {
      musicBot: true
    },
    orderBy: {
      activatedAt: "desc"
    }
  });

  return assignment?.musicBot ?? null;
}

// ฟังก์ชันสำหรับอัพเดตจำนวน guilds ปัจจุบัน
export async function updateBotGuildCount(clientId: string, count: number) {
  return await prisma.musicBotDB.update({
    where: {
      clientId
    },
    data: {
      currentGuilds: count
    }
  });
}

// ฟังก์ชันสำหรับ activate bot ใน guild
export async function activateBotInGuild(guildId: string, clientId: string) {
  const bot = await prisma.musicBotDB.findUnique({
    where: { clientId }
  });

  if (!bot) {
    throw new Error(`Bot with clientId ${clientId} not found`);
  }

  // ตรวจสอบว่ามี assignment อยู่แล้วหรือไม่
  const existing = await prisma.serverMusicBotDB.findFirst({
    where: {
      serverId: guildId,
      musicBotId: bot.id
    }
  });

  if (existing) {
    // อัพเดตสถานะเป็น ACTIVE
    return await prisma.serverMusicBotDB.update({
      where: {
        id: existing.id
      },
      data: {
        status: "ACTIVE",
        activatedAt: new Date()
      }
    });
  }

  // สร้าง assignment ใหม่
  return await prisma.serverMusicBotDB.create({
    data: {
      serverId: guildId,
      musicBotId: bot.id,
      status: "ACTIVE",
      activatedAt: new Date()
    }
  });
}

