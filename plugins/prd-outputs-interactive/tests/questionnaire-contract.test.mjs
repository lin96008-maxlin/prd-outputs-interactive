import test from "node:test";
import assert from "node:assert/strict";
import { buildAnswerContext, buildFallbackMarkdown, CUSTOM_OPTION_VALUE, getNextQuestionId, normalizeQuestionnaire } from "../src/questionnaire-contract.mjs";

const sampleQuestion = index => ({
  id: `q-${index}`,
  prompt: `第 ${index} 个关键问题`,
  type: "single",
  options: [
    { value: "a", label: "方案 A" },
    { value: "b", label: "方案 B" }
  ]
});

test("问卷最多接受 20 个问题", () => {
  const valid = normalizeQuestionnaire({ title: "范围确认", questions: Array.from({ length: 20 }, (_, index) => sampleQuestion(index + 1)) });
  assert.equal(valid.questions.length, 20);
  assert.throws(() => normalizeQuestionnaire({ title: "超限", questions: Array.from({ length: 21 }, (_, index) => sampleQuestion(index + 1)) }), /最多 20/);
});

test("选择题必须提供有效选项", () => {
  assert.throws(() => normalizeQuestionnaire({ title: "无选项", questions: [{ id: "q", prompt: "请选择", type: "single" }] }), /2–8/);
  assert.throws(() => normalizeQuestionnaire({ title: "重复", questions: [{ ...sampleQuestion(1), options: [{ value: "a", label: "A" }, { value: "a", label: "B" }] }] }), /重复/);
});

test("文本降级和结构化答案保留问题语义", () => {
  const questionnaire = normalizeQuestionnaire({ title: "验收确认", contextSummary: "确认验收责任。", questions: [sampleQuestion(1)] });
  assert.match(buildFallbackMarkdown(questionnaire), /验收确认/);
  const result = buildAnswerContext(questionnaire, { "q-1": "b" });
  assert.equal(result.answers[0].displayValue[0], "方案 B");
  assert.equal(result.answers[0].question, "第 1 个关键问题");
});

test("选择题支持用户填写未列出的答案", () => {
  const questionnaire = normalizeQuestionnaire({ title: "其他方案", questions: [sampleQuestion(1), { ...sampleQuestion(2), type: "multi" }] });
  assert.match(buildFallbackMarkdown(questionnaire), /其他：可自行填写/);
  const result = buildAnswerContext(
    questionnaire,
    { "q-1": CUSTOM_OPTION_VALUE, "q-2": ["a", CUSTOM_OPTION_VALUE] },
    { "q-1": "由业务负责人指定", "q-2": "同时通知审计人员" }
  );
  assert.equal(result.answers[0].value, "由业务负责人指定");
  assert.deepEqual(result.answers[0].displayValue, ["由业务负责人指定"]);
  assert.deepEqual(result.answers[1].value, ["a", "同时通知审计人员"]);
  assert.deepEqual(result.answers[1].displayValue, ["方案 A", "同时通知审计人员"]);
});

test("预设选项不能占用框架保留值", () => {
  assert.throws(() => normalizeQuestionnaire({
    title: "冲突选项",
    questions: [{ ...sampleQuestion(1), options: [{ value: CUSTOM_OPTION_VALUE, label: "其他" }, { value: "b", label: "B" }] }]
  }), /保留选项值/);
});

test("选择题最多支持 8 个长选项", () => {
  const questionnaire = normalizeQuestionnaire({
    title: "长选项验证",
    questions: [{
      id: "many-options",
      prompt: "这个问题包含较长文字，用于确认内容是否自然换行并保持完整可读。",
      type: "single",
      options: Array.from({ length: 8 }, (_, index) => ({ value: `v-${index}`, label: `第 ${index + 1} 个选项`, description: "这是一段较长的选项说明，需要完整显示并根据容器宽度自然换行。" }))
    }]
  });
  assert.equal(questionnaire.questions[0].options.length, 8);
});

test("自动定位只进入相邻下一题，不跳过已回答题", () => {
  const questionIds = Array.from({ length: 10 }, (_, index) => `q-${index + 1}`);
  const answeredQuestionIds = new Set(["q-2", "q-7"]);
  assert.equal(answeredQuestionIds.has("q-7"), true);
  assert.equal(getNextQuestionId(questionIds, "q-5"), "q-6");
  assert.equal(getNextQuestionId(questionIds, "q-10"), null);
  assert.equal(getNextQuestionId(questionIds, "missing"), null);
});
