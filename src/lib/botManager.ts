import type { Client } from "discord.js";
import { REST, Routes } from "discord.js";
import { createDiscordClient } from "../discord/client";
import type { AppConfig } from "../config";
import type { MusicService } from "../services/musicService";
import {
  getActiveMusicBots,
  activateBotInGuild,
  updateBotGuildCount,
  checkGuildMusicBotLimits,
  prisma
} from "./database";
import { commandData } from "../discord/commands";

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
  private packageCheckInterval: NodeJS.Timeout | null = null;
  private guildCheckQueue: Map<string, Promise<void>> = new Map(); // กันการเช็ค guild ซ้ำพร้อมกัน
  private guildActiveBotCount: Map<string, Set<string>> = new Map(); // นับจำนวน bot ที่ active ใน guild (in-memory)

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

    // เริ่มระบบตรวจสอบ package แบบ periodic (ทุกๆ 1 ชั่วโมง)
    this.startPeriodicPackageCheck();
  }

  /**
   * เช็คและออกจาก guild ถ้าไม่ผ่านเงื่อนไข (ใช้ queue ป้องกัน race condition)
   */
  private async checkAndLeaveGuildIfNeeded(
    clientId: string,
    botName: string,
    guildId: string,
    guild: any
  ): Promise<void> {
    // ถ้ามี queue อยู่แล้วสำหรับ guild นี้ รอให้เสร็จก่อน (CRITICAL!)
    const existingCheck = this.guildCheckQueue.get(guildId);
    if (existingCheck) {
      await existingCheck;
      // เช็คอีกครั้งว่ายังมี queue ใหม่หรือไม่ (กรณีที่มี bot อื่นเข้ามาระหว่างทาง)
      const newerCheck = this.guildCheckQueue.get(guildId);
      if (newerCheck && newerCheck !== existingCheck) {
        await newerCheck;
      }
    }

    // สร้าง promise สำหรับการเช็คครั้งนี้
    const checkPromise = (async () => {
      try {
        const limitCheck = await checkGuildMusicBotLimits(guildId);
        
        // นับจำนวน bot ที่ active จาก in-memory counter
        const activeBotsInGuild = this.guildActiveBotCount.get(guildId);
        const currentBotCount = activeBotsInGuild ? activeBotsInGuild.size : 0;
        
        // เช็ค package expiry
        const packageExpired = limitCheck.packageExpired;
        const maxBots = limitCheck.maxBots;
        const botsExceeded = currentBotCount >= maxBots;

        if (packageExpired || botsExceeded) {
          const reason = packageExpired
            ? "Package หมดอายุแล้ว"
            : `จำนวน Music Bot เกินจำนวนที่อนุญาต (${currentBotCount}/${maxBots})`;
          
          console.warn(`[Bot:${botName}] ⚠️ ${guild.name} - ${reason}`);
          console.log(`[Bot:${botName}] 🚪 ออกจาก guild ${guild.name}`);

          // ลบจาก in-memory counter ก่อน
          if (activeBotsInGuild) {
            activeBotsInGuild.delete(clientId);
            if (activeBotsInGuild.size === 0) {
              this.guildActiveBotCount.delete(guildId);
            }
          }

          // อัพเดต status ใน database
          const bot = await prisma.musicBotDB.findUnique({
            where: { clientId }
          });

          if (bot) {
            await prisma.serverMusicBotDB.updateMany({
              where: {
                serverId: guildId,
                musicBotId: bot.id
              },
              data: {
                status: "REMOVED",
                removedAt: new Date()
              }
            });
          }

          await guild.leave();
          this.guildToBotMap.delete(guildId);

          // อัพเดต guild count
          const botInstance = this.bots.get(clientId);
          if (botInstance) {
            const newGuildCount = botInstance.client.guilds.cache.size;
            await updateBotGuildCount(clientId, newGuildCount);
          }
        } else {
          // บันทึกลง database เป็น ACTIVE
          const bot = await prisma.musicBotDB.findUnique({
            where: { clientId }
          });

          if (bot) {
            // Check ว่ามี record อยู่แล้วหรือไม่
            const existing = await prisma.serverMusicBotDB.findFirst({
              where: {
                serverId: guildId,
                musicBotId: bot.id
              }
            });

            if (existing) {
              // อัพเดตเป็น ACTIVE
              await prisma.serverMusicBotDB.update({
                where: { id: existing.id },
                data: {
                  status: "ACTIVE",
                  activatedAt: new Date(),
                  removedAt: null
                }
              });
            } else {
              // สร้าง record ใหม่
              await prisma.serverMusicBotDB.create({
                data: {
                  serverId: guildId,
                  musicBotId: bot.id,
                  status: "ACTIVE",
                  activatedAt: new Date()
                }
              });
            }
          }

          // เพิ่มใน in-memory counter
          if (!activeBotsInGuild) {
            this.guildActiveBotCount.set(guildId, new Set([clientId]));
          } else {
            activeBotsInGuild.add(clientId);
          }
          
          console.log(`[Bot:${botName}] ✅ ${guild.name} - Package valid (Bots: ${currentBotCount + 1}/${maxBots})`);
        }
      } catch (error) {
        console.error(`[Bot:${botName}] ❌ Error checking ${guild.name}:`, error);
      } finally {
        // ลบ queue เมื่อเสร็จ
        this.guildCheckQueue.delete(guildId);
      }
    })();

    // เก็บ promise ใน queue
    this.guildCheckQueue.set(guildId, checkPromise);

    // รอให้เสร็จ
    await checkPromise;
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

      // เช็ค guilds ที่มีอยู่แล้วทั้งหมด (ใช้ queue เพื่อป้องกัน race condition)
      if (guildCount > 0) {
        console.log(`[Bot:${name}] 🔍 กำลังรอคิวเพื่อตรวจสอบ package สำหรับ ${guildCount} guilds...`);
        
        for (const [guildId, guild] of client.guilds.cache) {
          await this.checkAndLeaveGuildIfNeeded(clientId, name, guildId, guild);
        }
      }
    });

    client.on("error", (error) => {
      console.error(`[Bot:${name}] Error:`, error);
    });

    // เมื่อ bot เข้า guild ใหม่
    client.on("guildCreate", async (guild) => {
      console.log(`[Bot:${name}] เข้า guild: ${guild.name} (${guild.id})`);
      
      // รอ queue ถ้ามีการเช็คอยู่
      const existingCheck = this.guildCheckQueue.get(guild.id);
      if (existingCheck) {
        await existingCheck;
      }

      // เช็ค package และ bot limits
      try {
        const limitCheck = await checkGuildMusicBotLimits(guild.id);
        
        if (!limitCheck.allowed) {
          console.warn(`[Bot:${name}] ⚠️ ${guild.name} - ${limitCheck.reason}`);
          console.log(`[Bot:${name}] 🚪 ออกจาก guild ${guild.name}`);
          
          // อัพเดต status ใน database ก่อนออก
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

          await guild.leave();
          
          // อัพเดต guild count
          const guildCount = client.guilds.cache.size;
          await updateBotGuildCount(clientId, guildCount);
          return;
        }
        
        console.log(`[Bot:${name}] ✅ Package valid - Bots: ${limitCheck.currentBots + 1}/${limitCheck.maxBots}`);
      } catch (error) {
        console.error(`[Bot:${name}] ❌ Error checking limits:`, error);
        
        // อัพเดต status ใน database เมื่อเกิด error
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
                status: "FAILED",
                removedAt: new Date()
              }
            });
          }
        } catch (dbError) {
          console.error(`[Bot:${name}] ❌ Error updating database:`, dbError);
        }

        await guild.leave();
        return;
      }
      
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

      // Auto deploy slash commands
      try {
        console.log(`[Bot:${name}] 🔧 กำลัง auto deploy slash commands ให้ ${guild.name}...`);
        
        const botInstance = this.bots.get(clientId);
        if (!botInstance) {
          console.error(`[Bot:${name}] ไม่พบ bot instance สำหรับ auto deploy`);
          return;
        }

        const rest = new REST({ version: "10" }).setToken(botInstance.token);
        const route = Routes.applicationGuildCommands(clientId, guild.id);
        await rest.put(route, { body: commandData });

        console.log(`[Bot:${name}] ✅ Auto deploy slash commands สำเร็จ (${commandData.length} คำสั่ง)`);
      } catch (error) {
        console.error(`[Bot:${name}] ❌ Auto deploy slash commands ล้มเหลว:`, error);
      }
    });

    // เมื่อ bot ออกจาก guild
    client.on("guildDelete", async (guild) => {
      console.log(`[Bot:${name}] ออกจาก guild: ${guild.name} (${guild.id})`);
      
      // ลบจาก in-memory counter
      const activeBotsInGuild = this.guildActiveBotCount.get(guild.id);
      if (activeBotsInGuild) {
        activeBotsInGuild.delete(clientId);
        if (activeBotsInGuild.size === 0) {
          this.guildActiveBotCount.delete(guild.id);
        }
      }
      
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
   * เริ่มระบบตรวจสอบ package แบบ periodic
   */
  private startPeriodicPackageCheck(): void {
    // ตรวจสอบทุกๆ 1 ชั่วโมง (3600000 ms)
    const CHECK_INTERVAL = 60 * 60 * 1000;
    
    console.log("[BotManager] 🔄 เริ่มระบบตรวจสอบ package อัตโนมัติ (ทุกๆ 1 ชั่วโมง)");
    
    this.packageCheckInterval = setInterval(async () => {
      console.log("[BotManager] 🔍 เริ่มตรวจสอบ package ทั้งหมด...");
      await this.checkAllGuildsPackages();
    }, CHECK_INTERVAL);
  }

  /**
   * ตรวจสอบ package สำหรับทุก guilds ของทุก bots (ใช้ queue ป้องกัน race condition)
   */
  private async checkAllGuildsPackages(): Promise<void> {
    let totalChecked = 0;

    for (const bot of this.bots.values()) {
      const client = bot.client;

      for (const [guildId, guild] of client.guilds.cache) {
        totalChecked++;
        await this.checkAndLeaveGuildIfNeeded(bot.clientId, bot.name, guildId, guild);
      }
    }

    console.log(`[BotManager] ✅ ตรวจสอบเสร็จสิ้น - เช็ค ${totalChecked} guilds`);
  }

  /**
   * Shutdown all bots
   */
  async shutdown(): Promise<void> {
    console.log("[BotManager] กำลัง shutdown bots ทั้งหมด...");

    // หยุด periodic check
    if (this.packageCheckInterval) {
      clearInterval(this.packageCheckInterval);
      this.packageCheckInterval = null;
      console.log("[BotManager] หยุดระบบตรวจสอบ package อัตโนมัติ");
    }

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

