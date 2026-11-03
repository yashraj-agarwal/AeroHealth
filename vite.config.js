import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from "node:url"

const proxy = {
  "/api": "http://localhost:3001",
  "/socket.io": { target: "http://localhost:3001", ws: true },
}
export default defineConfig({
  server: { proxy },
  preview: { proxy },
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})

