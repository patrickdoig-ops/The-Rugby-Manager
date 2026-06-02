/// <reference types="vite/client" />

// Fallback augmentation for environments where vite is not locally installed
// (e.g. CI type-check with a global tsc). Vite's client.d.ts declares the same
// interface, so this is a no-op when vite resolves normally.
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
  [key: string]: string | boolean | undefined;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time constants injected by vite.config.ts via `define`.
declare const __BUILD_VERSION__: string;
declare const __BUILD_DATE__: string;
