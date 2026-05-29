import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.patrickdoig.rugbymanager',
  appName: 'Rugby Manager',
  // Vite's production output. Build it with `npm run build:cap` (relative
  // base) before `cap sync`, never the GitHub Pages `npm run build`.
  webDir: 'dist',
};

export default config;
