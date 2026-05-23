#!/usr/bin/env node
/**
 * Subprocess-friendly CLI. What `npx -y @hiq-ai/hiq-editor <subcommand>` runs.
 *
 * Every tool from {@link allTools} is exposed as a subcommand (snake_case →
 * kebab-case), so the same operations the MCP server offers are scriptable from
 * a shell. Outputs the tool's text result on stdout. One extra subcommand:
 *   - `version` — print version.
 *
 * Auth comes from HIQ_EDITOR_TOKEN in the env, exactly like the MCP server.
 */
import { z } from "zod";
import yargs from "yargs";
import type { Options, Argv, ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";

import { allTools } from "./tools/index.js";
import { EditorClientError, type ToolDef } from "./types.js";

const VERSION = "0.1.0";

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

function snakeToKebab(s: string): string {
  return s.replace(/_/g, "-");
}

/** Unwrap optional/default/nullable wrappers down to the inner Zod type. */
function unwrap(t: z.ZodTypeAny): { inner: z.ZodTypeAny; required: boolean } {
  let cur = t;
  let required = true;
  // ZodOptional / ZodDefault / ZodNullable expose .unwrap() / ._def.innerType.
  // Loop until we hit a concrete type.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const name = (cur as { _def?: { typeName?: string } })._def?.typeName;
    if (name === "ZodOptional" || name === "ZodNullable") {
      required = name === "ZodNullable" ? required : false;
      cur = (cur as unknown as { unwrap: () => z.ZodTypeAny }).unwrap();
    } else if (name === "ZodDefault") {
      required = false;
      cur = (cur as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
    } else {
      break;
    }
  }
  return { inner: cur, required };
}

/** Derive a yargs option spec for one Zod field of a tool's raw shape. */
function fieldToOption(field: z.ZodTypeAny): { opt: Options; isJson: boolean } {
  const { inner, required } = unwrap(field);
  const typeName = (inner as { _def?: { typeName?: string } })._def?.typeName;
  const description = (field as { description?: string }).description ?? "";

  const opt: Options = { description };
  if (required) opt.demandOption = true;

  let isJson = false;
  if (typeName === "ZodString") {
    opt.type = "string";
  } else if (typeName === "ZodNumber") {
    opt.type = "number";
  } else if (typeName === "ZodBoolean") {
    opt.type = "boolean";
  } else if (typeName === "ZodArray" || typeName === "ZodObject") {
    opt.type = "string";
    opt.description = (description ? description + " " : "") + "(JSON-encoded)";
    isJson = true;
  } else {
    opt.type = "string";
  }
  return { opt, isJson };
}

function buildToolCommand(tool: ToolDef) {
  const shape = tool.schema;
  const fieldNames = Object.keys(shape);
  const jsonFields = new Set<string>();

  return {
    command: snakeToKebab(tool.name),
    describe: tool.description.slice(0, 90),
    builder: (y: Argv) => {
      let out = y;
      for (const name of fieldNames) {
        const { opt, isJson } = fieldToOption(shape[name]);
        if (isJson) jsonFields.add(name);
        out = out.option(snakeToKebab(name), opt);
      }
      return out;
    },
    handler: async (argv: ArgumentsCamelCase<Record<string, unknown>>) => {
      try {
        const args: Record<string, unknown> = {};
        for (const name of fieldNames) {
          const kebab = snakeToKebab(name);
          const v = argv[name] ?? argv[kebab];
          if (v === undefined) continue;
          if (jsonFields.has(name) && typeof v === "string") {
            try {
              args[name] = JSON.parse(v);
            } catch (e) {
              throw new EditorClientError("validation", `--${kebab} must be valid JSON: ${String(e)}`);
            }
          } else {
            args[name] = v;
          }
        }
        // Validate through the schema so server-side validation isn't the first gate.
        const parsed = z.object(shape).parse(args) as Record<string, unknown>;
        const text = await tool.handler(parsed);
        process.stdout.write(text + "\n");
      } catch (err) {
        emitError(err);
      }
    },
  };
}

async function main(): Promise<void> {
  let y = yargs(hideBin(process.argv))
    .scriptName("hiq-editor")
    .strict()
    .help()
    .alias("h", "help")
    .demandCommand(1, "");

  for (const tool of allTools) {
    y = y.command(buildToolCommand(tool));
  }

  y = y.command(
    "version",
    "Print version.",
    (yy) => yy,
    () => {
      process.stdout.write(VERSION + "\n");
    },
  );

  await y.parseAsync();
}

main().catch((err) => emitError(err));
