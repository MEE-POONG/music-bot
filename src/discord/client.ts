import { Client, GatewayIntentBits, Partials } from "discord.js";

export const createDiscordClient = () =>
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages
    ],
    partials: [Partials.Channel]
  });
