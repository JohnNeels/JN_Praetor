import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/orchestrator': { target: 'http://localhost:8000', changeOrigin: true, rewrite: p => p.replace(/^\/api\/orchestrator/, '') },
      '/api/budget':       { target: 'http://localhost:8100', changeOrigin: true, rewrite: p => p.replace(/^\/api\/budget/, '') },
      '/api/mcp':          { target: 'http://localhost:9000', changeOrigin: true, rewrite: p => p.replace(/^\/api\/mcp/, '') },
    },
  },
})
