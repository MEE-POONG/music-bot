import { ChannelType } from "discord.js";
import type { Client, StageChannel, VoiceChannel } from "discord.js";
import {
  Connectors,
  LoadType,
  type LavalinkResponse,
  type Player,
  Shoukaku,
  type Track as LavalinkTrack
} from "shoukaku";
import type { AppConfig } from "../config";

type AutoplayGenreConfig = {
  displayName: string;
  searchTerms: string[];
};

const AUTOPLAY_GENRE_CONFIG = {
  pop: {
    displayName: "Pop",
    searchTerms: [
      "pop hits 2024 official music video",
      "top pop songs official",
      "pop music video official hd"
    ]
  },
  rock: {
    displayName: "Rock",
    searchTerms: [
      "rock hits official video",
      "modern rock music official",
      "classic rock songs official"
    ]
  },
  hiphop: {
    displayName: "Hip-Hop",
    searchTerms: [
      "hip hop songs official video",
      "rap hits 2024 official",
      "hip hop music official"
    ]
  },
  electronic: {
    displayName: "Electronic",
    searchTerms: [
      "edm music official",
      "electronic dance music 2024",
      "house music official video"
    ]
  },
  jazz: {
    displayName: "Jazz",
    searchTerms: [
      "smooth jazz music official",
      "coffee jazz official",
      "jazz classics official"
    ]
  },
  classical: {
    displayName: "Classical",
    searchTerms: [
      "classical music masterpiece official",
      "symphony orchestra official",
      "classical piano official"
    ]
  },
  metal: {
    displayName: "Metal",
    searchTerms: [
      "metal music official video",
      "heavy metal official",
      "metalcore official video"
    ]
  },
  country: {
    displayName: "Country",
    searchTerms: [
      "country music official video",
      "country hits 2024 official",
      "country songs official"
    ]
  },
  rnb: {
    displayName: "R&B",
    searchTerms: [
      "rnb music official",
      "r&b hits 2024 official",
      "soul rnb official video"
    ]
  },
  indie: {
    displayName: "Indie",
    searchTerms: [
      "indie music official",
      "indie pop official video",
      "indie rock official"
    ]
  },
  latin: {
    displayName: "Latin",
    searchTerms: [
      "latin music official",
      "reggaeton official video",
      "latin hits 2024 official"
    ]
  },
  kpop: {
    displayName: "K-Pop",
    searchTerms: [
      "kpop official mv",
      "korean pop music official",
      "kpop songs 2024 mv"
    ]
  },
  anime: {
    displayName: "Anime",
    searchTerms: [
      "anime opening official",
      "anime songs official",
      "best anime op official"
    ]
  },
  lofi: {
    displayName: "Lo-Fi",
    searchTerms: [
      "lofi hip hop music",
      "lofi beats official",
      "chill lofi music official"
    ]
  },
  blues: {
    displayName: "Blues",
    searchTerms: [
      "blues music official",
      "blues guitar official",
      "blues classics official"
    ]
  },
  reggae: {
    displayName: "Reggae",
    searchTerms: [
      "reggae music official",
      "roots reggae official",
      "reggae classics official"
    ]
  },
  disco: {
    displayName: "Disco",
    searchTerms: [
      "disco music official",
      "70s disco official",
      "nu disco official"
    ]
  },
  punk: {
    displayName: "Punk",
    searchTerms: [
      "punk rock official video",
      "pop punk official",
      "punk music video official"
    ]
  },
  ambient: {
    displayName: "Ambient",
    searchTerms: [
      "ambient music official",
      "ambient chill official",
      "ambient soundscapes official"
    ]
  },
  random: {
    displayName: "Random",
    searchTerms: []
  }
} as const satisfies Record<string, AutoplayGenreConfig>;

export type AutoplayGenre = keyof typeof AUTOPLAY_GENRE_CONFIG;
type BaseAutoplayGenre = Exclude<AutoplayGenre, "random">;
export type LoopMode = "off" | "track" | "queue";

export const AUTOPLAY_GENRES = Object.keys(
  AUTOPLAY_GENRE_CONFIG
) as AutoplayGenre[];

const BASE_AUTOPLAY_GENRES = AUTOPLAY_GENRES.filter(
  (genre): genre is BaseAutoplayGenre => genre !== "random"
);

