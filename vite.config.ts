import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/Rugby-Simulator-/',
  build: { outDir: 'dist', target: 'es2022' },
});
