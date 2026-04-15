// @ts-nocheck - vite config, runs via npm:vite which has its own resolution
import { defineConfig } from 'vite'
import deno from '@deno/vite-plugin'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    deno(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // Using our own public/manifest.json
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/manifest\.json$/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60, // 5 minutes
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Map Deno import map specifiers to npm paths for Vite's bundler
    conditions: ['browser', 'import', 'module', 'default'],
  },
  optimizeDeps: {
    // Ensure react/jsx-runtime is pre-bundled by Vite
    include: [
      '@supabase/supabase-js',
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'react-markdown',
      'react-swipeable',
    ],
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
