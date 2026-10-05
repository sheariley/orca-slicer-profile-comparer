import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The fixtures live in packages/core, outside this app's folder.
    fs: { allow: ['../..'] },
  },
});
