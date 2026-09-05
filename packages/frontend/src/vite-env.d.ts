/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // Base URL of the CPSV Editor, used for the DSO → DMN publish handoff deep-link.
  readonly VITE_CPSV_EDITOR_URL: string;
  // Commit SHA of the build, injected by the deploy workflows. Absent locally.
  readonly VITE_BUILD_SHA?: string;
  // GitHub Actions run number, injected by the deploy workflows. Absent locally.
  readonly VITE_BUILD_RUN?: string;
  // Add more env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
