export const MAX_QUESTIONS = 20;
export const PAGE_SIZE = 5;
export const CUSTOM_OPTION_VALUE = "__custom__";
export const QUESTION_TYPES = new Set(["single", "multi", "short-text", "long-text"]);

function cleanText(value, field, maxLength) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} 不能为空`);
  if (text.length > maxLength) throw new Error(`${field} 不能超过 ${maxLength} 个字符`);
  return text;
}

function normalizeOption(option, questionId, index) {
  if (!option || typeof option !== "object" || Array.isArray(option)) {
    throw new Error(`问题 ${questionId} 的第 ${index + 1} 个选项格式错误`);
  }
  const normalized = {
    value: cleanText(option.value, `问题 ${questionId} 的选项值`, 80),
    label: cleanText(option.label, `问题 ${questionId} 的选项名称`, 120),
    description: String(option.description ?? "").trim().slice(0, 240)
  };
  if (normalized.value === CUSTOM_OPTION_VALUE) throw new Error(`问题 ${questionId} 使用了保留选项值`);
  return normalized;
}

export function normalizeQuestionnaire(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("问卷参数必须是对象");
  if (!Array.isArray(input.questions) || input.questions.length === 0) throw new Error("问卷至少需要 1 个问题");
  if (input.questions.length > MAX_QUESTIONS) throw new Error(`单次问卷最多 ${MAX_QUESTIONS} 个问题`);

  const ids = new Set();
  const questions = input.questions.map((question, index) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      throw new Error(`第 ${index + 1} 个问题格式错误`);
    }
    const id = cleanText(question.id, `第 ${index + 1} 个问题 id`, 80);
    if (ids.has(id)) throw new Error(`问题 id 重复：${id}`);
    ids.add(id);
    const type = cleanText(question.type, `问题 ${id} 的类型`, 40);
    if (!QUESTION_TYPES.has(type)) throw new Error(`问题 ${id} 的类型不支持：${type}`);
    const options = Array.isArray(question.options)
      ? question.options.map((option, optionIndex) => normalizeOption(option, id, optionIndex))
      : [];
    if ((type === "single" || type === "multi") && (options.length < 2 || options.length > 8)) {
      throw new Error(`问题 ${id} 必须提供 2–8 个选项`);
    }
    if ((type === "short-text" || type === "long-text") && options.length) {
      throw new Error(`文本问题 ${id} 不应提供选项`);
    }
    const optionValues = new Set();
    options.forEach(option => {
      if (optionValues.has(option.value)) throw new Error(`问题 ${id} 的选项值重复：${option.value}`);
      optionValues.add(option.value);
    });
    return {
      id,
      section: String(question.section ?? "").trim().slice(0, 80),
      prompt: cleanText(question.prompt, `问题 ${id}`, 300),
      description: String(question.description ?? "").trim().slice(0, 500),
      type,
      required: question.required !== false,
      options
    };
  });

  return {
    format: "prd-clarification-questionnaire@1",
    questionnaireId: String(input.questionnaireId || globalThis.crypto?.randomUUID?.() || `prd-${Date.now()}`),
    title: cleanText(input.title || "PRD 需求澄清", "问卷标题", 120),
    contextSummary: String(input.contextSummary ?? "").trim().slice(0, 600),
    pageSize: PAGE_SIZE,
    questions
  };
}

export function buildFallbackMarkdown(questionnaire) {
  const lines = [
    `## ${questionnaire.title}`,
    "",
    questionnaire.contextSummary || "以下问题会影响需求范围、规则或验收，请按编号回答。",
    ""
  ];
  questionnaire.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}${question.required ? "（必答）" : "（可选）"}`);
    if (question.description) lines.push(`   - 说明：${question.description}`);
    question.options.forEach(option => {
      lines.push(`   - ${option.label}${option.description ? `：${option.description}` : ""}`);
    });
    if (question.type === "single" || question.type === "multi") lines.push("   - 其他：可自行填写未列出的答案");
  });
  lines.push("", "若当前客户端未显示交互问卷，请直接按编号回复，或由 Agent 使用平台原生提问能力分批询问。");
  return lines.join("\n");
}

export function buildAnswerContext(questionnaire, answers, customAnswers = {}) {
  const normalizedAnswers = questionnaire.questions.map(question => {
    const answer = answers[question.id];
    const rawValue = Array.isArray(answer) ? answer.map(value => String(value)) : String(answer ?? "").trim();
    const customSelected = Array.isArray(rawValue) ? rawValue.includes(CUSTOM_OPTION_VALUE) : rawValue === CUSTOM_OPTION_VALUE;
    const customValue = String(customAnswers[question.id] ?? "").trim();
    const labels = question.options
      .filter(option => Array.isArray(rawValue) ? rawValue.includes(option.value) : rawValue === option.value)
      .map(option => option.label);
    if (customSelected && customValue) labels.push(customValue);
    const value = Array.isArray(rawValue)
      ? [...rawValue.filter(item => item !== CUSTOM_OPTION_VALUE), ...(customSelected && customValue ? [customValue] : [])]
      : customSelected ? customValue : rawValue;
    return {
      questionId: question.id,
      question: question.prompt,
      required: question.required,
      value,
      displayValue: labels.length ? labels : value,
      ...(customSelected ? { customValue } : {})
    };
  });
  return {
    format: "prd-clarification-answers@1",
    questionnaireId: questionnaire.questionnaireId,
    title: questionnaire.title,
    submittedAt: new Date().toISOString(),
    answers: normalizedAnswers
  };
}
