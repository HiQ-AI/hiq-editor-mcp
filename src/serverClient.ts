/**
 * MCP client for the closed editor server. This package is a gateway: it
 * connects to the server's Streamable-HTTP MCP endpoint (config.serverUrl,
 * e.g. https://x.hiqlcd.com/mcp/editor) as an MCP client and re-exposes the
 * server's tools over stdio. No schema duplication — tools/list and the
 * tool inputSchemas come straight from the server.
 *
 * The connection is a lazily-built singleton (connect once, reuse). Calc/SQL
 * on the server side can be slow, so the per-request timeout is generous (120s).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import { config } from "./config.js";
import { EditorClientError } from "./types.js";

const VERSION = "0.1.0";
const REQUEST_TIMEOUT_MS = 120_000;

let clientPromise: Promise<Client> | undefined;

/** Connect to the remote MCP endpoint once and reuse the client. */
export function getRemoteClient(): Promise<Client> {
  if (!config.token) {
    return Promise.reject(
      new EditorClientError(
        "config",
        "No SSO token. Set HIQ_EDITOR_TOKEN in the environment the host spawns this MCP with.",
      ),
    );
  }
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      // Reset so a later call can retry instead of caching a rejected promise.
      clientPromise = undefined;
      throw err;
    });
  }
  return clientPromise;
}

async function connect(): Promise<Client> {
  const client = new Client(
    { name: "hiq-editor-gateway", version: VERSION },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(config.serverUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${config.token}` },
    },
  });
  try {
    await client.connect(transport);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new EditorClientError(
      "transport",
      `could not connect to editor MCP endpoint ${config.serverUrl}: ${msg}`,
    );
  }
  return client;
}

/** The remote server's tool catalog (name, description, inputSchema). */
export async function listRemoteTools(): Promise<Tool[]> {
  const client = await getRemoteClient();
  const { tools } = await client.listTools(undefined, { timeout: REQUEST_TIMEOUT_MS });
  return tools;
}

/** Invoke a tool on the remote server, passing through its result content. */
export async function callRemoteTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Awaited<ReturnType<Client["callTool"]>>> {
  const client = await getRemoteClient();
  return client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: REQUEST_TIMEOUT_MS },
  );
}
