import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandData } from "../discord/commands";
import { config } from "../config";

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(
      config.DISCORD_CLIENT_ID,
      config.DISCORD_GUILD_ID
    )
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

async function main() {
  let guildName: string | null = null;

  if (config.DISCORD_GUILD_ID) {
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
  }

  const scopeText = config.DISCORD_GUILD_ID
    ? `Guild (${guildName ?? config.DISCORD_GUILD_ID})`
    : "Global";

  console.log(
    `กำลังลงทะเบียนคำสั่งแบบ Slash (${commandData.length} รายการ) ไปยัง ${scopeText}...`
  );

  await rest.put(route, { body: commandData });

  console.log("ลงทะเบียนคำสั่งสำเร็จ");
}

main().catch((error) => {
  console.error("ไม่สามารถลงทะเบียนคำสั่งได้", error);
  process.exitCode = 1;
});
