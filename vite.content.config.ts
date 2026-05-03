import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    target: 'chrome120',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { content: resolve(__dirname, 'src/content/content.ts') },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
        name: 'AltTextContent',
      },
    },
  },
});
