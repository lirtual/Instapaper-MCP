# Instapaper MCP

A focused Instapaper MCP server that runs both as a **Cloudflare Remote MCP** and a local **stdio MCP**.

## Architecture

- MCP SDK v2 (`@modelcontextprotocol/server`)
- Stateless Streamable HTTP at `/mcp`
- `workers-oauth-provider` for MCP OAuth
- Cloudflare Access / Access for SaaS for user authentication
- Cloudflare KV only for OAuth state
- Instapaper Full API via OAuth 1.0a / HMAC-SHA1
- Instapaper username/password are used only once for xAuth bootstrap and are not stored by the Worker

## Tools

The server intentionally exposes a small V1 surface:

1. `list_bookmarks`
2. `get_article_content`
3. `add_bookmark`
4. `set_bookmark_starred`
5. `set_bookmark_archived`
6. `move_bookmark`
7. `delete_bookmark`
8. `list_folders`
9. `create_folder`
10. `list_highlights`
11. `add_highlight`

There are no fake full-library search tools, no duplicate bulk tools, and no MCP Resources/Prompts in V1.

## Prerequisites

- Node.js 24+
- A Cloudflare account with Workers and Zero Trust / Access enabled
- An Instapaper Full API consumer key/secret
- Wrangler authenticated with your Cloudflare account

## Install

```bash
npm install
```

## 1. Bootstrap Instapaper OAuth tokens

Set the consumer credentials temporarily in your shell or enter them when prompted:

```bash
npm run setup:instapaper
```

The CLI performs Instapaper xAuth, verifies the resulting token, and writes these Worker secrets through Wrangler without printing the OAuth tokens:

- `INSTAPAPER_CONSUMER_KEY`
- `INSTAPAPER_CONSUMER_SECRET`
- `INSTAPAPER_OAUTH_TOKEN`
- `INSTAPAPER_OAUTH_TOKEN_SECRET`

The username/password are not persisted.

## 2. Configure Cloudflare Access for SaaS

Create an Access for SaaS OIDC application whose callback URL points to:

```text
https://<your-worker-host>/callback
```

Enable authorization-code and refresh-token grants. Configure One-time PIN (or another IdP) and restrict the Access policy to your own email address.

Store the Access values as Worker secrets:

```bash
npx wrangler secret put ACCESS_CLIENT_ID
npx wrangler secret put ACCESS_CLIENT_SECRET
npx wrangler secret put ACCESS_TOKEN_URL
npx wrangler secret put ACCESS_AUTHORIZATION_URL
npx wrangler secret put ACCESS_JWKS_URL
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npx wrangler secret put ALLOWED_EMAIL
```

Generate `COOKIE_ENCRYPTION_KEY` with a cryptographically random value, for example `openssl rand -hex 32`.

## 3. OAuth KV

`wrangler.jsonc` declares an `OAUTH_KV` binding without an account-specific ID. Current Wrangler can automatically provision the KV namespace on deployment. The namespace is used only for MCP OAuth state; it is not an Instapaper cache or database.

## 4. Deploy

```bash
npm run deploy
```

Your MCP endpoint is:

```text
https://<your-worker-host>/mcp
```

The Worker publishes the OAuth endpoints used by MCP clients and redirects user authentication through Cloudflare Access.

## 5. Connect from ChatGPT / other MCP clients

Add the `/mcp` URL as a Remote MCP server. The client should discover OAuth, open the browser authorization flow, and then reconnect with the MCP access token issued by this Worker.

## Local stdio mode

For local clients, set the four Instapaper token variables from `.env.example` in the process environment and run:

```bash
npm run stdio
```

or inspect locally with:

```bash
npm run inspector
```

stdio and Remote MCP use the same `createServer()` factory and expose the same tools.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run deploy:dry-run
```

## Security model

- Instapaper OAuth credentials never pass through MCP clients.
- MCP access tokens are never sent to Instapaper.
- Instapaper username/password are bootstrap-only.
- OAuth parameters for Instapaper are sent in the `Authorization` header; API arguments remain in the POST form body.
- `delete_bookmark` is marked destructive; read tools are marked read-only.
- Secrets and `.dev.vars` are ignored by Git.

## API notes

- `bookmarks/list` is parsed using Instapaper's object response (`user`, `bookmarks`, `highlights`, `delete_ids`).
- Highlights use the `/api/1.1/...` endpoints.
- `get_article_content` returns Instapaper's processed `text/html` output without an unnecessary Markdown conversion layer.
- V1 does not claim full-library search because the Full API does not provide an appropriate general bookmark-search endpoint.

## Troubleshooting

### Instapaper authentication fails

Re-run:

```bash
npm run setup:instapaper
```

and redeploy/refresh the Worker secrets.

### OAuth callback fails

Check the Access for SaaS callback URL, OIDC endpoint secrets, `COOKIE_ENCRYPTION_KEY`, and your email allowlist.

### Remote MCP returns unauthorized

Confirm `/mcp` is being accessed through the OAuth flow rather than with an Instapaper token. The two authorization layers are intentionally separate.

## License

MIT. This fork preserves the upstream license and attribution.
