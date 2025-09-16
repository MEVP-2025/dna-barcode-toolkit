import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Vite dev server port
    strictPort: true, // Ensure the port is not changed if it's already in use 如果port被佔用就失敗，不自動換端口
    host: true,
  },
  base: './',
});
