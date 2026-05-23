/**
 * Shared types for the open editor MCP client.
 *
 * Every tool — forwarder or local-only — is declared once as a {@link ToolDef}
 * and registered by both entry points (stdio MCP server in server.ts, CLI in
 * cli.ts). A forwarder's handler calls `callTool(name, args)`; a local tool's
 * handler does the work on the local filesystem.
 */

import type { z } from "zod";

/** One tool's static definition. */
export interface ToolDef {
  /** Tool id used by the MCP protocol and by the CLI subcommand name. */
  name: string;
  /** Description shown to the LLM. Copied verbatim from the server registry. */
  description: string;
  /** Zod raw shape — the same shape the server validates request bodies against. */
  schema: z.ZodRawShape;
  /** True for reads. Surfaced as the MCP readOnlyHint annotation. */
  readOnly: boolean;
  /** Implementation. Receives validated args, returns a text string for the LLM. */
  handler: (args: Record<string, unknown>) => Promise<string>;
}

/** Error raised by the client (config / transport) or relayed from the server. */
export class EditorClientError extends Error {
  constructor(
    public readonly kind: "config" | "validation" | "transport" | "upstream",
    message: string,
    /** Server-supplied error code, when kind === "upstream". */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "EditorClientError";
  }
}

/** Server response envelope: `POST /tools/:name` and `GET /tools`. */
export type ToolEnvelope<T = string> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
