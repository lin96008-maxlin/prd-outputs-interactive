import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("MCP Server 提供问卷工具和 UI 资源", async t => {
  const child = spawn(process.execPath, [path.join(pluginRoot, "scripts", "prd-clarification-server.mjs")], {
    cwd: pluginRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => child.kill());

  let buffer = "";
  let stderr = "";
  const pending = new Map();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id != null && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    }
  });

  let nextId = 0;
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`MCP 请求超时：${method}\n${stderr}`)), 8000);
    pending.set(id, message => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

  const initialized = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "prd-questionnaire-test", version: "0.1.0" }
  });
  assert.equal(initialized.result.serverInfo.name, "prd-clarification-questionnaire");
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);

  const tools = await request("tools/list");
  const questionnaireTool = tools.result.tools.find(item => item.name === "open_prd_clarification_questionnaire");
  assert.ok(questionnaireTool);
  assert.equal(questionnaireTool._meta.ui.resourceUri, "ui://prd-clarification/questionnaire.html");

  const call = await request("tools/call", {
    name: "open_prd_clarification_questionnaire",
    arguments: {
      title: "范围澄清",
      contextSummary: "确认一期范围。",
      questions: Array.from({ length: 4 }, (_, index) => ({
        id: `q-${index + 1}`,
        prompt: `问题 ${index + 1}`,
        type: "single",
        options: [{ value: "yes", label: "是" }, { value: "no", label: "否" }]
      }))
    }
  });
  assert.equal(call.result.structuredContent.questionnaire.questions.length, 4);
  assert.match(call.result.content[0].text, /若当前客户端未显示交互问卷/);

  const resource = await request("resources/read", { uri: "ui://prd-clarification/questionnaire.html" });
  assert.match(resource.result.contents[0].text, /prd-questionnaire-root/);
  assert.match(resource.result.contents[0].mimeType, /mcp-app/);
});
