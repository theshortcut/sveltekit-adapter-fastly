/// <reference types="@fastly/js-compute" />
/// <reference types="@fastly/compute-js-static-publish" />

declare module 'SERVER' {
  export { Server } from '@sveltejs/kit';
}

declare module 'MANIFEST' {
  import { SSRManifest } from '@sveltejs/kit';

  export const manifest: SSRManifest;
  export const prerendered: Map<string, { file: string }>;
}

declare module 'STATICS' {
  export function getServer(): PublisherServer;
}

declare namespace App {
  export interface Platform {
    req: Request;
  }
}
