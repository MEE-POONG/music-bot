import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const stringArrayFromEnv = z.preprocess((value) => {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  return [];
}, z.array(z.string()));

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().optional(),
  LAVALINK_HOST: z.string().default("lavalink"),
  LAVALINK_PORT: z.coerce.number().default(2333),
  LAVALINK_PASSWORD: z.string().default("youshallnotpass"),
  LAVALINK_SECURE: booleanFromEnv.default(false),
  DJ_ROLE_IDS: stringArrayFromEnv.default([]),
  APP_PORT: z.coerce.number().default(3000)
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse({
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  LAVALINK_HOST: process.env.LAVALINK_HOST,
  LAVALINK_PORT: process.env.LAVALINK_PORT,
  LAVALINK_PASSWORD: process.env.LAVALINK_PASSWORD,
  LAVALINK_SECURE: process.env.LAVALINK_SECURE,
  DJ_ROLE_IDS: process.env.DJ_ROLE_IDS,
  APP_PORT: process.env.APP_PORT
});
