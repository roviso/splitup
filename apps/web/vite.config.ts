import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Keep the browser's Host so Google sign-in sends people back to :5173, not the API port.
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } } },
});
