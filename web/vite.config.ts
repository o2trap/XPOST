import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  // `npm run dev -w web` proxies the API to a local `wrangler dev` (port 8787).
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
