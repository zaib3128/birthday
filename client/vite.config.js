import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// While you develop, calls to /api are sent to the Express server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
});
