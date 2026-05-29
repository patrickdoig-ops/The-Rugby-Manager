import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

let buildVersion = 'dev';
try {
  buildVersion = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // git unavailable — leave fallback
}
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig(({ mode }) => ({
  root: '.',
  publicDir: 'public',
  // GitHub Pages serves from the /Rugby-Simulator-/ sub-path; the Capacitor
  // native shell serves from the bundle root (capacitor://localhost), so it
  // needs relative asset URLs. `npm run build:cap` passes `--mode capacitor`.
  base: mode === 'capacitor' ? './' : '/Rugby-Simulator-/',
  build: { outDir: 'dist', target: 'es2022' },
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
}));
