# @hiq-ai/hiq-editor-mcp

Open local stdio [MCP](https://modelcontextprotocol.io) client for the **HiQ LCA
dataset editor**. It runs on the host machine (Cortex Desktop / Claude Code
spawns it over stdio), forwards LCA business operations to the editor server's
HTTP API, and adds **local file capabilities** — parsing UPR `.xlsx` templates
and exporting process detail to disk — that a remote server cannot do.

Apache-2.0. The proprietary parts (database schema, SQL, write/business logic,
SSO internals) live in a separate closed server; this client only knows the
server's HTTP API contract.

## Architecture

```
┌──────────────────────────────────────┐  HTTPS   ┌────────────────────────────┐
│  @hiq-ai/hiq-editor-mcp  (this, open) │  + SSO   │  editor server  (closed)   │
│  • stdio MCP server                   │ ───────> │  • POST /tools/:name       │
│  • 16 business tools → forward        │  token   │  • GET  /tools             │
│  • LOCAL: parse_upr_template,         │ <─────── │  • SQL reads + writes + SSO│
│           export_process              │  result  │                            │
└──────────────────────────────────────┘          └────────────────────────────┘
```

Each business tool POSTs validated args to `POST /tools/:name` with the caller's
SSO token and returns the text the server produced. The two local tools read and
write the local filesystem instead of forwarding.

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
        "HIQ_EDITOR_SERVER_URL": "https://editor.hiqlcd.com/api/editor-mcp"
      }
    }
  }
}
```

`HIQ_EDITOR_SERVER_URL` is optional and defaults to
`https://editor.hiqlcd.com/api/editor-mcp`.

## Authentication

The only credential is the **SSO token**, supplied by the host through the
`HIQ_EDITOR_TOKEN` environment variable (there is no `login` tool). The client
forwards it verbatim as `Authorization: Bearer <token>`; the server resolves the
user and tenant from it. The token is never written to disk or logs.

## Tool surface

### Business tools (forwarded to the editor server)

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

The same tools are scriptable from a shell (snake_case → kebab-case):

```bash
export HIQ_EDITOR_TOKEN=<your SSO token>
npx @hiq-ai/hiq-editor list-datasources
npx @hiq-ai/hiq-editor get-process-detail-tool --process-id 12345
npx @hiq-ai/hiq-editor parse-upr-template --file-path /abs/path/UPR.xlsx
npx @hiq-ai/hiq-editor version
```

Array / object args are passed as JSON-encoded strings.

## Development

```bash
npm install
npm run build     # tsc → dist/
npm run dev       # stdio MCP server via tsx
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE).
