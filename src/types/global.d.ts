/** Global type augmentations for BackSilence. */

/** Vite import.meta.env typing. */
interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly VITE_NET_PROVIDER?: string;
  readonly VITE_NET_URL?: string;
  readonly VITE_NET_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?worker&url' {
  const src: string;
  export default src;
}

