import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
})
