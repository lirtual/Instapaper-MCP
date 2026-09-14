# Instapaper MCP

A focused Instapaper MCP server that runs both as a **Cloudflare Remote MCP** and a local **stdio MCP**.

## Architecture

- MCP SDK v2 (`@modelcontextprotocol/server`)
- Stateless Streamable HTTP at `/mcp`
- Cloudflare MCP Portal + Managed OAuth / Access as the client-facing MCP ingress
- Dedicated `MCP_ORIGIN_TOKEN` bearer authentication from Portal to the Worker
- Instapaper Full API via OAuth 1.0a / HMAC-SHA1
- Instapaper OAuth credentials remain inside the Worker and are never reused as the Portal origin credential
- Instapaper username/password are used only once for xAuth bootstrap and are not stored by the Worker

```text
MCP client
  -> Cloudflare MCP Portal + Managed OAuth / Access
  -> Authorization: Bearer <MCP_ORIGIN_TOKEN>
  -> Instapaper Worker /mcp
  -> Instapaper OAuth 1.0a credentials
  -> Instapaper API
```

The Worker consumes and removes the origin `Authorization` header before the request reaches the MCP SDK or Instapaper domain code.

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
- A Cloudflare account with Workers and MCP Portal / Zero Trust available
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

## 2. Configure the Worker origin credential

Create a high-entropy value used only between Cloudflare MCP Portal and this Worker:

```bash
npx wrangler secret put MCP_ORIGIN_TOKEN
```

Do **not** reuse any Instapaper credential for this value.

The Worker expects:

```text
Authorization: Bearer <MCP_ORIGIN_TOKEN>
```

Requests to `/mcp` fail closed when the origin credential is missing or invalid. After a successful match the Worker removes the `Authorization` header before dispatching to the MCP handler.

## 3. Deploy the Worker origin

`wrangler.jsonc` disables `workers.dev` and Preview URLs. Configure a production custom hostname that Cloudflare MCP Portal can reach, then deploy:

```bash
npm run deploy
```

The upstream MCP URL is:

```text
https://<worker-custom-domain>/mcp
```

## 4. Register the Worker in Cloudflare MCP Portal

Add the Worker `/mcp` URL as an upstream MCP server. Configure upstream authentication as Bearer using the same value stored in `MCP_ORIGIN_TOKEN`.

Create or select the MCP Portal, attach the Instapaper server, and configure Managed OAuth / Access so only the intended user/account can connect.

The URL configured in ChatGPT or another MCP client must be the **Portal URL**, not the raw Worker URL.

## 5. Acceptance checks

Validate in this order:

1. Direct `/mcp` without origin authentication is rejected.
2. Direct `/mcp` with `Authorization: Bearer <MCP_ORIGIN_TOKEN>` reaches the MCP transport.
3. Cloudflare MCP Portal discovers the Instapaper server and the expected 11 tools.
4. The MCP client completes authentication against the Portal.
5. `list_bookmarks` succeeds through the Portal.
6. Only after the read path works, run one bounded mutation such as `set_bookmark_starred` and verify the result in Instapaper.
7. Inspect Worker logs and confirm no client OAuth token, `MCP_ORIGIN_TOKEN`, or Instapaper OAuth credential value is logged.

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

- Cloudflare MCP Portal owns client-facing OAuth/Access; this Worker does not implement a second MCP authorization server.
- `MCP_ORIGIN_TOKEN` authenticates only Portal-to-Worker traffic.
- Instapaper OAuth credentials authenticate only Worker-to-Instapaper traffic.
- The origin bearer is removed before MCP/domain processing.
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

### Direct Worker `/mcp` returns unauthorized

Confirm the request carries exactly the dedicated Portal origin bearer. Do not use an Instapaper token.

### Portal cannot reach the Worker

Confirm the custom Worker hostname is reachable by Cloudflare MCP Portal, `workers.dev`/Preview URLs are not being used as the production path, and Portal upstream authentication matches `MCP_ORIGIN_TOKEN`.

## License

MIT. This fork preserves the upstream license and attribution.