export const AUTOPLAY_GENRE_LABELS: Record<AutoplayGenre, string> =
  Object.fromEntries(
    AUTOPLAY_GENRES.map((genre) => [
      genre,
      AUTOPLAY_GENRE_CONFIG[genre].displayName
    ])
  ) as Record<AutoplayGenre, string>;

const AUTOPLAY_FORBIDDEN_KEYWORDS = [
  "tutorial",
  "lesson",
  "course",
  "how to",
  "how-to",
  "guide",
  "podcast",
  "interview",
  "talk",
  "speech",
  "lecture",
  "review",
  "unboxing",
  "reaction",
  "gameplay",
  "full movie",
  "full album",
  "documentary",
  "asmr",
  "audiobook",
  "story",
  "meditation",
  "mix",
  "compilation",
  "dj set",
  "live set"
];

const MAX_AUTOPLAY_EMOJIS = 4;
const MAX_AUTOPLAY_BRACKETS = 4;
const MIN_AUTOPLAY_DURATION_MS = 30_000;
const MAX_AUTOPLAY_DURATION_MS = 600_000;
const AUTOPLAY_EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

export type QueueRequester = {
  id: string;
  name: string;
};

type LavalinkTrackInfo = {
  identifier: string;
  title: string;
  author: string;
  uri?: string;
  length: number;
  sourceName: string;
  artworkUrl?: string | null;
  isStream: boolean;
  isSeekable: boolean;
  position: number;
  isrc?: string | null;
};

export type QueueItem = {
  encoded: string;
  info: LavalinkTrackInfo;
  requester?: QueueRequester;
  autoplay?: {
    genre: BaseAutoplayGenre;
    query: string;
    displayName: string;
  };
};

export type AutoplayState = {
  enabled: boolean;
  genre?: AutoplayGenre;
};

type GuildQueue = {
  player: Player;
  current?: QueueItem;
  items: QueueItem[];
  voiceChannelId?: string;
  loopMode: LoopMode;
  autoplay: AutoplayState;
  volume: number;
};

export type GuildQueueState = GuildQueue;

const LOOP_SEQUENCE: LoopMode[] = ["off", "track", "queue"];

export class MusicService {
  readonly shoukaku: Shoukaku;
  private readonly queues = new Map<string, GuildQueue>();

  constructor(
    private readonly client: Client,
    private readonly config: AppConfig
  ) {
    this.shoukaku = new Shoukaku(
      new Connectors.DiscordJS(client),
      [
        {
          name: "main",
          url: `${config.LAVALINK_HOST}:${config.LAVALINK_PORT}`,
          auth: config.LAVALINK_PASSWORD,
          secure: config.LAVALINK_SECURE
        }
      ],
      {
        resume: true,
        resumeTimeout: 60,
        reconnectTries: 4
      }
    );

    this.shoukaku.on("ready", (name) => {
      console.log(`[Shoukaku] Node ${name} ready`);
    });

    this.shoukaku.on("error", (name, error) => {
      console.error(`[Shoukaku] Node ${name} error`, error);
    });

    this.shoukaku.on("close", (name, code, reason) => {
      console.warn(
        `[Shoukaku] Node ${name} closed with code ${code} (${reason})`
      );
    });
  }

  async play(
    guildId: string,
    channelId: string,
    query: string,
    requester?: QueueRequester
  ) {
    const player = await this.getOrCreatePlayer(guildId, channelId);
    const queue = this.getOrCreateQueue(guildId, player);
    queue.voiceChannelId = channelId;

    const identifier = this.normalizeIdentifier(query);
    const response = await player.node.rest.resolve(identifier);

    if (!response) {
      throw new Error("No tracks found for the provided query");
    }

    const tracks = this.normalizeTracks(response);

    if (tracks.length === 0) {
      throw new Error("No tracks found for the provided query");
    }

    const track = tracks[0];
    const queueItem = this.buildQueueItem(track, requester);

    queue.items.push(queueItem);

    if (!queue.current) {
      await this.playNext(guildId);
    }

    return queueItem;
  }

  async skip(guildId: string) {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("No active queue for that guild");
    await queue.player.stopTrack();
  }

  async stop(guildId: string) {
    const queue = this.queues.get(guildId);
    if (!queue) return;
    queue.items = [];
    queue.current = undefined;
    queue.loopMode = "off";
    queue.autoplay = { enabled: false };
    await queue.player.stopTrack();
    await this.disconnect(guildId);
  }

