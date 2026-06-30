/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // Base URL of the CPSV Editor, used for the DSO → DMN publish handoff deep-link.
  readonly VITE_CPSV_EDITOR_URL: string;
  // Add more env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
