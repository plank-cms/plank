import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), react()],
  base: command === 'build' ? '/admin/' : '/',
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/cms': {
        target: 'http://localhost:5500',
        configure: (proxy) => {
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'ECONNREFUSED') console.error('[proxy]', err.message)
          })
        },
      },
      '/api': {
        target: 'http://localhost:5500',
        configure: (proxy) => {
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'ECONNREFUSED') console.error('[proxy]', err.message)
          })
        },
      },
    },
  },
  build: {
    outDir: '../core/public/admin',
    emptyOutDir: true,
  },
}))
