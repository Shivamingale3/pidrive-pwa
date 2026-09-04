import z from "zod";

export const envSchema = z.object({
  VITE_APP_ENV: z.enum(["development", "production"]).default("development"),
  VITE_API_BASE_URL: z.string().url("BASE URL IS REQUIRED"),
  VITE_APP_NAME: z.string().default("PiDRIVE"),
});
