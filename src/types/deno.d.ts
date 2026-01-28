// Type declarations for Deno runtime and external modules used in Edge Functions
// Este arquivo é apenas para o TypeScript local, não é deployado

declare namespace Deno {
  export namespace env {
    export function get(key: string): string | undefined;
  }
  
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://deno.land/std@0.190.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare module "https://deno.land/x/denomailer@1.6.0/mod.ts" {
  export interface SMTPConfig {
    connection: {
      hostname: string;
      port: number;
      tls: boolean;
      auth: {
        username: string;
        password: string;
      };
    };
  }

  export interface EmailMessage {
    from: string;
    to: string | string[];
    subject: string;
    content: string;
    html: string;
  }

  export class SMTPClient {
    constructor(config: SMTPConfig);
    send(message: EmailMessage): Promise<void>;
    close(): Promise<void>;
  }
}