/**
 * The local-only tool defs (UPR-template parsing, process export). The 16
 * business tools are no longer declared here — they are re-exposed dynamically
 * by the gateway, which pulls them straight from the remote MCP endpoint's
 * tools/list (no schema duplication).
 */

import { localTools, type LocalToolDef } from "./local.js";

export const localToolDefs: LocalToolDef[] = localTools;

export type { LocalToolDef };
