import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@alterego\/([a-z-]+)$/,
        replacement: path.resolve(here, 'src/$1/index.ts'),
      },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
