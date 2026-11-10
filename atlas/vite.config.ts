import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { dataJsonPlugin } from './scripts/build/data-json'
import { DEV_API_PORT } from './scripts/lib/dev-port'

export default defineConfig({
  // относительные пути: сборка работает и в корне домена (Vercel), и по подпути (systems/dedrel/atlas/dist в Foundry)
  base: './',
  plugins: [preact(), dataJsonPlugin()],
  // /api → локальный dev-api (scripts/dev-api.ts)
  server: { proxy: { '/api': { target: `http://127.0.0.1:${DEV_API_PORT}`, changeOrigin: false } } },
  build: {
    // сам maplibre-gl весит около 1 МБ: выносим его в отдельный чанк и не считаем это предупреждением
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }] } },
    },
  },
})
