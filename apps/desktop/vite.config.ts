import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri renders in the OS web view: WebView2 (Chromium) on Windows, WebKit on macOS and Linux.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: ['chrome111', 'safari16'],
  },
});
