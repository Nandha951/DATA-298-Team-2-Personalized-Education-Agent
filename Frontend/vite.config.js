import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves from /DATA-298-Team-2-Personalized-Education-Agent/
  // In dev (no BASE_URL set) this stays '/' so the proxy still works.
  base: process.env.BASE_URL || '/',
  server: {
    proxy: {
      '/api/llamaparse': {
        target: 'https://api.cloud.llamaindex.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llamaparse/, '/api/parsing')
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})
