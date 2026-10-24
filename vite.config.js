import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) }, // the version shown in the sidebar, on the sign-in page and under Settings > About
  // changeOrigin must stay off: the API compares the browser's Origin with the Host it receives, so Host has to remain the dev server's.
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } } },
});