  async shuffle(guildId: string) {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("ไม่มีคิวเพลงสำหรับเซิร์ฟเวอร์นี้");
    if (queue.items.length < 2) {
      throw new Error("จำเป็นต้องมีอย่างน้อยสองเพลงเพื่อสับคิว");
    }

    this.shuffleInPlace(queue.items);

    return queue.items;
  }

  async setVolume(guildId: string, volume: number) {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("ไม่มีคิวเพลงสำหรับเซิร์ฟเวอร์นี้");
    const normalized = Math.max(0, Math.min(volume, 100));
    queue.volume = normalized;
    await queue.player.setGlobalVolume(normalized);
    return normalized;
  }

  cycleLoopMode(guildId: string): LoopMode {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("ไม่มีคิวเพลงสำหรับเซิร์ฟเวอร์นี้");
    const index = LOOP_SEQUENCE.indexOf(queue.loopMode);
    const next = LOOP_SEQUENCE[(index + 1) % LOOP_SEQUENCE.length];
    queue.loopMode = next;
    return queue.loopMode;
  }

  setAutoplay(guildId: string, options: AutoplayState) {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("ไม่มีคิวเพลงสำหรับเซิร์ฟเวอร์นี้");

    if (!options.enabled) {
      queue.autoplay = { enabled: false };
      return queue.autoplay;
    }

    if (options.genre && !AUTOPLAY_GENRE_CONFIG[options.genre]) {
      throw new Error("ไม่รู้จักแนวเพลงสำหรับ Autoplay");
    }

    const targetGenre =
      options.genre ?? queue.autoplay.genre ?? ("random" as AutoplayGenre);

    queue.autoplay = {
      enabled: true,
      genre: targetGenre
    };

    return queue.autoplay;
  }

  async toggleAutoplayGenre(guildId: string): Promise<AutoplayState> {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("ไม่มีคิวเพลงสำหรับเซิร์ฟเวอร์นี้");

    if (!queue.autoplay.enabled || !queue.autoplay.genre) {
      queue.autoplay = { enabled: true, genre: "lofi" };
      return queue.autoplay;
    }

    const currentIndex = AUTOPLAY_GENRES.indexOf(queue.autoplay.genre);
    const nextGenre =
      AUTOPLAY_GENRES[(currentIndex + 1) % AUTOPLAY_GENRES.length];

    queue.autoplay = { enabled: true, genre: nextGenre };

    return queue.autoplay;
  }

  getQueue(guildId: string) {
    return this.queues.get(guildId);
  }

  async setPaused(guildId: string, paused: boolean) {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("ไม่มีคิวเพลงสำหรับเซิร์ฟเวอร์นี้");
    await queue.player.setPaused(paused);
    return queue.player.paused;
  }

  async togglePause(guildId: string) {
    const queue = this.queues.get(guildId);
    if (!queue) throw new Error("ไม่มีคิวเพลงสำหรับเซิร์ฟเวอร์นี้");
    const targetState = !queue.player.paused;
    await queue.player.setPaused(targetState);
    return queue.player.paused;
  }

  private async playNext(guildId: string) {
    const queue = this.queues.get(guildId);
    if (!queue) return;

    let next = queue.items.shift();

    if (!next && queue.loopMode === "track" && queue.current) {
      next = queue.current;
    }

    if (!next && queue.autoplay.enabled) {
      next = await this.generateAutoplayTrack(guildId, queue);
    }

    if (!next) {
      queue.current = undefined;
      await this.disconnect(guildId);
      return;
    }

    queue.current = next;
    try {
      await queue.player.playTrack({
        track: {
          encoded: next.encoded
        }
      });
    } catch (error) {
      console.error(
        `[Shoukaku] Failed to play track in guild ${guildId}, skipping`,
        error
      );
      queue.current = undefined;
      void this.playNext(guildId);
    }
  }

