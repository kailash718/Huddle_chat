import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev mode: run `node server.js` in the project root, then `npm run dev` here.
// The proxy forwards API, uploads and websockets to the Huddle server.
const target = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': target,
      '/uploads': target,
      '/socket.io': { target, ws: true }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
