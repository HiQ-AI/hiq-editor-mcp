/**
 * HTTP client for the closed editor server. Every business operation forwards
 * here: `POST /tools/:name` with a JSON args body and a Bearer SSO token,
 * returning the `{ ok, data }` / `{ ok, error }` envelope.
 *
 * Calc/SQL on the server side can be slow, so the timeout is generous (120 s).
 */

import { config } from "./config.js";
import { EditorClientError, type ToolEnvelope } from "./types.js";

const REQUEST_TIMEOUT_MS = 120_000;

function authHeader(): Record<string, string> {
  if (!config.token) {
    throw new EditorClientError(
      "config",
      "No SSO token. Set HIQ_EDITOR_TOKEN in the environment the host spawns this MCP with.",
    );
  }
  return { Authorization: `Bearer ${config.token}` };
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${config.serverUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...authHeader(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "TimeoutError"
        ? `request to ${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new EditorClientError("transport", `${method} ${url} failed: ${msg}`);
  }

  let envelope: ToolEnvelope<T>;
  try {
    envelope = (await res.json()) as ToolEnvelope<T>;
  } catch {
    throw new EditorClientError(
      "transport",
      `${method} ${url} returned HTTP ${res.status} with a non-JSON body`,
    );
  }

  if (envelope.ok) return envelope.data;

  throw new EditorClientError(
    "upstream",
    envelope.error?.message ?? `server returned HTTP ${res.status}`,
    envelope.error?.code,
  );
}

/** Invoke a business tool on the server. Returns the formatted text it produced. */
export function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  return request<string>("POST", `/tools/${encodeURIComponent(name)}`, args);
}

/** Fetch the server's tool catalog. */
export function listTools(): Promise<
  { name: string; description: string; readOnly: boolean }[]
> {
  return request("GET", "/tools");
}
