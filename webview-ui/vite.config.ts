import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  base: '',
  build: {
    outDir: path.resolve(__dirname, '../media/webview'),
    emptyOutDir: true,
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
});
