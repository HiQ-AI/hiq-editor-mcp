#!/usr/bin/env node
/**
 * Subprocess-friendly CLI for the editor MCP gateway. What
 * `npx -y @hiq-ai/hiq-editor <subcommand>` runs.
 *
 * Generic, gateway-style — it does not declare per-tool subcommands. Instead:
 *   - `list`              — list the tools the gateway exposes (remote + local).
 *   - `call <tool> --args '<json>'` — invoke any tool by name with a JSON args object.
 *   - `version`           — print version.
 *
 * Auth comes from HIQ_EDITOR_TOKEN in the env, exactly like the MCP server.
 */
import yargs from "yargs";
import type { ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { localToolDefs } from "./tools/index.js";
import { listRemoteTools, callRemoteTool } from "./serverClient.js";
import { EditorClientError } from "./types.js";

const VERSION = "0.1.0";

const localByName = new Map(localToolDefs.map((t) => [t.name, t]));

function exitCodeFor(err: unknown): number {
  if (err instanceof EditorClientError) {
    switch (err.kind) {
      case "config": return 2;
      case "validation": return 3;
      case "upstream": return 4;
      case "transport": return 5;
      default: return 1;
    }
  }
  return 1;
}

function emitError(err: unknown): void {
  const code = exitCodeFor(err);
  const text =
    err instanceof EditorClientError
      ? `[${err.kind}${err.code ? `:${err.code}` : ""}] ${err.message}`
      : `[unknown] ${err instanceof Error ? err.message : String(err)}`;
  process.stderr.write(text + "\n");
  process.exit(code);
}

/** Flatten a tool result's content blocks to plain text. */
function contentToText(result: unknown): string {
  const raw =
    result && typeof result === "object" ? (result as { content?: unknown }).content : undefined;
  const content = Array.isArray(raw) ? raw : [];
  return content
    .map((c) =>
      c && typeof c === "object" && "text" in c
        ? String((c as { text: unknown }).text)
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

async function runList(): Promise<void> {
  const lines: string[] = [];
  let remote: Awaited<ReturnType<typeof listRemoteTools>> = [];
  try {
    remote = await listRemoteTools();
  } catch (err) {
    process.stderr.write(`(remote tools unavailable: ${err instanceof Error ? err.message : String(err)})\n`);
  }
  for (const t of remote) {
    lines.push(`${t.name}\t${t.description ?? ""}`);
  }
  for (const t of localToolDefs) {
    lines.push(`${t.name}\t(local) ${t.description}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function runCall(tool: string, argsJson: string): Promise<void> {
  let args: Record<string, unknown>;
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch (e) {
    throw new EditorClientError("validation", `--args must be valid JSON: ${String(e)}`);
  }

  const local = localByName.get(tool);
  if (local) {
    const content = await local.handler(args);
    process.stdout.write(contentToText({ content }) + "\n");
    return;
  }

  const result = await callRemoteTool(tool, args);
  if ((result as { isError?: boolean }).isError) {
    throw new EditorClientError("upstream", contentToText(result));
  }
  process.stdout.write(contentToText(result) + "\n");
}

async function main(): Promise<void> {
  await yargs(hideBin(process.argv))
    .scriptName("hiq-editor")
    .strict()
    .help()
    .alias("h", "help")
    .demandCommand(1, "")
    .command(
      "list",
      "List the tools the gateway exposes (remote + local).",
      (y) => y,
      async () => {
        try {
          await runList();
        } catch (err) {
          emitError(err);
        }
      },
    )
    .command(
      "call <tool>",
      "Invoke a tool by name with a JSON args object.",
      (y) =>
        y
          .positional("tool", { type: "string", describe: "Tool name." })
          .option("args", {
            type: "string",
            describe: "JSON-encoded args object, e.g. '{\"datasource\":\"GBA\"}'.",
            default: "{}",
          }),
      async (argv: ArgumentsCamelCase<{ tool?: string; args?: string }>) => {
        try {
          await runCall(String(argv.tool ?? ""), String(argv.args ?? "{}"));
        } catch (err) {
          emitError(err);
        }
      },
    )
    .command(
      "version",
      "Print version.",
      (y) => y,
      () => {
        process.stdout.write(VERSION + "\n");
      },
    )
    .parseAsync();
}

main().catch((err) => emitError(err));
