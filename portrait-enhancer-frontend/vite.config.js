import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://localhost:4000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          // Must match or exceed backend REQUEST_TIMEOUT_MS (10 min).
          // GFPGAN + Real-ESRGAN load large model weights on first run —
          // default 60s proxy timeout kills those requests prematurely.
          timeout:      600_000,   // 10 min socket idle timeout
          proxyTimeout: 600_000,   // 10 min upstream response timeout
        },
      },
    },
  };
});
