import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    browser: 'src/entries/browser.ts',
    node: 'src/entries/node.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
});
