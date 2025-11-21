import type { Client } from "discord.js";
import { createDiscordClient } from "../discord/client";
import type { AppConfig } from "../config";
import type { MusicService } from "../services/musicService";
import {
  getActiveMusicBots,
  activateBotInGuild,
  updateBotGuildCount,
  prisma
} from "./database";

export interface BotInstance {
  clientId: string;
  name: string;
  client: Client;
  musicService: MusicService;
  token: string;
}

export class BotManager {
  private bots: Map<string, BotInstance> = new Map();
  private guildToBotMap: Map<string, string> = new Map(); // guildId -> clientId
  private config: AppConfig;
  private musicServiceFactory: (client: Client, config: AppConfig) => MusicService;

  constructor(
    config: AppConfig,
    musicServiceFactory: (client: Client, config: AppConfig) => MusicService
  ) {
    this.config = config;
    this.musicServiceFactory = musicServiceFactory;
  }

  /**
   * โหลดและเริ่มต้น bots ทั้งหมดจาก database
   */
  async initialize(): Promise<void> {
    console.log("[BotManager] กำลังโหลดข้อมูล Music Bots จาก database...");

    const activeBots = await getActiveMusicBots();

    if (activeBots.length === 0) {
      console.warn("[BotManager] ⚠️ ไม่พบ Music Bot ที่เปิดใช้งานใน database");
      console.warn("[BotManager] กรุณาเพิ่มข้อมูล bot ผ่าน seed script หรือ admin panel");
      return;
    }

    console.log(`[BotManager] พบ ${activeBots.length} Music Bots ที่เปิดใช้งาน`);

    // เริ่ม login bots ทั้งหมดแบบ parallel
    const loginPromises = activeBots.map(async (botData) => {
      try {
        const client = createDiscordClient();
        const musicService = this.musicServiceFactory(client, this.config);

        // Setup event listeners
        this.setupBotEventListeners(client, botData.clientId, botData.name);

        // Login to Discord
        await client.login(botData.token);

        const botInstance: BotInstance = {
          clientId: botData.clientId,
          name: botData.name,
          client,
          musicService,
          token: botData.token
        };

        this.bots.set(botData.clientId, botInstance);

        // Map guilds ที่ bot นี้รับผิดชอบ
        for (const assignment of botData.ServerMusicBot) {
          this.guildToBotMap.set(assignment.serverId, botData.clientId);
        }

        console.log(`[BotManager] ✅ เริ่ม ${botData.name} (${botData.clientId}) สำเร็จ`);

        return botInstance;
      } catch (error) {
        console.error(
          `[BotManager] ❌ ไม่สามารถเริ่ม ${botData.name} (${botData.clientId}):`,
          error
        );
        return null;
      }
    });

    await Promise.allSettled(loginPromises);

    console.log(
      `[BotManager] เริ่มงาน ${this.bots.size}/${activeBots.length} bots สำเร็จ`
    );
  }

  /**
   * Setup event listeners สำหรับแต่ละ bot
   */
  private setupBotEventListeners(client: Client, clientId: string, name: string): void {
    client.once("ready", async () => {
      if (!client.user) return;
      console.log(`[Bot:${name}] Logged in as ${client.user.tag} (${client.user.id})`);

      // อัพเดตจำนวน guilds
      const guildCount = client.guilds.cache.size;
      await updateBotGuildCount(clientId, guildCount);
    });

    client.on("error", (error) => {
      console.error(`[Bot:${name}] Error:`, error);
    });

    // เมื่อ bot เข้า guild ใหม่
    client.on("guildCreate", async (guild) => {
      console.log(`[Bot:${name}] เข้า guild: ${guild.name} (${guild.id})`);
      
      // อัพเดต guild count
      const guildCount = client.guilds.cache.size;
      await updateBotGuildCount(clientId, guildCount);

      // บันทึกการ assign ลง database
      try {
        await activateBotInGuild(guild.id, clientId);
        this.guildToBotMap.set(guild.id, clientId);
      } catch (error) {
        console.error(`[Bot:${name}] ไม่สามารถบันทึก guild assignment:`, error);
      }
    });

    // เมื่อ bot ออกจาก guild
    client.on("guildDelete", async (guild) => {
      console.log(`[Bot:${name}] ออกจาก guild: ${guild.name} (${guild.id})`);
      
      // อัพเดต guild count
      const guildCount = client.guilds.cache.size;
      await updateBotGuildCount(clientId, guildCount);

      // อัพเดตสถานะใน database
      try {
        const bot = await prisma.musicBotDB.findUnique({
          where: { clientId }
        });

        if (bot) {
          await prisma.serverMusicBotDB.updateMany({
            where: {
              serverId: guild.id,
              musicBotId: bot.id
            },
            data: {
              status: "REMOVED",
              removedAt: new Date()
            }
          });
        }

        this.guildToBotMap.delete(guild.id);
      } catch (error) {
        console.error(`[Bot:${name}] ไม่สามารถอัพเดตสถานะ guild:`, error);
      }
    });
  }

  /**
   * ดึง bot instance สำหรับ guild ID
   */
  getBotForGuild(guildId: string): BotInstance | undefined {
    const clientId = this.guildToBotMap.get(guildId);
    if (!clientId) return undefined;
    return this.bots.get(clientId);
  }

  /**
   * ดึง bot instance จาก client ID
   */
  getBotByClientId(clientId: string): BotInstance | undefined {
    return this.bots.get(clientId);
  }

  /**
   * ดึง all bot instances
   */
  getAllBots(): BotInstance[] {
    return Array.from(this.bots.values());
  }

  /**
   * ดึง music service สำหรับ guild
   */
  getMusicServiceForGuild(guildId: string): MusicService | undefined {
    const bot = this.getBotForGuild(guildId);
    return bot?.musicService;
  }

  /**
   * ตรวจสอบว่า guild มี bot assign หรือไม่
   */
  hasBot(guildId: string): boolean {
    return this.guildToBotMap.has(guildId);
  }

  /**
   * Shutdown all bots
   */
  async shutdown(): Promise<void> {
    console.log("[BotManager] กำลัง shutdown bots ทั้งหมด...");

    const shutdownPromises = Array.from(this.bots.values()).map(
      async (bot) => {
        try {
          await bot.client.destroy();
          console.log(`[BotManager] ✅ Shutdown ${bot.name} สำเร็จ`);
        } catch (error) {
          console.error(`[BotManager] ❌ Error shutting down ${bot.name}:`, error);
        }
      }
    );

    await Promise.allSettled(shutdownPromises);

    this.bots.clear();
    this.guildToBotMap.clear();

    console.log("[BotManager] Shutdown เสร็จสิ้น");
  }
}

