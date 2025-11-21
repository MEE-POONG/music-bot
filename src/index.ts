import "dotenv/config";
import { Elysia } from "elysia";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { ChatInputCommandInteraction, Client, Guild, User } from "discord.js";
import { config } from "./config";
import { musicRoutes } from "./routes/music";
import {
  AUTOPLAY_GENRE_LABELS,
  AUTOPLAY_GENRES,
  MusicService,
  type AutoplayState,
  type GuildQueueState,
  type LoopMode,
  type QueueRequester
} from "./services/musicService";
import { BotManager } from "./lib/botManager";

// สร้าง BotManager instance
const botManager = new BotManager(config, (client, cfg) => new MusicService(client, cfg));

const ControlButtons = {
  TOGGLE_PAUSE: "music:control:toggle_pause",
  SKIP: "music:control:skip",
  STOP: "music:control:stop",
  QUEUE: "music:control:queue",
  SHUFFLE: "music:control:shuffle",
  VOLUME: "music:control:volume",
  LOOP: "music:control:loop",
  AUTOPLAY: "music:control:autoplay"
} as const;

const ModalIds = {
  VOLUME: "music:modal:volume",
  AUTOPLAY: "music:modal:autoplay"
} as const;

const ModalFieldIds = {
  VOLUME: "music:modal:volume:value",
  AUTOPLAY_GENRE: "music:modal:autoplay:genre"
} as const;

const MODAL_CONTEXT_SEPARATOR = "::";

// Initialize all bots
await botManager.initialize();

// Setup interaction handlers for each bot
for (const bot of botManager.getAllBots()) {
  setupInteractionHandlers(bot.client, bot.musicService);
}

// Setup interaction handlers
function setupInteractionHandlers(client: Client, musicService: MusicService) {
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guildId || !interaction.guild) {
        await replySafely(interaction, {
          content: "คำสั่งนี้ใช้ได้เฉพาะภายในเซิร์ฟเวอร์",
          flags: "Ephemeral"
        });
        return;
      }

      try {
        await handleSlashCommand(interaction, musicService, client);
      } catch (error) {
        console.error("[Discord] Slash command error", error);
        await replySafely(interaction, {
          content: "เกิดข้อผิดพลาดขณะประมวลคำสั่ง ลองอีกครั้งภายหลัง",
          flags: "Ephemeral"
        });
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        await handleControlButton(interaction, musicService, client);
      } catch (error) {
        console.error("[Discord] Button interaction error", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "เกิดข้อผิดพลาดในการใช้งานปุ่ม",
            flags: "Ephemeral"
          });
        }
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      try {
        await handleModalSubmit(interaction, musicService, client);
      } catch (error) {
        console.error("[Discord] Modal interaction error", error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "ไม่สามารถประมวลผลข้อมูลที่ส่งมาได้",
            flags: "Ephemeral"
          });
        }
      }
    }
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[Runtime] Unhandled promise rejection:", reason);
});

process.on("SIGINT", async () => {
  console.log("\n[Runtime] Shutting down gracefully...");
  await botManager.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Runtime] Shutting down gracefully...");
  await botManager.shutdown();
  process.exit(0);
});

// Start HTTP server with all music services
const allMusicServices = botManager.getAllBots().map((bot) => bot.musicService);
const app = new Elysia()
  .get("/health", () => ({
    status: "ok",
    uptime: process.uptime(),
    activeBots: botManager.getAllBots().length
  }))
  .get("/bots", () => ({
    bots: botManager.getAllBots().map((bot) => ({
      name: bot.name,
      clientId: bot.clientId,
      guilds: bot.client.guilds.cache.size,
      users: bot.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
    }))
  }))
  .use(musicRoutes(allMusicServices[0] ?? null)) // Use first bot's service as fallback
  .listen(config.APP_PORT);

console.log(
  `[HTTP] Listening on http://${app.server?.hostname ?? "0.0.0.0"}:${
    app.server?.port ?? config.APP_PORT
  }`
);

