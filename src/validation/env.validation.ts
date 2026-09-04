import z from "zod";

export const envSchema = z.object({
  VITE_APP_ENV: z.enum(["development", "production"]).default("development"),
  VITE_API_BASE_URL: z.url().nonoptional("BASE URL IS REQUIRED"),
  VITE_APP_NAME: z
    .string()
    .nonoptional("APP NAME IS REQUIRED")
    .default("PiDRIVE"),
});
