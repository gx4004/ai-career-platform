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
