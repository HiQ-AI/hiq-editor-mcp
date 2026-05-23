/**
 * Local-only tools — the reason this open client exists alongside the closed
 * server. These run on the local filesystem instead of forwarding:
 *
 *   parse_upr_template — read a local UPR .xlsx and surface its 基本信息 fields +
 *                        data-item rows so the agent can drive create_process_tool
 *                        + add_exchange_tool.
 *   export_process     — fetch a process's detail from the server and write it to
 *                        a local file.
 */

import { z } from "zod";
import * as XLSX from "xlsx";
import type { ToolDef } from "../types.js";
import { callTool } from "../serverClient.js";
import { readBytes, writeText, requireAbsolute } from "../files.js";

const BASIC_INFO_SHEET = "基本信息";
/** Sheet names that hold a header-row + data-item-rows table. */
const DATA_ITEM_SHEETS = ["P-工序"];

/** A 基本信息 row is [字段名, 值, 备注, 是否必填]. Keep filled ones. */
interface BasicInfoField {
  field: string;
  value: string;
  required: boolean;
  note?: string;
}

function readWorkbook(bytes: Buffer): XLSX.WorkBook {
  return XLSX.read(bytes, { type: "buffer" });
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
}

function cell(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function parseBasicInfo(wb: XLSX.WorkBook): BasicInfoField[] {
  const rows = sheetRows(wb, BASIC_INFO_SHEET);
  const out: BasicInfoField[] = [];
  // Row 0 is the header (字段名/值/备注/是否必填). Data starts at row 1.
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const field = cell(r[0]);
    const value = cell(r[1]);
    if (!field) continue;
    const note = cell(r[2]);
    const required = cell(r[3]) === "是";
    out.push({ field, value, required, ...(note ? { note } : {}) });
  }
  return out;
}

/** Map a data-item sheet into { headers, rows } where rows are header→value objects. */
function parseDataItems(wb: XLSX.WorkBook, name: string): {
  sheet: string;
  headers: string[];
  rows: Record<string, string>[];
} {
  const raw = sheetRows(wb, name);
  if (raw.length === 0) return { sheet: name, headers: [], rows: [] };
  const headers = (raw[0] ?? []).map(cell);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const obj: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      const v = cell(r[idx]);
      if (h) obj[h] = v;
      if (v) hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return { sheet: name, headers, rows };
}

export const parseUprTemplate: ToolDef = {
  name: "parse_upr_template",
  description:
    "LOCAL. Read a local UPR (unit process) .xlsx template and extract its 基本信息 " +
    "fields and data-item rows so you can drive create_process_tool + add_exchange_tool. " +
    "Returns the basic-info key/values (with required flags) and, for each data-item " +
    "sheet, the column headers + non-empty rows verbatim — map the columns to tool args " +
    "yourself (背景数据唯一ID → search_backgrounds_tool, etc.). file_path must be absolute.",
  schema: {
    file_path: z
      .string()
      .describe("Absolute path to the local UPR .xlsx template."),
  },
  readOnly: true,
  handler: async (args) => {
    const filePath = requireAbsolute("file_path", String(args.file_path ?? ""));
    const bytes = await readBytes(filePath);
    const wb = readWorkbook(bytes);

    const basicInfo = parseBasicInfo(wb);
    const dataItemSheets = DATA_ITEM_SHEETS.filter((s) => wb.SheetNames.includes(s)).map(
      (s) => parseDataItems(wb, s),
    );

    const summary = {
      file: filePath,
      sheets: wb.SheetNames,
      basic_info: basicInfo,
      data_items: dataItemSheets,
    };
    return JSON.stringify(summary, null, 2);
  },
};

export const exportProcess: ToolDef = {
  name: "export_process",
  description:
    "LOCAL. Fetch a process's full detail from the server (get_process_detail_tool) " +
    "and write it to a local file. Use to archive or hand off a dataset. out_path must " +
    "be absolute.",
  schema: {
    process_id: z.string().describe("Process ID to export."),
    out_path: z.string().describe("Absolute path of the local file to write."),
  },
  readOnly: false,
  handler: async (args) => {
    const processId = String(args.process_id ?? "");
    const outPath = requireAbsolute("out_path", String(args.out_path ?? ""));
    const detail = await callTool("get_process_detail_tool", { process_id: processId });
    await writeText(outPath, detail);
    return `Wrote process ${processId} detail (${detail.length} chars) to ${outPath}`;
  },
};

export const localTools: ToolDef[] = [parseUprTemplate, exportProcess];
