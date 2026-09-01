import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const originalRoot = path.resolve(pluginRoot, "..", "..", "待改造skills", "prd-outputs");
const expected = JSON.parse(fs.readFileSync(path.join(pluginRoot, "tests", "original-source-hashes.json"), "utf8"));

test("工作区原 PRD Skill 保持逐文件不变", { skip: !fs.existsSync(originalRoot) }, () => {
  for (const [relative, expectedHash] of Object.entries(expected)) {
    const target = path.join(originalRoot, ...relative.split("/"));
    assert.ok(fs.existsSync(target), `原文件缺失：${relative}`);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex").toUpperCase();
    assert.equal(actual, expectedHash, `原文件发生变化：${relative}`);
  }
});
