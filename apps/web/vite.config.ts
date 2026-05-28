import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom")) {
            return "react-vendor";
          }

          if (id.includes("node_modules/@supabase")) {
            return "supabase";
          }

          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "charts";
          }

          if (id.includes("node_modules/lucide-react") || id.includes("node_modules/lucide")) {
            return "icons";
          }

          return undefined;
        }
      }
    }
  }
});
