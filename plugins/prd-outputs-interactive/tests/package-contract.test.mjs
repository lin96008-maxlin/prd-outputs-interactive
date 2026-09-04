import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Plugin 清单、MCP 配置与运行文件一致", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const mcp = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"));
  assert.equal(manifest.name, "prd-outputs-interactive");
  assert.equal(manifest.interface.displayName, "问卷式PRD撰写");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  const serverConfig = mcp.mcpServers.prd_clarification;
  assert.equal(serverConfig.command, "node");
  assert.ok(fs.existsSync(path.resolve(pluginRoot, serverConfig.args[0])));
});

test("MCP App 是单 HTML 且没有外部运行依赖", () => {
  const html = fs.readFileSync(path.join(pluginRoot, "assets", "prd-clarification-questionnaire.html"), "utf8");
  assert.match(html, /id="prd-questionnaire-root"/);
  assert.match(html, /__custom__/);
  assert.match(html, /custom-answer-input/);
  assert.match(html, /data-auto-grow/);
  assert.match(html, /scrollIntoView/);
  assert.doesNotMatch(html, /<(?:script|img|iframe|source)\b[^>]*\bsrc\s*=/i);
  const linkHrefs = Array.from(html.matchAll(/<link\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi), match => match[2]);
  assert.ok(linkHrefs.every(href => href.startsWith("data:")));
  assert.doesNotMatch(html, /@import\s+url|url\(\s*["']?https?:/i);
});

test("交互式 Skill 名称、问卷路由和降级规则存在", () => {
  const skill = fs.readFileSync(path.join(pluginRoot, "skills", "prd-outputs-interactive", "SKILL.md"), "utf8");
  const agentConfig = fs.readFileSync(path.join(pluginRoot, "skills", "prd-outputs-interactive", "agents", "openai.yaml"), "utf8");
  assert.match(skill, /^name: prd-outputs-interactive$/m);
  assert.match(skill, /中文名\/触发词：问卷式PRD撰写/);
  assert.match(agentConfig, /display_name: "问卷式PRD撰写"/);
  assert.match(skill, /open_prd_clarification_questionnaire/);
  assert.match(skill, /MCP Apps 不可用时/);
  assert.match(skill, /需求单元/);
  assert.match(skill, /能力地图/);
  const appSource = fs.readFileSync(path.join(pluginRoot, "src", "questionnaire-app.mjs"), "utf8");
  const appStyles = fs.readFileSync(path.join(pluginRoot, "src", "questionnaire.css"), "utf8");
  assert.match(appSource, /补充说明/);
  assert.match(appSource, /填写其他答案/);
  assert.match(appSource, /<textarea class="text-answer"[^>]*data-auto-grow/);
  assert.match(appSource, /control\.matches\("\[data-auto-grow\]"\).*autoGrowTextarea\(control\)/);
  assert.match(appSource, /function focusCurrentPageFirstQuestion\(\)/);
  assert.match(appSource, /scrollIntoView\(\{ behavior: "auto", block: "start" \}\)/);
  assert.match(appSource, /getNextQuestionId\(questionIds, item\.dataset\.questionId\)/);
  assert.match(appSource, /clearTimeout\(pendingAutoAdvanceTimer\)/);
  assert.match(appSource, /block: "nearest", inline: "nearest"/);
  assert.equal((appSource.match(/focusCurrentPageFirstQuestion\(\);/g) || []).length, 2);
  assert.match(appSource, /tabindex="-1"/);
  assert.doesNotMatch(appSource, /is-long-list/);
  assert.match(appStyles, /\.answer-options\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(appStyles, /repeat\(2/);
});

test("最终 PRD 使用直白章节并保持完整规格", () => {
  const skillRoot = path.join(pluginRoot, "skills", "prd-outputs-interactive");
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  const template = fs.readFileSync(path.join(skillRoot, "references", "templates.md"), "utf8");
  const example = fs.readFileSync(path.join(skillRoot, "references", "example-ecommerce-order-management-prd.md"), "utf8");
  for (const heading of ["PRD 概览", "业务流程与功能结构", "详细需求", "共用规则与数据", "验收与交付", "验收场景", "待确认项"]) {
    assert.match(template, new RegExp(heading));
  }
  assert.match(example, /REQ-001/);
  assert.match(example, /TC-001/);
  assert.match(example, /来源/);
  assert.match(example, /权限/);
  assert.match(example, /恢复/);
  assert.match(skill, /内部方法名.*不作为默认章节标题|不(?:要)?把内部方法名/);
});

test("正式规范和示例只描述当前有效内容", () => {
  const skillRoot = path.join(pluginRoot, "skills", "prd-outputs-interactive");
  const files = [
    "SKILL.md",
    path.join("references", "templates.md"),
    path.join("references", "example-ecommerce-order-management-prd.md"),
    path.join("references", "example-multi-source-change-analysis.md")
  ];
  const content = files.map(file => fs.readFileSync(path.join(skillRoot, file), "utf8")).join("\n");
  assert.doesNotMatch(content, /(?:去除版|移除版|不含.+版|无.+版|为了避免.+(?:删除|移除)|为规避.+(?:删除|移除)|区别于.+(?:Skill|插件))/i);
});

test("新建 PRD 使用日期主题版本文件名", () => {
  const naming = fs.readFileSync(path.join(pluginRoot, "skills", "prd-outputs-interactive", "references", "naming-and-files.md"), "utf8");
  const skill = fs.readFileSync(path.join(pluginRoot, "skills", "prd-outputs-interactive", "SKILL.md"), "utf8");
  assert.match(naming, /<YYYYMMDD><需求主题>PRD-v1\.md/);
  assert.match(naming, /20260901任务中心移动端PRD-v1\.md/);
  assert.match(skill, /YYYYMMDD需求主题PRD-v1\.md/);
});
