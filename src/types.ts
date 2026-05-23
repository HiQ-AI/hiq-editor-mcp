/**
 * Shared types for the editor MCP gateway.
 *
 * The gateway re-exposes the remote server's tools dynamically (their schemas
 * come from the remote tools/list), so there is no local per-tool definition
 * for business tools. The only local tool defs live in tools/local.ts.
 */

/** Error raised by the gateway (config / transport / validation) or relayed from the server. */
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
