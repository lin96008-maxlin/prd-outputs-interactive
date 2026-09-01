import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { buildFallbackMarkdown, normalizeQuestionnaire } from "./questionnaire-contract.mjs";

const implementation = { name: "prd-clarification-questionnaire", version: "0.1.0" };
const resourceUri = "ui://prd-clarification/questionnaire.html";
const server = new McpServer(implementation);

const optionSchema = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  description: z.string().max(240).optional()
});

const questionSchema = z.object({
  id: z.string().min(1).max(80),
  section: z.string().max(80).optional(),
  prompt: z.string().min(1).max(300),
  description: z.string().max(500).optional(),
  type: z.enum(["single", "multi", "short-text", "long-text"]),
  required: z.boolean().optional(),
  options: z.array(optionSchema).max(8).optional()
});

registerAppTool(
  server,
  "open_prd_clarification_questionnaire",
  {
    title: "打开 PRD 需求澄清问卷",
    description: "仅在需求材料存在 4–20 个会改变范围、流程、权限、数据或验收的关键缺口时调用。支持 MCP Apps 的客户端显示问卷；其他客户端获得完整文本问题。",
    inputSchema: {
      title: z.string().min(1).max(120),
      contextSummary: z.string().max(600).optional(),
      questions: z.array(questionSchema).min(1).max(20)
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    _meta: { ui: { resourceUri, visibility: ["model", "app"] } }
  },
  async args => {
    try {
      const questionnaire = normalizeQuestionnaire(args);
      return {
        content: [{ type: "text", text: buildFallbackMarkdown(questionnaire) }],
        structuredContent: { questionnaire }
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `无法创建 PRD 澄清问卷：${error.message}` }]
      };
    }
  }
);

registerAppResource(
  server,
  "prd-clarification-questionnaire",
  resourceUri,
  {
    description: "在当前对话中收集最多 20 个关键需求答案。",
    _meta: {
      ui: {
        prefersBorder: true,
        csp: { connectDomains: [], resourceDomains: [] }
      }
    }
  },
  async () => {
    const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
    const html = await fs.readFile(path.resolve(runtimeDir, "../assets/prd-clarification-questionnaire.html"), "utf8");
    return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
