import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandData } from "../discord/commands";
import { config } from "../config";
import { getActiveMusicBots, prisma } from "../lib/database";

/**
 * Deploy Slash Commands Script
 * 
 * วิธีใช้:
 * 1. Deploy ทุก bots:              bun run deploy:commands
 * 2. Deploy bot เฉพาะ (by clientId): bun run deploy:commands [CLIENT_ID]
 * 3. Deploy + เลือก guild:          bun run deploy:commands [CLIENT_ID] [GUILD_ID]
 * 
 * หมายเหตุ:
 * - ถ้าไม่ระบุ CLIENT_ID จะ deploy ให้ทุก bots ที่เปิดใช้งาน
 * - ถ้าระบุ GUILD_ID จะ deploy เฉพาะ guild นั้น (ทันที)
 * - ถ้าไม่ระบุ GUILD_ID จะ deploy แบบ global (ใช้เวลาถึง 1 ชม.)
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
  const botsToDeployTo = targetClientId
    ? activeBots.filter((bot) => bot.clientId === targetClientId)
    : activeBots;

  if (botsToDeployTo.length === 0) {
    console.error(`❌ ไม่พบ bot ที่มี Client ID: ${targetClientId}`);
    process.exit(1);
  }

  console.log(`📋 จะ deploy คำสั่ง ${commandData.length} รายการ ให้กับ ${botsToDeployTo.length} bot(s)\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const bot of botsToDeployTo) {
    try {
      console.log(`🔧 กำลัง deploy สำหรับ "${bot.name}" (${bot.clientId})...`);

      const rest = new REST({ version: "10" }).setToken(bot.token);

      let route;
      let scopeText: string;
      let successMessage: string;

      if (guildId) {
        // Deploy to specific guild
        route = Routes.applicationGuildCommands(bot.clientId, guildId);

        let guildName: string | null = null;
        try {
          const guild = (await rest.get(Routes.guild(guildId))) as {
            name?: string;
          };
          guildName = guild.name ?? null;
        } catch (error) {
          console.warn("   ⚠️  ไม่สามารถดึงชื่อ Guild ได้");
        }

        scopeText = `Guild (${guildName ?? guildId})`;
        successMessage = "คำสั่งพร้อมใช้งานทันที";
      } else {
        // Deploy globally
        route = Routes.applicationCommands(bot.clientId);
        scopeText = "Global (ทุก Guild)";
        successMessage = "คำสั่งจะพร้อมใช้งานภายใน 1 ชม.";
      }

      await rest.put(route, { body: commandData });

      console.log(`   ✅ สำเร็จ - ${scopeText} - ${successMessage}\n`);
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

main()
  .catch((error) => {
    console.error("❌ เกิดข้อผิดพลาด:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
