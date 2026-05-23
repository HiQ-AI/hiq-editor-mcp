/**
 * Runtime config. Read once at process start from the environment the host
 * (Cortex Desktop / Claude Code) supplies when it spawns this stdio MCP.
 *
 *   HIQ_EDITOR_SERVER_URL  — the editor server's HTTP API base, no trailing slash.
 *   HIQ_EDITOR_TOKEN       — the caller's SSO token (raw SSO accessToken or a
 *                            Cortex desktop JWT wrapping one). Forwarded verbatim
 *                            as `Authorization: Bearer <token>`; the server
 *                            resolves user/tenant from it. Like jimu-lca's
 *                            memberKey, it is provided by the host env — there is
 *                            no `login` tool in this client.
 */

const DEFAULT_SERVER_URL = "https://editor.hiqlcd.com/api/editor-mcp";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface Config {
  /** Editor server HTTP API base URL, no trailing slash. */
  serverUrl: string;
  /** Caller's SSO token, forwarded as a Bearer token. Empty string if unset. */
  token: string;
}

export const config: Config = {
  serverUrl: stripTrailingSlash(
    process.env.HIQ_EDITOR_SERVER_URL?.trim() || DEFAULT_SERVER_URL,
  ),
  token: process.env.HIQ_EDITOR_TOKEN?.trim() ?? "",
};
