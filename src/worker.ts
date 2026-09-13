import { WorkerEntrypoint } from "cloudflare:workers";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { accessAuthHandler } from "./auth/access-handler.js";
import { instapaperCredentialsFromEnv, type Env } from "./env.js";
import { createServer } from "./mcp/server.js";

class McpApiHandler extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const handler = createMcpHandler(() => createServer(instapaperCredentialsFromEnv(this.env)), {
      route: "/mcp",
    });
    return handler(request, this.env, this.ctx);
  }
}

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: McpApiHandler,
  defaultHandler: accessAuthHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  allowPlainPKCE: false,
});
