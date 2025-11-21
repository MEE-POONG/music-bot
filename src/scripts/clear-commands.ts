import "dotenv/config";
import { REST, Routes } from "discord.js";
import { config } from "../config";
import { getActiveMusicBots, prisma } from "../lib/database";

/**
 * Clear Slash Commands Script
 * 
 * วิธีใช้:
 * 1. Clear ทุก bots:                bun run clear:commands
 * 2. Clear bot เฉพาะ (by clientId):  bun run clear:commands [CLIENT_ID]
 * 3. Clear + เลือก guild:            bun run clear:commands [CLIENT_ID] [GUILD_ID]
 * 
 * หมายเหตุ:
 * - ถ้าไม่ระบุ CLIENT_ID จะ clear ทุก bots ที่เปิดใช้งาน
 * - ถ้าระบุ GUILD_ID จะ clear เฉพาะ guild นั้น
 * - ถ้าไม่ระบุ GUILD_ID จะ clear commands แบบ global
 */

async function main() {
  const targetClientId = process.argv[2];
  const guildId = process.argv[3] || config.DISCORD_GUILD_ID;

  console.log("🤖 กำลังโหลดข้อมูล Music Bots จาก database...\n");

  const activeBots = await getActiveMusicBots();

  if (activeBots.length === 0) {
    console.error("❌ ไม่พบ Music Bot ที่เปิดใช้งาน");
    console.error("   กรุณาเพิ่มข้อมูล bot ด้วย seed script ก่อน");
    process.exit(1);
  }

  // Filter bots ถ้าระบุ clientId
  const botsToClearFrom = targetClientId
    ? activeBots.filter((bot) => bot.clientId === targetClientId)
    : activeBots;

  if (botsToClearFrom.length === 0) {
    console.error(`❌ ไม่พบ bot ที่มี Client ID: ${targetClientId}`);
    process.exit(1);
  }

  console.log(`📋 จะ clear คำสั่งจาก ${botsToClearFrom.length} bot(s)\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const bot of botsToClearFrom) {
    try {
      console.log(`🔧 กำลัง clear คำสั่งสำหรับ "${bot.name}" (${bot.clientId})...`);

      const rest = new REST({ version: "10" }).setToken(bot.token);

      if (guildId) {
        await clearGuildCommands(rest, bot.clientId, guildId);
      } else {
        await clearGlobalCommands(rest, bot.clientId);
      }

      console.log(`   ✅ สำเร็จ\n`);
      successCount++;
    } catch (error) {
      console.error(`   ❌ ล้มเหลว: ${error}\n`);
      errorCount++;
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ สำเร็จ: ${successCount} bot(s)`);
  if (errorCount > 0) {
    console.log(`❌ ล้มเหลว: ${errorCount} bot(s)`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

async function clearGuildCommands(
  rest: REST,
  clientId: string,
  guildId: string
) {
  let guildName: string | null = null;
  try {
    const guild = (await rest.get(Routes.guild(guildId))) as {
      name?: string;
    };
    guildName = guild.name ?? null;
  } catch (error) {
    console.warn("   ⚠️  ไม่สามารถดึงชื่อ Guild ได้");
  }

  const scopeText = `Guild (${guildName ?? guildId})`;
  console.log(`   กำลังลบคำสั่งใน ${scopeText}...`);

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: []
  });
}

async function clearGlobalCommands(rest: REST, clientId: string) {
  console.log("   กำลังลบคำสั่งระดับ Global...");

  await rest.put(Routes.applicationCommands(clientId), {
    body: []
  });
}

main()
  .catch((error) => {
    console.error("❌ เกิดข้อผิดพลาด:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
