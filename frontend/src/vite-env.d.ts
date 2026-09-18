/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_MAPBOX_STYLE?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BACKEND_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
