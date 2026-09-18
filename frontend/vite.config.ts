/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend origin. In local dev Vite proxies /api to it, so browser code only
// ever uses relative URLs - that keeps the app working behind any preview proxy
// (Vercel, e2b, Railway) without CORS or hardcoded hosts in the client.
const BACKEND_ORIGIN = process.env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Accept any Host header: required for sandboxed preview proxies and for
    // `vercel dev`-style tooling that rewrites the Host.
    allowedHosts: true,
    strictPort: false,
    proxy: {
      '/api': { target: BACKEND_ORIGIN, changeOrigin: true },
      '/health': { target: BACKEND_ORIGIN, changeOrigin: true },
      '/docs': { target: BACKEND_ORIGIN, changeOrigin: true },
      '/openapi.json': { target: BACKEND_ORIGIN, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // mapbox-gl is ~1.5MB on its own; keeping it in a separate chunk means the
        // dashboard and project pages never pay for it on first paint.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          mapbox: ['mapbox-gl', '@mapbox/mapbox-gl-draw'],
          charts: ['chart.js', 'react-chartjs-2'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
