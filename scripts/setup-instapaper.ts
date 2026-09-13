#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { exchangeXAuth } from "../src/instapaper/oauth.js";
import { InstapaperClient } from "../src/instapaper/client.js";

const rl = createInterface({ input, output });

async function main() {
  const consumerKey = process.env.INSTAPAPER_CONSUMER_KEY || (await rl.question("Instapaper consumer key: ")).trim();
  const consumerSecret = process.env.INSTAPAPER_CONSUMER_SECRET || (await rl.question("Instapaper consumer secret: ")).trim();
  const username = (await rl.question("Instapaper username/email: ")).trim();
  const password = process.env.INSTAPAPER_PASSWORD ?? (await rl.question("Instapaper password (may be empty): "));

  if (!consumerKey || !consumerSecret || !username) {
    throw new Error("Consumer key, consumer secret, and username are required.");
  }

  const tokens = await exchangeXAuth({ consumerKey, consumerSecret, username, password });
  const client = new InstapaperClient({
    consumerKey,
    consumerSecret,
    oauthToken: tokens.token,
    oauthTokenSecret: tokens.tokenSecret,
  });
  const user = await client.verifyCredentials();

  output.write(`\nAuthenticated as ${user.username ?? user.user_id ?? "Instapaper user"}.\n`);
  output.write("Store these values as Cloudflare Worker secrets (do not commit them):\n\n");
  output.write("npx wrangler secret put INSTAPAPER_CONSUMER_KEY\n");
  output.write("npx wrangler secret put INSTAPAPER_CONSUMER_SECRET\n");
  output.write("npx wrangler secret put INSTAPAPER_OAUTH_TOKEN\n");
  output.write("npx wrangler secret put INSTAPAPER_OAUTH_TOKEN_SECRET\n\n");
  output.write("OAuth token values are intentionally not printed. Re-run this command with a secure secret-capture workflow if needed.\n");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Instapaper setup failed.");
    process.exitCode = 1;
  })
  .finally(() => rl.close());
