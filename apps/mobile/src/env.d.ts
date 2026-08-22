/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Set to "off" at build time to drop the Mermaid renderer from the bundle. */
  readonly PUBLIC_PNA_DIAGRAMS?: string;
  /** Base URL of the accounts API. Empty or unset builds the app without sign-in. */
  readonly PUBLIC_PNA_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
