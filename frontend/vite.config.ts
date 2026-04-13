/// <reference types="vitest/config" />

import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const isTest = process.env.VITEST === 'true'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ingest': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
        secure: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    !isTest && tanstackStart(),
    viteReact(),
  ].filter(Boolean),
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
