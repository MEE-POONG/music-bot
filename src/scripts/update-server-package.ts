import "dotenv/config";
import { prisma } from "../lib/database";

/**
 * Script สำหรับอัพเดต Package Settings ของ Server
 * 
 * วิธีใช้:
 * bun run src/scripts/update-server-package.ts <GUILD_ID> <MAX_BOTS> <DAYS>
 * 
 * ตัวอย่าง:
 * bun run src/scripts/update-server-package.ts 1170370117708828712 3 30
 * 
 * หรือใช้ผ่าน npm script:
 * bun run package:update 1170370117708828712 3 30
 */

async function main() {
  const guildId = process.argv[2];
  const maxBots = parseInt(process.argv[3] || "1");
  const days = parseInt(process.argv[4] || "30");

  if (!guildId) {
    console.error("❌ กรุณาระบุ Guild ID");
    console.log("\nวิธีใช้:");
    console.log("  bun run src/scripts/update-server-package.ts <GUILD_ID> <MAX_BOTS> <DAYS>");
    console.log("\nตัวอย่าง:");
    console.log("  bun run src/scripts/update-server-package.ts 1170370117708828712 3 30");
    process.exit(1);
  }

  console.log("📦 กำลังอัพเดต Package Settings...");
  console.log(`   Guild ID: ${guildId}`);
  console.log(`   จำนวน Music Bots สูงสุด: ${maxBots}`);
  console.log(`   เพิ่มวันหมดอายุ: ${days} วัน\n`);

  try {
    // คำนวณวันหมดอายุใหม่
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + days);

    // อัพเดตหรือสร้าง server record
    const server = await prisma.serverDB.upsert({
      where: {
        serverId: guildId
      },
      update: {
        maxMusicBots: maxBots,
        openUntilAt: newExpiryDate,
        updatedAt: new Date()
      },
      create: {
        serverId: guildId,
        serverName: `Guild ${guildId}`,
        ownerId: "system",
        maxMusicBots: maxBots,
        openUntilAt: newExpiryDate,
        Master: false,
        openBot: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log("✅ อัพเดตสำเร็จ!");
    console.log(`   Server: ${server.serverName}`);
    console.log(`   จำนวน Music Bots สูงสุด: ${server.maxMusicBots}`);
    console.log(`   หมดอายุวันที่: ${server.openUntilAt.toLocaleString("th-TH")}`);
    console.log("\n💡 Bot ที่เข้า guild นี้จะถูกตรวจสอบอัตโนมัติ");
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาด:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