  private getOrCreateQueue(guildId: string, player: Player): GuildQueue {
    const existing = this.queues.get(guildId);
    if (existing) return existing;

    const queue: GuildQueue = {
      player,
      current: undefined,
      items: [],
      loopMode: "off",
      autoplay: { enabled: false },
      volume: 100
    };

    void queue.player.setGlobalVolume(queue.volume);

    player.on("end", (event) => {
      const activeQueue = this.queues.get(guildId);
      if (!activeQueue) return;

      const reason = event?.reason ?? "unknown";

      if (
        reason === "replaced" ||
        reason === "cleanup" ||
        reason === "stopped"
      ) {
        void this.playNext(guildId);
        return;
      }

      if (
        reason === "finished" &&
        activeQueue.loopMode === "queue" &&
        activeQueue.current
      ) {
        activeQueue.items.push(activeQueue.current);
      }

      void this.playNext(guildId);
    });

    player.on("closed", () => {
      this.queues.delete(guildId);
    });

    player.on("exception", (event) => {
      console.error(
        `[Shoukaku] Player exception in guild ${guildId}`,
        event.exception
      );
      void this.playNext(guildId);
    });

    player.on("stuck", (event) => {
      console.warn(
        `[Shoukaku] Track got stuck in guild ${guildId}, threshold ${event.thresholdMs}ms`
      );
      void this.playNext(guildId);
    });

    this.queues.set(guildId, queue);
    return queue;
  }

  private async getOrCreatePlayer(guildId: string, channelId: string) {
    const existing = this.shoukaku.players.get(guildId);
    if (existing) return existing;

    const channel = await this.fetchVoiceChannel(channelId);
    if (!channel) {
      throw new Error("Voice channel not found or is not a guild voice channel");
    }

    const guild = channel.guild;

    return this.shoukaku.joinVoiceChannel({
      guildId,
      channelId,
      shardId: guild.shardId,
      deaf: true
    });
  }

  private async disconnect(guildId: string) {
    this.queues.delete(guildId);
    try {
      await this.shoukaku.leaveVoiceChannel(guildId);
    } catch (error) {
      console.warn(
        `[Shoukaku] Failed to leave voice channel for guild ${guildId}`,
        error
      );
    }
  }

  private async fetchVoiceChannel(channelId: string) {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (
      !channel ||
      !("isVoiceBased" in channel) ||
      typeof channel.isVoiceBased !== "function" ||
      !channel.isVoiceBased()
    ) {
      return null;
    }

    if (!("guildId" in channel)) return null;

    return channel as VoiceChannel | StageChannel;
  }

  private async generateAutoplayTrack(
    guildId: string,
    queue: GuildQueue
  ): Promise<QueueItem | undefined> {
    if (!queue.autoplay.enabled) return undefined;

    const searchPlan = this.buildAutoplaySearchPlan(queue.autoplay.genre).slice(
      0,
      30
    );

    for (const { genre, query } of searchPlan) {
      const displayName = AUTOPLAY_GENRE_CONFIG[genre].displayName;
      this.logAutoplay(
        guildId,
        `🎲 กำลังค้นหาเพลงแนว ${displayName} ด้วยคำค้น "${query}"`
      );

      let response: LavalinkResponse | undefined;
      try {
        response = await queue.player.node.rest.resolve(query);
      } catch (error) {
        this.logAutoplay(
          guildId,
          `⚠️ Lavalink error ขณะค้นหา "${query}": ${String(error)}`
        );
        continue;
      }
      if (!response) {
        this.logAutoplay(guildId, `⚠️ ไม่ได้รับผลลัพธ์จาก "${query}"`);
        continue;
      }

      const filtered = this
        .normalizeTracks(response)
        .filter((track) => this.isAutoplayTrackEligible(track));

      if (filtered.length === 0) {
        this.logAutoplay(
          guildId,
          `⚠️ ไม่มีเพลงที่ผ่านการกรองสำหรับ "${query}"`
        );
        continue;
      }

      const selected =
        filtered.find((track) =>
          (track.info.title ?? "").toLowerCase().includes("official")
        ) ?? filtered[0];

      const durationSeconds = Math.round(selected.info.length / 1000);
      this.logAutoplay(
        guildId,
        `✅ เลือก "${selected.info.title}" (${durationSeconds}s)`
      );

      const queueItem = this.buildQueueItem(
        selected,
        {
          id: "autoplay",
          name: `Autoplay (${displayName})`
        },
        {
          genre,
          query
        }
      );

      return queueItem;
    }

    this.logAutoplay(
      guildId,
      "⚠️ Autoplay ไม่พบเพลงที่เหมาะสมหลังจากลองทุกคำค้น"
    );
    return undefined;
  }

