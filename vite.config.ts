import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  // Keeps the parser's own `new URL(..., import.meta.url)` wasm lookup intact.
  optimizeDeps: { exclude: ["@rlrml/subtr-actor"] },
})
