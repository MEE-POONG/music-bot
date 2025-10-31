import "dotenv/config";
import { REST, Routes } from "discord.js";
import { config } from "../config";

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

async function main() {
  await clearGuildCommands();
  await clearGlobalCommands();
}

async function clearGuildCommands() {
  if (!config.DISCORD_GUILD_ID) {
    console.log("ข้ามการลบคำสั่งใน Guild (ไม่ได้ตั้งค่า DISCORD_GUILD_ID)");
    return;
  }

  let guildName: string | null = null;
  try {
    const guild = (await rest.get(Routes.guild(config.DISCORD_GUILD_ID))) as {
      name?: string;
    };
    guildName = guild.name ?? null;
  } catch (error) {
    console.warn(
      "ไม่สามารถดึงชื่อ Guild ได้ จะใช้เฉพาะ ID ในข้อความ",
      error
    );
  }

  const scopeText = `Guild (${guildName ?? config.DISCORD_GUILD_ID})`;
  console.log(`กำลังลบคำสั่ง Slash ใน ${scopeText}...`);

  await rest.put(
    Routes.applicationGuildCommands(
      config.DISCORD_CLIENT_ID,
      config.DISCORD_GUILD_ID
    ),
    { body: [] }
  );

  console.log(`ลบคำสั่ง Slash ใน ${scopeText} เรียบร้อย`);
}

async function clearGlobalCommands() {
  console.log("กำลังลบคำสั่ง Slash ระดับ Global...");

  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
    body: []
  });

  console.log("ลบคำสั่ง Slash ระดับ Global เรียบร้อย");
}

main().catch((error) => {
  console.error("ไม่สามารถลบคำสั่ง Slash ได้", error);
  process.exitCode = 1;
});
