import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.patrickdoig.rugbymanager',
  appName: 'Rugby Manager',
  // Vite's production output. Build it with `npm run build:cap` (relative
  // base) before `cap sync`, never the GitHub Pages `npm run build`.
  webDir: 'dist',
  // Dark webview backing colour matches the app + launch screen so there is
  // no white flash between the splash hiding and the first paint.
  backgroundColor: '#040704',
  ios: {
    backgroundColor: '#040704',
  },
  plugins: {
    SplashScreen: {
      // We hide it from main.ts once the shell has rendered, so the splash
      // holds (no spinner, dark bg matching the app) until the UI is ready.
      launchAutoHide: false,
      backgroundColor: '#040704',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
