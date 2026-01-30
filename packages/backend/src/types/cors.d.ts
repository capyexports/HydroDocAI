declare module "cors" {
  import type { RequestHandler } from "express";
  interface CorsOptions {
    origin?: boolean | string | RegExp | string[] | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void);
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  }
  function cors(options?: CorsOptions): RequestHandler;
  export = cors;
}
