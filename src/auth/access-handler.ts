import { Buffer } from "node:buffer";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Env } from "../env.js";

type OAuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

type StoredState = {
  oauthRequest: AuthRequest;
  codeVerifier: string;
  createdAt: number;
};

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256Base64url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

function parseJwt(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid ID token.");
  return {
    data: `${parts[0]}.${parts[1]}`,
    header: JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
    signature: Buffer.from(parts[2], "base64url"),
  };
}

async function verifyAccessIdToken(env: Env, token: string) {
  const jwt = parseJwt(token);
  const response = await fetch(env.ACCESS_JWKS_URL);
  if (!response.ok) throw new Error("Unable to load Cloudflare Access JWKS.");
  const { keys } = (await response.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
  const jwk = keys.find((key) => key.kid === jwt.header.kid);
  if (!jwk) throw new Error("Cloudflare Access signing key not found.");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    jwt.signature,
    new TextEncoder().encode(jwt.data),
  );
  if (!valid) throw new Error("Cloudflare Access ID token signature is invalid.");
  const now = Math.floor(Date.now() / 1000);
  if (typeof jwt.payload.exp !== "number" || jwt.payload.exp <= now) {
    throw new Error("Cloudflare Access ID token has expired.");
  }
  return jwt.payload as { sub: string; email?: string; name?: string; exp: number };
}

async function redirectToAccess(request: Request, env: OAuthEnv, oauthRequest: AuthRequest) {
  const state = crypto.randomUUID();
  const codeVerifier = randomVerifier();
  const codeChallenge = await sha256Base64url(codeVerifier);
  const stored: StoredState = { oauthRequest, codeVerifier, createdAt: Date.now() };
  await env.OAUTH_KV.put(`access-state:${state}`, JSON.stringify(stored), { expirationTtl: 600 });

  const authorize = new URL(env.ACCESS_AUTHORIZATION_URL);
  authorize.searchParams.set("client_id", env.ACCESS_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", new URL("/callback", request.url).href);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", codeChallenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return Response.redirect(authorize.toString(), 302);
}

async function handleCallback(request: Request, env: OAuthEnv) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return new Response("Missing OAuth callback parameters.", { status: 400 });

  const storedRaw = await env.OAUTH_KV.get(`access-state:${state}`);
  await env.OAUTH_KV.delete(`access-state:${state}`);
  if (!storedRaw) return new Response("OAuth state is missing or expired.", { status: 400 });
  const stored = JSON.parse(storedRaw) as StoredState;

  const tokenResponse = await fetch(env.ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.ACCESS_CLIENT_ID,
      client_secret: env.ACCESS_CLIENT_SECRET,
      code,
      code_verifier: stored.codeVerifier,
      redirect_uri: new URL("/callback", request.url).href,
    }),
  });
  if (!tokenResponse.ok) return new Response("Cloudflare Access token exchange failed.", { status: 502 });
  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    id_token?: string;
  };
  if (!tokenData.id_token || !tokenData.access_token) {
    return new Response("Cloudflare Access did not return the expected tokens.", { status: 502 });
  }

  const claims = await verifyAccessIdToken(env, tokenData.id_token);
  if (!claims.email) return new Response("Cloudflare Access account has no email claim.", { status: 403 });
  if (env.ALLOWED_EMAIL && claims.email.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
    return new Response("This account is not allowed to use this MCP server.", { status: 403 });
  }

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: stored.oauthRequest,
    userId: claims.sub,
    metadata: { label: claims.email },
    scope: stored.oauthRequest.scope,
    props: {
      email: claims.email,
      name: claims.name ?? claims.email,
      sub: claims.sub,
    },
  });
  return Response.redirect(redirectTo, 302);
}

export const accessAuthHandler: ExportedHandler<OAuthEnv> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/authorize") {
      const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      return redirectToAccess(request, env, oauthRequest);
    }
    if (request.method === "GET" && url.pathname === "/callback") {
      try {
        return await handleCallback(request, env);
      } catch (error) {
        console.error("OAuth callback failed", error instanceof Error ? error.message : "unknown error");
        return new Response("OAuth callback failed.", { status: 500 });
      }
    }
    if (url.pathname === "/") {
      return new Response("Instapaper MCP server", { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  },
};
