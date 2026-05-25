import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  envDir: process.env.FAMILY_LEDGER_WEB_ENV_DIR ?? fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [react()]
});
