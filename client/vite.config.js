import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Uncomment and point at your LAN IP to test phone <-> PC pairing
    // across devices on the same network during development:
    // host: '0.0.0.0',
  },
});
