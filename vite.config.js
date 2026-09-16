import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [preact()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  // The recognition worker is created lazily. Tell the development server
  // about its large dependencies up front so first use does not trigger a
  // dependency-optimization reload and discard the selected PDF.
  optimizeDeps: {
    include: [
      '@techstark/opencv-js',
      '@tensorflow-models/mobilenet',
      '@tensorflow/tfjs'
    ]
  }
})
