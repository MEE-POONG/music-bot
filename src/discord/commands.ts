import { SlashCommandBuilder } from "discord.js";

export const playCommand = new SlashCommandBuilder()
  .setName("play")
  .setDescription("เล่นเพลงหรือเพลย์ลิสต์จากคำค้นหรือ URL")
  .addStringOption((option) =>
    option
      .setName("query")
      .setDescription("คำค้นหา หรือ ลิงก์ YouTube/Spotify ฯลฯ")
      .setRequired(true)
  );

export const skipCommand = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("ข้ามเพลงที่กำลังเล่นอยู่");

export const stopCommand = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("หยุดเล่นเพลงและออกจากห้องเสียง");

export const queueCommand = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("ดูเพลงที่กำลังเล่นและลำดับถัดไป");

export const commandBuilders = [
  playCommand,
  skipCommand,
  stopCommand,
  queueCommand
] as const;

export const commandData = commandBuilders.map((builder) => builder.toJSON());

export type CommandName = (typeof commandBuilders)[number]["name"];
