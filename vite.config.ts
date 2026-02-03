import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      external: [],
      output: {
        manualChunks: undefined,
        inlineDynamicImports: false
      },
    },
    lib: {
      entry: 'src/main.ts',
      name: 'LocalTranslator',
      fileName: 'localtranslator',
      formats: ['iife'],
    },
  },
});
