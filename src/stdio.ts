#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./mcp/server.js";

const required = [
  "INSTAPAPER_CONSUMER_KEY",
  "INSTAPAPER_CONSUMER_SECRET",
  "INSTAPAPER_OAUTH_TOKEN",
  "INSTAPAPER_OAUTH_TOKEN_SECRET",
] as const;

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

void serveStdio(() =>
  createServer({
    consumerKey: process.env.INSTAPAPER_CONSUMER_KEY!,
    consumerSecret: process.env.INSTAPAPER_CONSUMER_SECRET!,
    oauthToken: process.env.INSTAPAPER_OAUTH_TOKEN!,
    oauthTokenSecret: process.env.INSTAPAPER_OAUTH_TOKEN_SECRET!,
  }),
);

console.error("Instapaper MCP server listening on stdio");
