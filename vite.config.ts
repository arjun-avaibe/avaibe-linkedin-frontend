import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: { __SAMPLE_DATA__: JSON.stringify(mode === 'development' || mode === 'sample') },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    allowedHosts: process.env.TUNNEL_HOSTS ? process.env.TUNNEL_HOSTS.split(',') : undefined,
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://127.0.0.1:8000',
      '/admin': process.env.API_TARGET ?? 'http://127.0.0.1:8000',
      '/static': process.env.API_TARGET ?? 'http://127.0.0.1:8000',
    },
  },
}))
