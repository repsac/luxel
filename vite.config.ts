import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    sourcemap: true,
    // Default warning threshold is 500 kB. A desktop Tauri app doesn't ship
    // over the wire, so chunk size matters far less than for a web app — we
    // bump the threshold to silence the warning while keeping the codemirror
    // editor chunk-split out via React.lazy() in ShaderEditor.tsx.
    chunkSizeWarningLimit: 1500,
  },
});
