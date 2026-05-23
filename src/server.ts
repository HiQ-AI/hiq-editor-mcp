#!/usr/bin/env node
/**
 * Stdio MCP server entry. What `npx -y @hiq-ai/hiq-editor-mcp` runs.
 *
 * The host (Cortex Desktop / Claude Code) spawns this and supplies
 * HIQ_EDITOR_SERVER_URL + HIQ_EDITOR_TOKEN in the env. The 16 business tools
 * forward to the editor server's HTTP API; the local tools (parse_upr_template,
 * export_process) run on the local filesystem. Speaks MCP over stdin/stdout.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { allTools } from "./tools/index.js";
import { config } from "./config.js";
import { EditorClientError } from "./types.js";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  process.stderr.write(
    `hiq-editor-mcp ${VERSION} starting (server=${config.serverUrl}, tools=${allTools.length}, token=${config.token ? "set" : "MISSING"})\n`,
  );

  const server = new McpServer({ name: "hiq-editor", version: VERSION });

  for (const tool of allTools) {
    server.tool(
      tool.name,
      tool.description,
      tool.schema,
      { readOnlyHint: tool.readOnly },
      async (args: Record<string, unknown>) => {
        try {
          const text = await tool.handler(args ?? {});
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          const msg =
            err instanceof EditorClientError
              ? `[${err.kind}${err.code ? `:${err.code}` : ""}] ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          process.stderr.write(`tool ${tool.name} failed: ${msg}\n`);
          return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown — the host sends SIGTERM on cleanup.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, async () => {
      await server.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[fatal] ${msg}\n`);
  process.exit(err instanceof EditorClientError && err.kind === "config" ? 2 : 1);
});
