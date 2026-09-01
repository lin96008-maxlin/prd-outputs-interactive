import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(pluginRoot, "src");

const uiBuild = await build({
  entryPoints: [path.join(srcDir, "questionnaire-app.mjs")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "inline"
});
const template = await fs.readFile(path.join(srcDir, "questionnaire-template.html"), "utf8");
const css = await fs.readFile(path.join(srcDir, "questionnaire.css"), "utf8");
const js = uiBuild.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = template
  .replace("<!-- INLINE_CSS -->", () => `<style>${css}</style>`)
  .replace("<!-- INLINE_JS -->", () => `<script>${js}</script>`);
await fs.writeFile(path.join(pluginRoot, "assets", "prd-clarification-questionnaire.html"), html, "utf8");

const previewData = {
  title: "客户工单升级需求澄清",
  contextSummary: "现有材料已经说明目标和使用对象，以下问题会影响一期范围、角色职责和验收口径。",
  questions: [
    { id: "scope", prompt: "首版移动端需要覆盖哪些角色和工作闭环，且不同角色在首页、任务详情、办理、复核退回和运营配置中的边界分别是什么？", type: "multi", options: [
      { value: "frontline", label: "一线人员现场办理", description: "支持查看任务、导航到现场、填写办理结果、保存草稿并提交。" },
      { value: "leader", label: "组长任务协调", description: "支持查看本组统计、筛选成员任务、催办和调整任务负责人。" },
      { value: "review", label: "复核人员审核", description: "支持查看办理材料、通过、退回，并填写需要重新补充的具体原因。" },
      { value: "operation", label: "业务运营配置", description: "支持维护任务类型、表单模板、时限规则和消息提醒策略。" },
      { value: "observer", label: "只读观察角色", description: "仅查看授权范围内的任务状态和统计结果，不允许办理或调整。" },
      { value: "external", label: "外部协作人员", description: "通过受限入口提交协作结果，不进入内部任务列表和组织通讯录。" }
    ] },
    { id: "owner", prompt: "当系统同时识别到区域、业务分类、人员技能和当前任务负载时，工单首次分派应该优先采用哪一种规则？", type: "single", options: [
      { value: "leader", label: "值班主管人工分派", description: "系统只提供候选人建议，由主管结合实际情况完成最终分派。" },
      { value: "rule", label: "系统自动分派", description: "按照区域、技能和负载规则直接分派，异常任务再进入人工队列。" },
      { value: "hybrid", label: "自动分派后人工确认", description: "系统生成分派结果，主管批量确认后才正式进入处理人任务列表。" }
    ] },
    { id: "timeout", prompt: "超过处理时限后需要采取什么动作？", type: "single", options: [
      { value: "remind", label: "仅提醒", description: "提醒当前处理人和主管" },
      { value: "escalate", label: "自动升级", description: "升级到上一级处理队列" },
      { value: "reassign", label: "自动改派", description: "改派给同区域其他可用人员" },
      { value: "manual", label: "转人工判断", description: "进入异常队列，由主管决定后续动作" }
    ] },
    { id: "metric", prompt: "一期最重要的验收指标是什么？", type: "short-text" },
    { id: "exceptions", prompt: "哪些工单允许暂停计时？", type: "long-text", required: false },
    { id: "permission", prompt: "普通处理人是否可以查看其他团队工单？", type: "single", options: [
      { value: "none", label: "不可查看" },
      { value: "readonly", label: "只读查看" },
      { value: "all", label: "查看并协作处理" }
    ] }
  ]
};
let previewOutput = null;
if (process.env.PRD_QUESTIONNAIRE_BUILD_PREVIEW === "1") {
  const previewScript = `<script>window.__PRD_QUESTIONNAIRE_PREVIEW__=${JSON.stringify(previewData).replace(/</g, "\\u003c")};</script>`;
  previewOutput = path.resolve(process.env.PRD_QUESTIONNAIRE_PREVIEW_OUTPUT || path.join(pluginRoot, "tests", "questionnaire-preview.html"));
  await fs.mkdir(path.dirname(previewOutput), { recursive: true });
  await fs.writeFile(previewOutput, html.replace("<body>", `<body>${previewScript}`), "utf8");
}

await build({
  entryPoints: [path.join(srcDir, "server.mjs")],
  outfile: path.join(pluginRoot, "scripts", "prd-clarification-server.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node20"],
  minify: false,
  sourcemap: false,
  legalComments: "inline"
});

console.log(JSON.stringify({
  server: "scripts/prd-clarification-server.mjs",
  app: "assets/prd-clarification-questionnaire.html",
  preview: previewOutput,
  appBytes: Buffer.byteLength(html)
}, null, 2));
