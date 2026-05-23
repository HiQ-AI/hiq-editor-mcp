# @hiq-ai/hiq-editor-mcp

Open local stdio [MCP](https://modelcontextprotocol.io) **gateway** for the
**HiQ LCA dataset editor**. It runs on the host machine (Cortex Desktop / Claude
Code spawns it over stdio), connects to the editor server's MCP endpoint
(Streamable HTTP) as an MCP client, **dynamically re-exposes the server's tools**
over stdio, and adds **local file capabilities** — parsing UPR `.xlsx` templates
and exporting process detail to disk — that a remote server cannot do.

Apache-2.0. The proprietary parts (database schema, SQL, write/business logic,
SSO internals) live in a separate closed server; this gateway only knows the
server's MCP endpoint URL and forwards the caller's SSO token to it.

## Architecture

```
┌──────────────────────────────────────┐  HTTPS   ┌────────────────────────────┐
│  @hiq-ai/hiq-editor-mcp  (this, open) │  + SSO   │  editor server  (closed)   │
│  • stdio MCP server (gateway)         │ ───────> │  • /mcp/editor             │
│  • re-exposes remote tools 1:1        │  token   │    (Streamable HTTP MCP)   │
│  • LOCAL: parse_upr_template,         │ <─────── │  • SQL reads + writes + SSO│
│           export_process              │  result  │                            │
└──────────────────────────────────────┘          └────────────────────────────┘
```

The gateway connects to the server's single `/mcp/editor` Streamable-HTTP
endpoint as an MCP client (Bearer SSO token). On `tools/list` it returns the
remote server's tools verbatim (names, descriptions, and JSON schemas straight
from the server — no duplication) plus the 2 local tools. On `tools/call` it
runs the 2 local tools locally and passes every other call through to the remote
endpoint, relaying the result content. This eliminates schema duplication and
reuses the server's existing MCP endpoint.

## Install / run

No install needed — run it with `npx`:

```bash
npx @hiq-ai/hiq-editor-mcp
```

### MCP client config

Add it to your MCP host's `mcpServers` config (Claude Code, Cortex Desktop, etc.):

```jsonc
{
  "mcpServers": {
    "editor": {
      "command": "npx",
      "args": ["-y", "@hiq-ai/hiq-editor-mcp"],
      "env": {
        "HIQ_EDITOR_TOKEN": "<your SSO token>",
        "HIQ_EDITOR_SERVER_URL": "https://x.hiqlcd.com/mcp/editor"
      }
    }
  }
}
```

`HIQ_EDITOR_SERVER_URL` is the editor server's Streamable-HTTP MCP endpoint. It
is optional and defaults to `https://x.hiqlcd.com/mcp/editor`.

## Authentication

The only credential is the **SSO token**, supplied by the host through the
`HIQ_EDITOR_TOKEN` environment variable (there is no `login` tool). The client
forwards it verbatim as `Authorization: Bearer <token>`; the server resolves the
user and tenant from it. The token is never written to disk or logs.

## Tool surface

### Business tools (re-exposed from the editor server)

These come straight from the server's MCP endpoint — the gateway returns them
verbatim, so the live list is whatever the server publishes. At time of writing:

Reads:

| Tool | What it does |
|---|---|
| `list_datasources` | List available datasources for the current user. |
| `list_my_processes` | List processes in my workspace (paginated). |
| `list_all_processes` | List all processes in the datasource (admin view). |
| `get_process_detail_tool` | Full process detail (basic info, units, data items, exchanges). |
| `get_process_status_tool` | Workflow status (approvals, calc tasks, releases). |
| `search_flows_tool` | Search flows (ELEMENTARY_FLOW / PRODUCT_FLOW / WASTE_FLOW). |
| `search_backgrounds_tool` | Search the background dataset catalog. |
| `list_calculations` | View calculation tasks and status. |
| `list_versions` | View database versions and release status. |

Writes:

| Tool | What it does |
|---|---|
| `create_process_tool` | Create a new unit process dataset (UPR). |
| `add_exchange_tool` | Add a data item (exchange) to a process. |
| `update_exchange_tool` | Update a data item's value / unit / formula. |
| `match_background_tool` | Match a data item to a background database process. |
| `submit_review_tool` | Submit a process for expert review. |
| `calculate_process_tool` | Run trial calculation (试算) for one process. |
| `run_batch_calculation_tool` | Create a version-level batch calculation task. |

### Local tools (run on the host filesystem)

| Tool | What it does |
|---|---|
| `parse_upr_template` | Read a local UPR `.xlsx`, extract 基本信息 fields + data-item rows to drive `create_process_tool` + `add_exchange_tool`. |
| `export_process` | Fetch a process's detail and write it to a local file. |

Both local tools require **absolute** file paths.

## CLI

A generic gateway CLI makes the same tools scriptable from a shell:

```bash
export HIQ_EDITOR_TOKEN=<your SSO token>

# List the tools the gateway exposes (remote + local).
npx @hiq-ai/hiq-editor list

# Invoke any tool by name, passing args as a JSON object.
npx @hiq-ai/hiq-editor call list_datasources
npx @hiq-ai/hiq-editor call get_process_detail_tool --args '{"process_id":"12345"}'
npx @hiq-ai/hiq-editor call parse_upr_template --args '{"file_path":"/abs/path/UPR.xlsx"}'

npx @hiq-ai/hiq-editor version
```

`--args` defaults to `{}`. Tool names are the server's native (snake_case) names.

## Development

```bash
npm install
npm run build     # tsc → dist/
npm run dev       # stdio MCP server via tsx
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE).
