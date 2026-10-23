import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // changeOrigin must stay off: the API compares the browser's Origin with the Host it receives, so Host has to remain the dev server's.
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } } },
});
