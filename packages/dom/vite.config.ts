import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dir, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
    },
    outDir: 'dist',
    rollupOptions: {
      external: ['@quon/core'],
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'quon',
  },
  resolve: {
    alias: [
      {
        find: 'quon/jsx-runtime',
        replacement: resolve(__dir, './src/jsx-runtime.ts'),
      },
      {
        find: 'quon/jsx-dev-runtime',
        replacement: resolve(__dir, './src/jsx-dev-runtime.ts'),
      },
      {
        find: 'quon',
        replacement: resolve(__dir, './src/index.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