  private buildQueueItem(
    track: LavalinkTrack,
    requester?: QueueRequester,
    autoplayMeta?: { genre: BaseAutoplayGenre; query: string }
  ): QueueItem {
    const autoplayInfo = autoplayMeta
      ? {
          genre: autoplayMeta.genre,
          query: autoplayMeta.query,
          displayName: AUTOPLAY_GENRE_CONFIG[autoplayMeta.genre].displayName
        }
      : undefined;

    return {
      encoded: track.encoded,
      info: {
        identifier: track.info.identifier,
        title: track.info.title,
        author: track.info.author,
        uri: track.info.uri ?? undefined,
        length: track.info.length,
        sourceName: track.info.sourceName,
        artworkUrl: track.info.artworkUrl ?? undefined,
        isStream: track.info.isStream,
        isSeekable: track.info.isSeekable,
        position: track.info.position,
        isrc: track.info.isrc ?? undefined
      },
      requester,
      autoplay: autoplayInfo
    };
  }

  private normalizeTracks(response: LavalinkResponse): LavalinkTrack[] {
    switch (response.loadType) {
      case LoadType.TRACK:
        return [response.data];
      case LoadType.SEARCH:
        return response.data;
      case LoadType.PLAYLIST:
        return response.data.tracks;
      case LoadType.EMPTY:
        return [];
      case LoadType.ERROR:
        throw new Error(
          `Lavalink error: ${response.data.message} (${response.data.severity})`
        );
      default:
        return [];
    }
  }

  private normalizeIdentifier(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error("The provided query is empty");
    }

    const lowered = trimmed.toLowerCase();

    if (
      lowered.startsWith("http://") ||
      lowered.startsWith("https://") ||
      lowered.startsWith("ytsearch:") ||
      lowered.startsWith("ytmsearch:") ||
      lowered.startsWith("scsearch:")
    ) {
      return trimmed;
    }

    return `ytsearch:${trimmed}`;
  }

  private buildAutoplaySearchPlan(
    genre?: AutoplayGenre
  ): Array<{ genre: BaseAutoplayGenre; query: string }> {
    const targetGenres: BaseAutoplayGenre[] =
      genre && genre !== "random"
        ? [genre as BaseAutoplayGenre]
        : this.shuffled(BASE_AUTOPLAY_GENRES);

    const plan: Array<{ genre: BaseAutoplayGenre; query: string }> = [];

    for (const baseGenre of targetGenres) {
      const config = AUTOPLAY_GENRE_CONFIG[baseGenre];
      const queries = this.shuffled(config.searchTerms);
      for (const term of queries) {
        plan.push({
          genre: baseGenre,
          query: this.prepareAutoplayQuery(term)
        });
      }
    }

    return plan;
  }

  private prepareAutoplayQuery(term: string): string {
    const trimmed = term.trim();
    if (!trimmed) {
      return "ytsearch:music";
    }

    const lowered = trimmed.toLowerCase();
    if (
      lowered.startsWith("ytsearch:") ||
      lowered.startsWith("ytmsearch:") ||
      lowered.startsWith("scsearch:") ||
      lowered.startsWith("http://") ||
      lowered.startsWith("https://")
    ) {
      return trimmed;
    }

    return `ytsearch:${trimmed}`;
  }

  private isAutoplayTrackEligible(track: LavalinkTrack) {
    const { info } = track;
    const length = info.length ?? 0;
    if (info.isStream) return false;
    if (length < MIN_AUTOPLAY_DURATION_MS || length > MAX_AUTOPLAY_DURATION_MS) {
      return false;
    }

    const title = (info.title ?? "").toLowerCase();
    const normalizedTitle = title.replace(/[-_]/g, " ");

    if (
      AUTOPLAY_FORBIDDEN_KEYWORDS.some((keyword) =>
        normalizedTitle.includes(keyword)
      )
    ) {
      return false;
    }

    const bracketCount = (info.title.match(/[\[\](){}]/g) ?? []).length;
    if (bracketCount > MAX_AUTOPLAY_BRACKETS) return false;

    const emojiCount = (info.title.match(AUTOPLAY_EMOJI_REGEX) ?? []).length;
    if (emojiCount > MAX_AUTOPLAY_EMOJIS) return false;

    return true;
  }

  private shuffleInPlace<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private shuffled<T>(array: T[]): T[] {
    const copy = [...array];
    this.shuffleInPlace(copy);
    return copy;
  }

  private logAutoplay(guildId: string, message: string) {
    console.log(`[Autoplay][${guildId}] ${message}`);
  }
}
