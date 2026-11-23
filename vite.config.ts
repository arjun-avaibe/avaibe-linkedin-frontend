import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Sample data (no backend) in `npm run dev` and `--mode sample`; the backend in `npm run dev:api` and production.
  // Replaced at build time, so production builds leave the sample data out entirely (see src/lib/data-source.ts).
  define: { __SAMPLE_DATA__: JSON.stringify(mode === 'development' || mode === 'sample') },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // TUNNEL_HOSTS (e.g. ".trycloudflare.com") lets a shared demo copy be opened through a tunnel link
    allowedHosts: process.env.TUNNEL_HOSTS ? process.env.TUNNEL_HOSTS.split(',') : undefined,
    // Forward API calls to the FastAPI backend during development
    // API_TARGET lets a second dev copy point at another backend (e.g. a test database)
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://127.0.0.1:8000',
      // Django admin panel and its static files
      '/admin': process.env.API_TARGET ?? 'http://127.0.0.1:8000',
      '/static': process.env.API_TARGET ?? 'http://127.0.0.1:8000',
    },
  },
}))
