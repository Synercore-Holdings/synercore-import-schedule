import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const TUNNEL_HOST = process.env.VITE_TUNNEL_HOST ?? "";

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(process.env.VITE_SENTRY_DSN),
  },
  server: {
    port: 3002,
    host: '0.0.0.0',
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'f5797077a9ef.ngrok-free.app',
      /\.ngrok(-free)?\.app$/
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false
      }
    },
    hmr: TUNNEL_HOST ? { protocol: 'wss', host: TUNNEL_HOST, clientPort: 443 } : true
  },
  build: {
    outDir: 'dist',
    minify: 'terser',
    target: 'ES2020',
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 600,
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      input: {
        main: './index.html',
        supplier: './supplier.html'
      },
      output: {
        manualChunks: (id) => {
          // Split node_modules into separate chunks
          if (id.includes('node_modules')) {
            if (id.includes('react')) {
              return 'react-vendor';
            }
            if (id.includes('chart.js') || id.includes('react-chartjs') || id.includes('jspdf')) {
              return 'chart-vendor';
            }
            // zustand/socket.io share transitive deps (e.g. `debug`) that don't match
            // these filters — splitting them into their own chunk breaks their
            // cross-chunk init order (circular chunk import). Let them fall into
            // the general vendor chunk with their dependencies instead.
            return 'vendor';
          }
          // Let React.lazy() handle component code-splitting automatically
          // Only group shared utilities together
          if (id.includes('utils') || id.includes('services')) {
            return 'utils';
          }
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
// Deployment timestamp: 2025-10-06

