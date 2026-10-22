import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin /api in dev, just like nginx in production, so the auth cookie just works.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
