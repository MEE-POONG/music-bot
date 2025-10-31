import { Elysia, t } from "elysia";
import type { MusicService } from "../services/musicService";

export const musicRoutes = (musicService: MusicService) =>
  new Elysia({ prefix: "/music" })
    .post(
      "/play",
      async ({ body }) => {
        const requester = body.requester
          ? { id: body.requester, name: body.requester }
          : undefined;

        const track = await musicService.play(
          body.guildId,
          body.channelId,
          body.query,
          requester
        );

        return {
          message: "Track enqueued",
          track
        };
      },
      {
        body: t.Object({
          guildId: t.String({ minLength: 1 }),
          channelId: t.String({ minLength: 1 }),
          query: t.String({ minLength: 1 }),
          requester: t.Optional(t.String())
        })
      }
    )
    .post(
      "/skip",
      async ({ body }) => {
        await musicService.skip(body.guildId);
        return { message: "Skipped current track" };
      },
      {
        body: t.Object({
          guildId: t.String({ minLength: 1 })
        })
      }
    )
    .post(
      "/stop",
      async ({ body }) => {
        await musicService.stop(body.guildId);
        return { message: "Stopped playback and disconnected" };
      },
      {
        body: t.Object({
          guildId: t.String({ minLength: 1 })
        })
      }
    )
    .get("/queue/:guildId", ({ params }) => {
      const queue = musicService.getQueue(params.guildId);
      if (!queue) {
        return {
          guildId: params.guildId,
          status: "idle",
          loopMode: "off",
          autoplay: { enabled: false },
          volume: 100
        };
      }

      return {
        guildId: params.guildId,
        status: queue.current
          ? queue.player.paused
            ? "paused"
            : "playing"
          : "idle",
        paused: queue.player.paused,
        loopMode: queue.loopMode,
        autoplay: queue.autoplay,
        volume: queue.volume,
        voiceChannelId: queue.voiceChannelId,
        current: queue.current,
        upcoming: queue.items
      };
    });
