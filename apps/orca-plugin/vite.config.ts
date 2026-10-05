import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// OrcaSlicer loads plugin pages from an HTML string, so everything is inlined into one file.
// The page runs in the OS web view: WebView2 on Windows, WebKit on macOS and Linux.
export default defineConfig({
  root: 'web',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    target: ['chrome111', 'safari16'],
  },
});
