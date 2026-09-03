import type { EnvironmentVariables } from "@/types/env.types";

export const env: EnvironmentVariables = import.meta.env as unknown as EnvironmentVariables;
