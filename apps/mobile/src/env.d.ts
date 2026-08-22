/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Set to "off" at build time to drop the Mermaid renderer from the bundle. */
  readonly PUBLIC_PNA_DIAGRAMS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
