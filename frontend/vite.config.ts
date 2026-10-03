import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const httpsEnabled =
  process.env.HTTPS === '1' ||
  process.env.npm_lifecycle_event === 'dev:local:ssl'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(httpsEnabled ? [basicSsl()] : []),
  ],

  server: {
    host: '0.0.0.0',
    port: 5174,

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },

      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})