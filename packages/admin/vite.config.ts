import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: '/admin',
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/cms': 'http://localhost:5500',
      '/api': 'http://localhost:5500',
    },
  },
  build: {
    outDir: '../core/public/admin',
    emptyOutDir: true,
  },
})
