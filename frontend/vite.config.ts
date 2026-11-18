/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/** KEY=VALUE pairs of an env file (comments and blank lines skipped). */
function readEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

// Settings: .env.example is the base, .env (and the environment) override it,
// the same way the backend reads its settings.
export default defineConfig(({ mode }) => {
  const env = {
    ...readEnvFile(".env.example"),
    ...loadEnv(mode, process.cwd(), ""),
  };
  const port = Number(env.FRONTEND_PORT);
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL),
    },
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.VITE_API_BASE_URL || "http://127.0.0.1:8001",
          ws: true,
        },
      },
    },
    preview: { port, strictPort: true },
    test: { environment: "node" },
  };
});