async function replySafely(
  interaction: ChatInputCommandInteraction,
  payload: Parameters<ChatInputCommandInteraction["reply"]>[0]
) {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  musicService: MusicService,
  client: Client
) {
  switch (interaction.commandName) {
    case "play":
      await handlePlay(interaction, musicService, client);
      break;
    case "skip":
      await handleSkip(interaction, musicService, client);
      break;
    case "stop":
      await handleStop(interaction, musicService, client);
      break;
    case "queue":
      await handleQueue(interaction, musicService, client);
      break;
    default:
      await replySafely(interaction, {
        content: "ไม่รู้จักคำสั่งนี้",
        flags: "Ephemeral"
      });
  }
}

async function resolveMember(
  guild: Guild | null,
  userId: string
): Promise<GuildMember | null> {
  if (!guild) return null;
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    console.warn(`[Discord] ไม่สามารถดึงข้อมูลสมาชิก ${userId} ได้`, error);
    return null;
  }
}

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  musicService: MusicService,
  client: Client
) {
  await interaction.deferReply();

  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await resolveMember(interaction.guild, interaction.user.id);

  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    await interaction.editReply({
      content: "กรุณาเข้าร่วมห้องเสียงก่อนใช้คำสั่ง /play"
    });
    return;
  }

  const requester: QueueRequester = {
    id: interaction.user.id,
    name: member?.displayName ?? interaction.user.tag
  };

  const query = interaction.options.getString("query", true);

  try {
    const track = await musicService.play(
      interaction.guildId!,
      voiceChannel.id,
      query,
      requester
    );

    const presentation = buildQueuePresentation(
      interaction.guildId!,
      interaction.guild,
      musicService,
      client
    );

    await interaction.editReply({
      content: `เพิ่มเพลง **${track.info.title}** โดย ${track.info.author}${
        track.info.uri ? `\n🔗 ${track.info.uri}` : ""
      }`,
      embeds: presentation.embeds,
      components: presentation.components
    });
  } catch (error) {
    console.error("[Discord] Failed to queue track", error);
    const message =
      error instanceof Error && error.message.includes("No tracks found")
        ? "ไม่พบเพลงที่ตรงกับคำค้น ลองใช้คำค้นอื่น หรือใส่ลิงก์ให้ชัดเจน"
        : "ไม่สามารถเพิ่มเพลงได้ในขณะนี้ ลองใหม่อีกครั้ง";
    await interaction.editReply({
      content: message
    });
  }
}

async function handleSkip(
  interaction: ChatInputCommandInteraction,
  musicService: MusicService,
  client: Client
) {
  const queue = musicService.getQueue(interaction.guildId!);
  if (!queue || !queue.current) {
    await replySafely(interaction, {
      content: "ยังไม่มีเพลงที่กำลังเล่นอยู่",
      flags: "Ephemeral"
    });
    return;
  }

  if (queue.items.length < 1) {
    await replySafely(interaction, {
      content: "ไม่สามารถข้ามได้ เนื่องจากไม่มีเพลงถัดไปในคิว",
      flags: "Ephemeral"
    });
    return;
  }

  await musicService.skip(interaction.guildId!);
  const presentation = buildQueuePresentation(
    interaction.guildId!,
    interaction.guild,
    musicService,
    client
  );

  await replySafely(interaction, {
    content: "⏭️ ข้ามเพลงแล้ว",
    embeds: presentation.embeds,
    components: presentation.components
  });
}

async function handleStop(
  interaction: ChatInputCommandInteraction,
  musicService: MusicService,
  client: Client
) {
  const queue = musicService.getQueue(interaction.guildId!);
  if (!queue) {
    await replySafely(interaction, {
      content: "ไม่มีคิวเพลงให้หยุด",
      flags: "Ephemeral"
    });
    return;
  }

  await musicService.stop(interaction.guildId!);
  const presentation = buildQueuePresentation(
    interaction.guildId!,
    interaction.guild,
    musicService,
    client
  );

  await replySafely(interaction, {
    content: "🛑 หยุดเล่นเพลงทั้งหมดแล้ว",
    embeds: presentation.embeds,
    components: presentation.components
  });
}

