/**
 * The full tool surface: 16 forwarders (business operations proxied to the
 * editor server) + the local-only tools (UPR-template parsing, process export).
 *
 * Both entry points — the stdio MCP server (server.ts) and the CLI (cli.ts) —
 * iterate {@link allTools}.
 */

import type { ToolDef } from "../types.js";
import { forwarders } from "./forwarders.js";
import { localTools } from "./local.js";

export const allTools: ToolDef[] = [...forwarders, ...localTools];

export type { ToolDef };
