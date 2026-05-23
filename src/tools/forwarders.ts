/**
 * The 16 business tools. Names, descriptions, and zod schemas are copied
 * VERBATIM from the closed editor server's tool registry
 * (editor-mcp-server/src/tools.ts) so the existing `hiq-editor` skill and the
 * `mcp__editor__*` namespace keep working unchanged.
 *
 * The difference from the server: every handler here is a thin forwarder. It
 * does no work locally — it POSTs the validated args to `POST /tools/:name` on
 * the server and returns the text the server produced. No `login` tool: the SSO
 * token comes from HIQ_EDITOR_TOKEN in the env (see config.ts).
 */

import { z } from "zod";
import type { ToolDef } from "../types.js";
import { callTool } from "../serverClient.js";

// Helper: an optional field (matches the server registry's `opt`).
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();

/** Build a thin forwarder ToolDef. The handler just POSTs to the server. */
function forward(
  name: string,
  description: string,
  schema: z.ZodRawShape,
  readOnly: boolean,
): ToolDef {
  return {
    name,
    description,
    schema,
    readOnly,
    handler: (args) => callTool(name, args),
  };
}

export const forwarders: ToolDef[] = [
  forward("list_datasources", "List available datasources for the current user.", {}, true),

  forward(
    "list_my_processes",
    "List processes in my workspace with summary stats and pagination.",
    {
      datasource: z.string().describe("Datasource name (e.g. 'GBA')"),
      keyword: opt(z.string()).describe("Search by process name"),
      uuid: opt(z.string()).describe("Search by exact ID or UUID"),
      page: opt(z.number()).describe("Page number (default 1)"),
      page_size: opt(z.number()).describe("Results per page (default 20, max 100)"),
    },
    true,
  ),

  forward(
    "list_all_processes",
    "List all processes in the datasource (admin view) with Workspace column.",
    {
      datasource: z.string().describe("Datasource name (e.g. 'GBA')"),
      keyword: opt(z.string()).describe("Search by process name"),
      uuid: opt(z.string()).describe("Search by exact ID or UUID"),
      page: opt(z.number()),
      page_size: opt(z.number()),
    },
    true,
  ),

  forward(
    "get_process_detail_tool",
    "Full process detail: basic info, process units, data items (GWP + upstream matching), exchanges.",
    { process_id: z.string().describe("Process ID") },
    true,
  ),

  forward(
    "get_process_status_tool",
    "Workflow status: approval records, calculation tasks, version releases.",
    { process_id: z.string().describe("Process ID") },
    true,
  ),

  forward(
    "search_flows_tool",
    "Search flows. ELEMENTARY_FLOW = standard reference data (emissions/resources); PRODUCT_FLOW = intermediate products used in editing.",
    {
      keyword: opt(z.string()).describe("Search by flow name or CAS number"),
      flow_type: opt(z.string()).describe("ELEMENTARY_FLOW, PRODUCT_FLOW, or WASTE_FLOW"),
      category: opt(z.string()).describe("Filter by category name"),
      limit: opt(z.number()).describe("Max results (default 50, max 200)"),
    },
    true,
  ),

  forward(
    "search_backgrounds_tool",
    "Search the background dataset catalog. Use BEFORE match_background_tool — gives the exact 5-tuple (id, uuid, name, data_source, version) it needs. Do NOT concatenate uuid+version.",
    {
      dataset_id: opt(z.string()).describe("Background dataset ID — the '背景数据唯一ID' in UPR templates. Multiple version rows share one id."),
      uuid: opt(z.string()).describe("Background dataset uuid — identifies a specific version row."),
      keyword: opt(z.string()).describe("Search the dataset name (zh and en)."),
      data_source: opt(z.string()).describe("Filter by background DB name (e.g. 'HiQLCD', 'Ecoinvent')."),
      version: opt(z.string()).describe("Exact version match (e.g. '1.4.0')."),
      limit: opt(z.number()).describe("Max results (default 20, max 100)"),
    },
    true,
  ),

  forward(
    "list_calculations",
    "View LCA calculation tasks and their status, datasets, and logs.",
    {
      datasource: z.string().describe("Datasource name (e.g. 'GBA')"),
      task_id: opt(z.string()).describe("Task ID for detail view. Omit to list all tasks."),
    },
    true,
  ),

  forward(
    "list_versions",
    "View database versions and release/publish status.",
    {
      datasource: z.string().describe("Datasource name (e.g. 'GBA')"),
      version_id: opt(z.string()).describe("Version ID for detail. Omit to list all."),
    },
    true,
  ),

  forward(
    "create_process_tool",
    "Create a new unit process dataset (UPR). Writes to the platform. middle_flow_id must be a PRODUCT_FLOW (use search_flows). Description fields map 1:1 to the UPR 基本信息 sheet — pass each filled row. After creation: add_exchange, then trial calculate before submit_review.",
    {
      datasource: z.string(),
      name: z.string(),
      from_data: z.string().describe("LCI method: CUT_OFF, APOS, CONSEQUENTIAL"),
      special_type: z.string().describe("PRODUCT_TYPE (production) or MARKET_TYPE (market)"),
      middle_flow_id: z.string().describe("Reference product flow ID (PRODUCT_FLOW)"),
      boundary: z.string().describe("GATE_TO_GATE, CRADLE_TO_GATE, CRADLE_TO_CONSUMER, CRADLE_TO_GATE_EOL"),
      dataset_type: z.string().describe("UPR or LCI"),
      location_id: z.string().describe("Geography location ID"),
      start_date: z.string().describe("yyyy-MM-dd"),
      end_date: z.string().describe("yyyy-MM-dd"),
      dataset_category: opt(z.string()).describe("MATERIAL_TYPE, ENERGY_TYPE, WASTE_TREATMENT, PROCESSING_TYPE, CONSTRUCTION_TYPE, TRANSPORT_TYPE"),
      market_type: opt(z.string()).describe("Only when special_type=MARKET_TYPE: MARKET or MARKET_GROUP"),
      product_type_id: opt(z.string()),
      technical_level: opt(z.string()).describe("CURRENT, LEADING, ADVANCED, OUTDATED, UNDEFINED"),
      macro_value: opt(z.string()).describe("BUSINESS_AS_USUAL"),
      description_general: opt(z.string()),
      description_technology: opt(z.string()),
      description_location: opt(z.string()),
      product_process_description: opt(z.string()),
      activity_description: opt(z.string()),
      start_boundary: opt(z.string()),
      end_boundary: opt(z.string()),
      synonyms: opt(z.array(z.string())),
      data_quality_method_id: opt(z.string()),
    },
    false,
  ),

  forward(
    "add_exchange_tool",
    "Add a data item (exchange) to a process. Writes data. category sets input/output direction; flow must match category type (ELEMENTARY_FLOW for emissions, PRODUCT_FLOW for products/materials/energy). material_name writes the editor 物料名称 label, distinct from the LCI flow name.",
    {
      process_id: z.string(),
      category: z.string().describe("Output: PRODUCT, BYPRODUCT, WASTE, AIR_EMISSION, WATER_EMISSION, SOIL_EMISSION. Input: RAW_MATERIAL, AUXILIARY, ENERGY, NATURAL_RESOURCE, SERVICE"),
      flow_id: z.string().describe("LCI flow ID (search_flows). Must match category type."),
      value: z.number(),
      is_reference_product: opt(z.boolean()).describe("True if THE reference product (PRODUCT only)"),
      core_id: opt(z.string()),
      element_id: opt(z.string()),
      production: opt(z.number()),
      declared_unit_id: opt(z.string()).describe("Required when is_reference_product=true"),
      description: opt(z.string()),
      material_name: opt(z.string()).describe("Editor 物料名称 label (writes mark_name), e.g. '锡合金锭'."),
    },
    false,
  ),

  forward(
    "update_exchange_tool",
    "Update an existing data item's value, unit, or formula. Writes data.",
    {
      item_id: z.string(),
      process_id: z.string(),
      core_id: opt(z.string()),
      value: opt(z.number()),
      unit_id: opt(z.string()),
      formula: opt(z.string()),
      description: opt(z.string()),
    },
    false,
  ),

  forward(
    "match_background_tool",
    "Match a data item to a background database process. Writes data. Pass the exact 5-tuple from search_backgrounds (bind by standardUuid + data_source + version; do NOT concatenate uuid+version).",
    {
      item_id: z.string(),
      process_id: z.string(),
      up_element_id: z.string().describe("Upstream background process ID"),
      up_element_uuid: z.string().describe("Upstream background process UUID"),
      up_element_name: z.string().describe("Upstream background process name"),
      data_source: z.string().describe("Background database name (e.g. 'Ecoinvent')"),
      data_version: z.string().describe("Background database version (e.g. '3.10.0')"),
      core_id: opt(z.string()),
      system_model: opt(z.string()).describe("e.g. 'CONSEQUENTIAL'"),
    },
    false,
  ),

  forward(
    "submit_review_tool",
    "Submit a process for expert review/approval. Changes the process status.",
    { process_id: z.string() },
    false,
  ),

  forward(
    "calculate_process_tool",
    "Run trial calculation (试算) for a single process — a preview during editing, NOT the final version calc. Needs data items first. After success, submit_review.",
    { process_id: z.string() },
    false,
  ),

  forward(
    "run_batch_calculation_tool",
    "Create a version-level batch calculation task. Used AFTER individual processes are calculated + reviewed.",
    {
      datasource: z.string(),
      description: z.string(),
      system_model: z.string().describe("CUT_OFF, CONSEQUENTIAL, etc."),
      process_ids: z.array(z.string()),
      background_datasources: z.array(z.object({
        dataSource: opt(z.string()),
        dataVersion: opt(z.string()),
        systemModel: opt(z.string()),
      })).describe("[{dataSource, dataVersion, systemModel}]"),
    },
    false,
  ),
];
