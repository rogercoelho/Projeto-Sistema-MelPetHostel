import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const VITE_API_URL = env.VITE_API_URL || "http://localhost:3001";
  const useProxy = env.VITE_USE_PROXY === "true";

  return defineConfig({
    plugins: [react()],
    base: "./",
    server: useProxy
      ? {
          proxy: {
            "/api": {
              target: VITE_API_URL,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => path.replace(/^\/api/, ""),
            },
          },
        }
      : {},
  });
};
