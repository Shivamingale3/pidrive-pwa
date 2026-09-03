import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig, loadEnv } from "vite";
import path from "path";
import { envSchema } from "./src/validation/env.validation.ts";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const result = envSchema.safeParse(env);

  if (!result.success) {
    console.error("\n❌ Environment variable validation failed:\n");
    for (const issue of result.error.issues) {
      const varName = issue.path.join(".") || "env";
      console.error(`  • ${varName}: ${issue.message}`);
    }
    console.error("\nPlease check your .env configuration and fix the variable errors above.\n");
    process.exit(1);
  }

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
});
