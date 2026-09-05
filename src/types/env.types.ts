import type { z } from "zod";
import type { envSchema } from "@/validation/env.validation";

export type EnvironmentVariables = z.infer<typeof envSchema>;
