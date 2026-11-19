import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// In development, API calls to /api are forwarded to the Flask backend on port 5000
// (in Docker, nginx does the same job - see nginx.conf).
const backend = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Keep the large chart library in its own cached file.
        manualChunks: { react: ['react', 'react-dom'], charts: ['recharts'] },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/check_spam': { target: backend, changeOrigin: true },
    },
  },
})
