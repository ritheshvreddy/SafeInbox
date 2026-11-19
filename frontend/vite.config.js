import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }

  // In development, API calls to /api are forwarded to the Flask backend on port 5000
  // (in Docker, nginx does the same job - see nginx.conf).
  const backend = env.VITE_BACKEND_URL || 'http://127.0.0.1:5000'

  // Social networks need absolute URLs for the preview image. Use VITE_SITE_URL, or on Vercel
  // the production domain it provides automatically; otherwise fall back to relative URLs.
  const siteUrl = (
    env.VITE_SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  ).replace(/\/+$/, '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'safeinbox-site-url',
        transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
      },
    ],
    build: {
      rollupOptions: {
        output: {
          // Keep React in its own long-cached file.
          manualChunks: { react: ['react', 'react-dom'] },
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
  }
})
