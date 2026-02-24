import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dir, 'src/index.ts'),
        'jsx-runtime': resolve(__dir, 'src/jsx-runtime.ts'),
        'jsx-dev-runtime': resolve(__dir, 'src/jsx-dev-runtime.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        `${entryName}.${format === 'es' ? 'mjs' : 'js'}`,
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