async function handleQueue(
  interaction: ChatInputCommandInteraction,
  musicService: MusicService,
  client: Client
) {
  const presentation = buildQueuePresentation(
    interaction.guildId!,
    interaction.guild,
    musicService,
    client
  );

  await replySafely(interaction, {
    embeds: presentation.embeds,
    components: presentation.components
  });
}

async function handleControlButton(
  interaction: ButtonInteraction,
  musicService: MusicService,
  client: Client
) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "ปุ่มนี้ใช้ได้เฉพาะภายในเซิร์ฟเวอร์",
      flags: "Ephemeral"
    });
    return;
  }

  const messageId = interaction.message?.id ?? "";
  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await resolveMember(interaction.guild, interaction.user.id);

  const queueBefore = musicService.getQueue(interaction.guildId);

  const requiresQueue =
    interaction.customId !== ControlButtons.QUEUE &&
    interaction.customId !== ControlButtons.AUTOPLAY &&
    interaction.customId !== ControlButtons.VOLUME;

  if (requiresQueue && !queueBefore) {
    await interaction.reply({
      content: "ตอนนี้ไม่มีเพลงที่กำลังเล่นอยู่",
      flags: "Ephemeral"
    });
    return;
  }

  const requiresAuth = interaction.customId !== ControlButtons.QUEUE;

  if (requiresAuth && !hasControlPermission(member, queueBefore)) {
    await interaction.reply({
      content: "คุณไม่มีสิทธิ์ควบคุมเพลง (ต้องเป็น DJ, แอดมิน หรือผู้ขอเพลง)",
      flags: "Ephemeral"
    });
    return;
  }

  switch (interaction.customId) {
    case ControlButtons.TOGGLE_PAUSE: {
      const paused = await musicService.togglePause(interaction.guildId);
      const presentation = buildQueuePresentation(
        interaction.guildId,
        interaction.guild,
        musicService,
        client
      );
    await interaction.update({
      embeds: presentation.embeds,
      components: presentation.components
    });
    await interaction.followUp({
      content: paused ? "⏸️ หยุดเพลงชั่วคราวแล้ว" : "▶️ เล่นเพลงต่อ",
      flags: "Ephemeral"
    });
      return;
    }
    case ControlButtons.SKIP: {
      const queue = musicService.getQueue(interaction.guildId);
      if (!queue || queue.items.length < 1) {
        await interaction.reply({
          content: "ไม่สามารถข้ามได้ เนื่องจากไม่มีเพลงถัดไปในคิว",
          flags: "Ephemeral"
        });
        return;
      }
      await musicService.skip(interaction.guildId);
      const presentation = buildQueuePresentation(
        interaction.guildId,
        interaction.guild,
        musicService,
        client
      );
      await interaction.update({
        embeds: presentation.embeds,
        components: presentation.components
      });
      await interaction.followUp({
        content: "⏭️ ข้ามเพลงเรียบร้อย",
        flags: "Ephemeral"
      });
      return;
    }
    case ControlButtons.STOP: {
      await musicService.stop(interaction.guildId);
      const presentation = buildQueuePresentation(
        interaction.guildId,
        interaction.guild,
        musicService,
        client
      );
      await interaction.update({
        embeds: presentation.embeds,
        components: presentation.components
      });
      await interaction.followUp({
        content: "🛑 หยุดเล่นเพลงทั้งหมดแล้ว",
        flags: "Ephemeral"
      });
      return;
    }
    case ControlButtons.QUEUE: {
      const presentation = buildQueuePresentation(
        interaction.guildId,
        interaction.guild,
        musicService,
        client
      );
      await interaction.update({
        embeds: presentation.embeds,
        components: presentation.components
      });
      return;
    }
    case ControlButtons.SHUFFLE: {
      const queue = musicService.getQueue(interaction.guildId);
      if (!queue || queue.items.length < 2) {
        await interaction.reply({
          content: "ต้องมีอย่างน้อยสองเพลงในคิวจึงจะสับได้",
          flags: "Ephemeral"
        });
        return;
      }

      await musicService.shuffle(interaction.guildId);
      const presentation = buildQueuePresentation(
        interaction.guildId,
        interaction.guild,
        musicService,
        client
      );
      await interaction.update({
        embeds: presentation.embeds,
        components: presentation.components
      });
      await interaction.followUp({
        content: "🔀 สับคิวเรียบร้อย",
        flags: "Ephemeral"
      });
      return;
    }
    case ControlButtons.LOOP: {
      const mode = musicService.cycleLoopMode(interaction.guildId);
      const presentation = buildQueuePresentation(
        interaction.guildId,
        interaction.guild,
        musicService,
        client
      );
      await interaction.update({
        embeds: presentation.embeds,
        components: presentation.components
      });
      await interaction.followUp({
        content: `🔁 ตั้งค่าโหมดลูปเป็น ${loopModeLabel(mode)}`,
        flags: "Ephemeral"
      });
      return;
    }
    case ControlButtons.AUTOPLAY: {
      const queue = musicService.getQueue(interaction.guildId);
      if (!queue) {
        await interaction.reply({
          content: "ไม่มีคิวเพลงให้ตั้งค่า Autoplay",
          flags: "Ephemeral"
        });
        return;
      }

      if (queue.autoplay.enabled) {
        musicService.setAutoplay(interaction.guildId, { enabled: false });
        const presentation = buildQueuePresentation(
          interaction.guildId,
          interaction.guild,
          musicService,
          client
        );
        await interaction.update({
          embeds: presentation.embeds,
          components: presentation.components
        });
        await interaction.followUp({
          content: "🎲 ปิด Autoplay แล้ว",
          flags: "Ephemeral"
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${ModalIds.AUTOPLAY}${MODAL_CONTEXT_SEPARATOR}${messageId}`)
        .setTitle("เลือกแนวเพลงสำหรับ Autoplay");

      const genreInput = new TextInputBuilder()
        .setCustomId(ModalFieldIds.AUTOPLAY_GENRE)
        .setLabel("กรอกแนวเพลง (เช่น Lo-Fi, Pop, Random)")
        .setMinLength(2)
        .setMaxLength(20)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("เช่น Lo-Fi, Pop, Random");

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(genreInput)
      );

      await interaction.showModal(modal);
      return;
    }
    case ControlButtons.VOLUME: {
      const queue = musicService.getQueue(interaction.guildId);
      if (!queue) {
    await interaction.reply({
      content: "ไม่มีคิวเพลงให้ปรับระดับเสียง",
      flags: "Ephemeral"
    });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`${ModalIds.VOLUME}${MODAL_CONTEXT_SEPARATOR}${messageId}`)
        .setTitle("ปรับระดับเสียง (0-100)");

      const input = new TextInputBuilder()
        .setCustomId(ModalFieldIds.VOLUME)
        .setLabel("ระดับเสียง (0 - 100)")
        .setMinLength(1)
        .setMaxLength(3)
        .setStyle(TextInputStyle.Short)
        .setValue(String(queue.volume));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input)
      );

      await interaction.showModal(modal);
      return;
    }
    default:
      await interaction.reply({
        content: "ไม่รู้จักปุ่มนี้",
        flags: "Ephemeral"
      });
  }
}

async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  musicService: MusicService,
  client: Client
) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "โมดอลนี้ใช้ได้เฉพาะภายในเซิร์ฟเวอร์",
      flags: "Ephemeral"
    });
    return;
  }

  const [modalId, messageId] = interaction.customId.split(
    MODAL_CONTEXT_SEPARATOR
  );

  switch (modalId) {
    case ModalIds.VOLUME: {
      const value = interaction.fields.getTextInputValue(ModalFieldIds.VOLUME);
      const parsed = Number(value);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        await interaction.reply({
          content: "กรุณากรอกตัวเลขระหว่าง 0 ถึง 100",
          flags: "Ephemeral"
        });
        return;
      }

      try {
        await musicService.setVolume(interaction.guildId, parsed);
        await updateDashboardMessage(
          interaction.channelId ?? "",
          messageId,
          interaction.guildId,
          interaction.guild,
          musicService,
          client
        );
        await interaction.reply({
          content: `🔊 ปรับระดับเสียงเป็น ${parsed}% แล้ว`,
          flags: "Ephemeral"
        });
      } catch (error) {
        console.error("[Discord] Failed to set volume", error);
        await interaction.reply({
          content: "ไม่สามารถปรับระดับเสียงได้ในขณะนี้",
          flags: "Ephemeral"
        });
      }
      return;
    }
    case ModalIds.AUTOPLAY: {
      const rawGenreInput = interaction.fields
        .getTextInputValue(ModalFieldIds.AUTOPLAY_GENRE)
        .trim();

      const normalized = normalizeGenreInput(rawGenreInput);
      const genre = AUTOPLAY_GENRES.find((item) => {
        const keyNormalized = normalizeGenreInput(item);
        const labelNormalized = normalizeGenreInput(
          AUTOPLAY_GENRE_LABELS[item]
        );
        return keyNormalized === normalized || labelNormalized === normalized;
      });

      const genreListLabel = AUTOPLAY_GENRES.map(
        (item) => AUTOPLAY_GENRE_LABELS[item]
      ).join(", ");

      if (!genre) {
        await interaction.reply({
          content: `กรุณากรอกแนวเพลงจากรายการต่อไปนี้: ${genreListLabel}`,
          flags: "Ephemeral"
        });
        return;
      }

      try {
        musicService.setAutoplay(interaction.guildId, {
          enabled: true,
          genre
        });
        await updateDashboardMessage(
          interaction.channelId ?? "",
          messageId,
          interaction.guildId,
          interaction.guild,
          musicService,
          client
        );
        await interaction.reply({
          content: `🎲 เปิด Autoplay แล้ว (แนว ${AUTOPLAY_GENRE_LABELS[genre]})`,
          flags: "Ephemeral"
        });
      } catch (error) {
        console.error("[Discord] Failed to set autoplay", error);
        await interaction.reply({
          content: "ไม่สามารถตั้งค่า Autoplay ได้ในขณะนี้",
          flags: "Ephemeral"
        });
      }
      return;
    }
    default:
      await interaction.reply({
        content: "ไม่รู้จักโมดอลนี้",
        flags: "Ephemeral"
      });
  }
}

function hasControlPermission(
  member: GuildMember | null,
  queue?: GuildQueueState | undefined
) {
  if (!member) return false;

  if (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.ManageChannels)
  ) {
    return true;
  }

  if (
    config.DJ_ROLE_IDS.length > 0 &&
    member.roles.cache.some((role) => config.DJ_ROLE_IDS.includes(role.id))
  ) {
    return true;
  }

  if (queue?.current?.requester?.id === member.id) {
    return true;
  }

  return false;
}

type QueuePresentation = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

function buildQueuePresentation(
  guildId: string,
  guild: Guild | null | undefined,
  musicService: MusicService,
  client: Client
): QueuePresentation {
  const queue = musicService.getQueue(guildId);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎶 Music Dashboard");

  const hasQueue =
    !!queue && (!!queue.current || (queue.items && queue.items.length > 0));
  const paused = queue?.player?.paused ?? false;
  const hasUpcoming = (queue?.items.length ?? 0) > 0;
  const canShuffle = (queue?.items.length ?? 0) >= 2;
  const loopMode = queue?.loopMode ?? "off";
  const autoplay = queue?.autoplay ?? { enabled: false };

  if (!hasQueue || !queue?.current) {
    embed.setDescription("ยังไม่มีเพลงในคิวตอนนี้");
  } else {
    const current = queue.current;
    const position = Math.max(queue.player.position ?? 0, 0);
    const progress = current.info.isStream
      ? "🔴 ถ่ายทอดสด"
      : renderProgressLine(position, current.info.length);

    let footerText: string | undefined;
    let footerIcon: string | undefined;

    embed.addFields({
      name: paused ? "⏸️ กำลังพักเพลง" : "🎧 กำลังเล่น",
      value: [
        `**${current.info.title}**`,
        current.info.uri ? `🔗 ${current.info.uri}` : null,
        `โดย: ${current.info.author}`,
        current.requester ? `ผู้ขอ: ${current.requester.name}` : null,
        current.autoplay
          ? `🎲 Autoplay: ${current.autoplay.displayName}`
          : null,
        `ระยะเวลา: ${
          current.info.isStream ? "ถ่ายทอดสด" : formatDuration(current.info.length)
        }`,
        progress
      ]
        .filter(Boolean)
        .join("\n")
    });

    if (current.info.artworkUrl) {
      embed.setThumbnail(current.info.artworkUrl);
    }

    const requesterAvatarUrl = getRequesterAvatarUrl(current.requester, client);
    if (current.requester) {
      footerText = `ขอโดย ${current.requester.name}`;
      footerIcon = requesterAvatarUrl;
    }

    const upcoming = queue.items.slice(0, 10).map((item, index) => {
      const durationLabel = item.info.isStream
        ? "ถ่ายทอดสด"
        : formatDuration(item.info.length);
      const requester = item.requester?.name ?? "ไม่ระบุ";
      return `${index + 1}. ${item.info.title} (${durationLabel}) • ${requester}`;
    });

    embed.addFields({
      name: "📋 เพลงถัดไป",
      value:
        upcoming.length > 0
          ? upcoming.join("\n")
          : "ยังไม่มีเพลงถัดไปในคิว"
    });

    if (queue.items.length > 10) {
      const extra = `มีอีก ${queue.items.length - 10} เพลงในคิว`;
      footerText = footerText ? `${footerText} • ${extra}` : extra;
    }

    if (footerText) {
      embed.setFooter({
        text: footerText,
        iconURL: footerIcon
      });
    }
  }

  if (queue?.voiceChannelId && guild) {
    const channelName =
      guild.channels.cache.get(queue.voiceChannelId)?.name ?? null;
    if (channelName) {
      embed.setAuthor({ name: `ห้องเสียง: ${channelName}` });
    } else {
      embed.setAuthor({ name: `เซิร์ฟเวอร์: ${guild.name}` });
    }
  } else if (guild) {
    embed.setAuthor({ name: `เซิร์ฟเวอร์: ${guild.name}` });
  }

  const statusLines = [
    `🔁 โหมดลูป: ${loopModeLabel(loopMode)}`,
    `🔊 ระดับเสียง: ${queue?.volume ?? 100}%`,
    `🎲 Autoplay: ${describeAutoplayState(autoplay)}`
  ];

  embed.addFields({
    name: "สถานะ",
    value: statusLines.join("\n")
  });

  const components = createControlComponents({
    hasQueue,
    hasUpcoming,
    paused,
    canShuffle,
    loopMode,
    autoplay
  });

  return { embeds: [embed], components };
}

function createControlComponents({
  hasQueue,
  hasUpcoming,
  paused,
  canShuffle,
  loopMode,
  autoplay
}: {
  hasQueue: boolean;
  hasUpcoming: boolean;
  paused: boolean;
  canShuffle: boolean;
  loopMode: LoopMode;
  autoplay: AutoplayState;
}): ActionRowBuilder<ButtonBuilder>[] {
  const loopLabel = `ลูป: ${loopModeLabel(loopMode)}`;
  const autoplayLabel = `Autoplay: ${describeAutoplayState(autoplay)}`;

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ControlButtons.TOGGLE_PAUSE)
      .setEmoji(paused ? "▶️" : "⏸️")
      .setLabel(paused ? "เล่นต่อ" : "พักเพลง")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasQueue),
    new ButtonBuilder()
      .setCustomId(ControlButtons.SKIP)
      .setEmoji("⏭️")
      .setLabel("ข้ามเพลง")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasUpcoming),
    new ButtonBuilder()
      .setCustomId(ControlButtons.STOP)
      .setEmoji("⏹️")
      .setLabel("หยุด")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasQueue),
    new ButtonBuilder()
      .setCustomId(ControlButtons.QUEUE)
      .setEmoji("📋")
      .setLabel("อัปเดตคิว")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasQueue)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ControlButtons.SHUFFLE)
      .setEmoji("🔀")
      .setLabel("สับคิว")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canShuffle),
    new ButtonBuilder()
      .setCustomId(ControlButtons.LOOP)
      .setEmoji("🔁")
      .setLabel(loopLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasQueue),
    new ButtonBuilder()
      .setCustomId(ControlButtons.AUTOPLAY)
      .setEmoji("🎲")
      .setLabel(autoplayLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasQueue),
    new ButtonBuilder()
      .setCustomId(ControlButtons.VOLUME)
      .setEmoji("🔊")
      .setLabel("ระดับเสียง")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasQueue)
  );

  if (!hasQueue) {
    row2.components.forEach((button) => button.setDisabled(true));
  }

  return [row1, row2];
}

async function updateDashboardMessage(
  channelId: string,
  messageId: string,
  guildId: string,
  guild: Guild | null,
  musicService: MusicService,
  client: Client
) {
  if (!channelId || !messageId) return;
  const channel =
    client.channels.cache.get(channelId) ??
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel || !("isTextBased" in channel) || !channel.isTextBased()) {
    return;
  }

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  const presentation = buildQueuePresentation(guildId, guild ?? undefined, musicService, client);
  await message.edit({
    embeds: presentation.embeds,
    components: presentation.components
  });
}

function describeAutoplayState(state: AutoplayState): string {
  if (!state.enabled) return "ปิด";
  if (!state.genre) return "สุ่ม";
  return AUTOPLAY_GENRE_LABELS[state.genre] ?? state.genre;
}

function normalizeGenreInput(value: string) {
  return value.replace(/[\s_\-]+/g, "").toLowerCase();
}

function getRequesterAvatarUrl(requester: QueueRequester | undefined, client: Client) {
  if (!requester?.id || requester.id === "autoplay") return undefined;
  const user: User | undefined =
    client.users.cache.get(requester.id) ?? undefined;
  return user?.displayAvatarURL({ size: 64 }) ?? undefined;
}

function renderProgressLine(position: number, length: number) {
  if (length <= 0) {
    return `${formatDuration(position)} / ไม่ทราบความยาว`;
  }

  const barLength = 16;
  const ratio = Math.min(Math.max(position / length, 0), 1);
  const filled = Math.round(ratio * barLength);
  const bar = "▰".repeat(filled) + "▱".repeat(barLength - filled);
  return `${bar}\n${formatDuration(position)} / ${formatDuration(length)}`;
}

function loopModeLabel(mode: LoopMode) {
  switch (mode) {
    case "track":
      return "เล่นเพลงเดิมซ้ำ";
    case "queue":
      return "วนทั้งคิว";
    default:
      return "ปิด";
  }
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [
    hours > 0 ? hours.toString() : null,
    hours > 0 ? minutes.toString().padStart(2, "0") : minutes.toString(),
    seconds.toString().padStart(2, "0")
  ].filter(Boolean);

  return parts.join(":");
}
