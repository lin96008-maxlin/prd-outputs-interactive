import { App } from "@modelcontextprotocol/ext-apps";
import { buildAnswerContext, CUSTOM_OPTION_VALUE, getNextQuestionId, normalizeQuestionnaire, PAGE_SIZE } from "./questionnaire-contract.mjs";

const root = document.getElementById("prd-questionnaire-root");
const state = { questionnaire: null, page: 0, answers: {}, customAnswers: {}, submitted: false, app: null };
let pendingAutoAdvanceTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function answerValue(question) {
  if (question.type === "multi") return Array.isArray(state.answers[question.id]) ? state.answers[question.id] : [];
  return state.answers[question.id] ?? "";
}

function questionControl(question) {
  const value = answerValue(question);
  const titleId = `question-title-${question.id}`;
  if (question.type === "single" || question.type === "multi") {
    const inputType = question.type === "single" ? "radio" : "checkbox";
    const inputName = `${state.questionnaire.questionnaireId}-${question.id}`;
    const customSelected = question.type === "single" ? value === CUSTOM_OPTION_VALUE : value.includes(CUSTOM_OPTION_VALUE);
    const hasRegularSelection = question.type === "multi" && value.some(item => item !== CUSTOM_OPTION_VALUE);
    const customLabel = question.type === "multi" ? (hasRegularSelection ? "补充说明" : "其他答案") : "填写其他答案";
    const customPlaceholder = question.type === "multi" && hasRegularSelection ? "可补充所选答案之外的说明" : "请输入其他答案";
    return `<div class="answer-options" role="${question.type === "single" ? "radiogroup" : "group"}">
      ${question.options.map(option => {
        const checked = question.type === "single" ? value === option.value : value.includes(option.value);
        return `<label class="answer-option${checked ? " is-selected" : ""}">
          <input type="${inputType}" name="${escapeHtml(inputName)}" value="${escapeHtml(option.value)}" autocomplete="off" ${checked ? "checked" : ""}>
          <span class="answer-indicator"></span>
          <span class="answer-option-copy"><span class="answer-option-title">${escapeHtml(option.label)}</span>${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}</span>
        </label>`;
      }).join("")}
      <label class="answer-option is-custom${customSelected ? " is-selected" : ""}">
        <input type="${inputType}" name="${escapeHtml(inputName)}" value="${CUSTOM_OPTION_VALUE}" autocomplete="off" ${customSelected ? "checked" : ""}>
        <span class="answer-indicator"></span>
        <span class="answer-option-copy"><span class="answer-option-title" data-custom-label>${customLabel}</span></span>
      </label>
    </div>
    <div class="custom-answer-row${customSelected ? " is-visible" : ""}">
      <textarea class="custom-answer-input" data-custom-answer-id="${escapeHtml(question.id)}" data-auto-grow rows="1" maxlength="2000" placeholder="${customPlaceholder}" aria-label="${escapeHtml(question.prompt)}的${customLabel}" autocomplete="off">${escapeHtml(state.customAnswers[question.id] || "")}</textarea>
    </div>`;
  }
  const isLongText = question.type === "long-text";
  return `<textarea class="text-answer" data-answer-id="${escapeHtml(question.id)}" data-auto-grow rows="1" maxlength="${isLongText ? 2000 : 500}" placeholder="${isLongText ? "请填写具体场景、规则或例外情况" : "请输入答案"}" aria-labelledby="${escapeHtml(titleId)}" autocomplete="off">${escapeHtml(value)}</textarea>`;
}

function updateMultiCustomPresentation(item, question) {
  if (question.type !== "multi") return;
  const regularSelected = Array.from(item.querySelectorAll('.answer-option input:checked'))
    .some(input => input.value !== CUSTOM_OPTION_VALUE);
  const label = regularSelected ? "补充说明" : "其他答案";
  const labelNode = item.querySelector("[data-custom-label]");
  const textarea = item.querySelector("[data-custom-answer-id]");
  if (labelNode) labelNode.textContent = label;
  if (textarea) {
    textarea.placeholder = regularSelected ? "可补充所选答案之外的说明" : "请输入其他答案";
    textarea.setAttribute("aria-label", `${question.prompt}的${label}`);
  }
}

function collectCurrentPage() {
  if (!state.questionnaire) return;
  root.querySelectorAll("[data-question-id]").forEach(node => {
    const id = node.dataset.questionId;
    const question = state.questionnaire.questions.find(item => item.id === id);
    if (!question) return;
    if (question.type === "single") {
      state.answers[id] = node.querySelector("input:checked")?.value || "";
    } else if (question.type === "multi") {
      state.answers[id] = Array.from(node.querySelectorAll("input:checked")).map(input => input.value);
    } else {
      state.answers[id] = node.querySelector("[data-answer-id]")?.value.trim() || "";
    }
    const customInput = node.querySelector("[data-custom-answer-id]");
    if (customInput) state.customAnswers[id] = customInput.value.trim();
  });
}

function isAnswerValid(question) {
  const value = answerValue(question);
  const hasSelection = Array.isArray(value) ? value.length > 0 : String(value).trim().length > 0;
  if (!hasSelection) return false;
  const customSelected = Array.isArray(value) ? value.includes(CUSTOM_OPTION_VALUE) : value === CUSTOM_OPTION_VALUE;
  return !customSelected || String(state.customAnswers[question.id] || "").trim().length > 0;
}

function validateCurrentPage() {
  collectCurrentPage();
  const start = state.page * PAGE_SIZE;
  const current = state.questionnaire.questions.slice(start, start + PAGE_SIZE);
  const missing = current.filter(question => question.required && !isAnswerValid(question));
  root.querySelectorAll("[data-question-id]").forEach(node => {
    const invalid = missing.some(question => question.id === node.dataset.questionId);
    node.classList.toggle("has-error", invalid);
    const inlineError = node.querySelector("[data-question-error]");
    if (inlineError) {
      inlineError.hidden = !invalid;
      const customSelected = node.querySelector(`input[value="${CUSTOM_OPTION_VALUE}"]`)?.checked;
      inlineError.textContent = invalid ? (customSelected ? "请填写自定义答案。" : "请选择或填写一个答案。") : "";
    }
    node.querySelectorAll("input,textarea").forEach(control => control.setAttribute("aria-invalid", String(invalid)));
  });
  const error = root.querySelector("[data-form-error]");
  if (error) {
    error.hidden = missing.length === 0;
    error.textContent = missing.length ? `还有 ${missing.length} 个必答问题未完成` : "";
    if (missing.length) error.focus({ preventScroll: true });
  }
  if (missing[0]) {
    const firstInvalid = root.querySelector(`[data-question-id="${CSS.escape(missing[0].id)}"]`);
    firstInvalid?.scrollIntoView({ block: "center", behavior: "smooth" });
    const customSelected = firstInvalid?.querySelector(`input[value="${CUSTOM_OPTION_VALUE}"]`)?.checked;
    const focusTarget = customSelected
      ? firstInvalid?.querySelector("[data-custom-answer-id]")
      : firstInvalid?.querySelector("input,textarea");
    focusTarget?.focus({ preventScroll: true });
  }
  return missing.length === 0;
}

function clearQuestionError(item) {
  item.classList.remove("has-error");
  item.querySelectorAll("input,textarea").forEach(control => control.setAttribute("aria-invalid", "false"));
  const inlineError = item.querySelector("[data-question-error]");
  if (inlineError) { inlineError.hidden = true; inlineError.textContent = ""; }
  const summary = root.querySelector("[data-form-error]");
  if (summary) { summary.hidden = true; summary.textContent = ""; }
}

function autoGrowTextarea(textarea) {
  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, 180);
  textarea.style.height = `${Math.max(40, nextHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
}

function cancelPendingAutoAdvance() {
  if (pendingAutoAdvanceTimer === null) return;
  clearTimeout(pendingAutoAdvanceTimer);
  pendingAutoAdvanceTimer = null;
}

function scrollToNextQuestion(item) {
  cancelPendingAutoAdvance();
  const questionIds = Array.from(root.querySelectorAll("[data-question-id]"), node => node.dataset.questionId);
  const nextQuestionId = getNextQuestionId(questionIds, item.dataset.questionId);
  if (!nextQuestionId) return;

  const scheduledPage = state.page;
  pendingAutoAdvanceTimer = setTimeout(() => {
    pendingAutoAdvanceTimer = null;
    if (state.page !== scheduledPage || !item.isConnected) return;

    const next = root.querySelector(`[data-question-id="${CSS.escape(nextQuestionId)}"]`);
    if (!next) return;
    const rect = next.getBoundingClientRect();
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const inset = 12;
    const fullyVisible = rect.top >= inset && rect.bottom <= viewportHeight - inset;
    if (fullyVisible) return;

    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    next.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
  }, 80);
}

function focusCurrentPageFirstQuestion() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const firstQuestion = root.querySelector("[data-question-id]");
    if (!firstQuestion) return;
    firstQuestion.scrollIntoView({ behavior: "auto", block: "start" });
    firstQuestion.querySelector(".question-heading h2")?.focus({ preventScroll: true });
  }));
}

function syncControlsFromState() {
  root.querySelectorAll("[data-question-id]").forEach(item => {
    const question = state.questionnaire.questions.find(candidate => candidate.id === item.dataset.questionId);
    if (!question) return;
    const value = answerValue(question);
    item.querySelectorAll(".answer-option input").forEach(input => {
      input.checked = Array.isArray(value) ? value.includes(input.value) : value === input.value;
      input.closest(".answer-option")?.classList.toggle("is-selected", input.checked);
    });
    const customSelected = Array.isArray(value) ? value.includes(CUSTOM_OPTION_VALUE) : value === CUSTOM_OPTION_VALUE;
    item.querySelector(".custom-answer-row")?.classList.toggle("is-visible", customSelected);
    const customInput = item.querySelector("[data-custom-answer-id]");
    if (customInput) {
      customInput.value = state.customAnswers[question.id] || "";
      autoGrowTextarea(customInput);
    }
    const textInput = item.querySelector("[data-answer-id]");
    if (textInput) {
      textInput.value = typeof value === "string" ? value : "";
      autoGrowTextarea(textInput);
    }
    updateMultiCustomPresentation(item, question);
  });
}

function render() {
  cancelPendingAutoAdvance();
  const questionnaire = state.questionnaire;
  if (!questionnaire) {
    root.innerHTML = '<div class="loading-state"><span></span>正在准备需求澄清问卷…</div>';
    return;
  }
  if (state.submitted) return;
  const totalPages = Math.ceil(questionnaire.questions.length / PAGE_SIZE);
  const start = state.page * PAGE_SIZE;
  const questions = questionnaire.questions.slice(start, start + PAGE_SIZE);
  const progress = Math.round(((state.page + 1) / totalPages) * 100);
  root.innerHTML = `
    <main class="questionnaire-shell">
      <header class="questionnaire-header">
        <span>第 ${state.page + 1} / ${totalPages} 页</span>
        <span>${questionnaire.questions.length} 题</span>
      </header>
      <div class="progress-track" role="progressbar" aria-label="问卷进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <form novalidate autocomplete="off">
        <div class="form-error" data-form-error role="alert" tabindex="-1" hidden></div>
        <div class="question-list">
          ${questions.map((question, index) => `<section class="question-item" data-question-id="${escapeHtml(question.id)}">
            <div class="question-heading">
              <span class="question-number">${String(start + index + 1).padStart(2, "0")}</span>
              <h2 id="question-title-${escapeHtml(question.id)}" tabindex="-1">${escapeHtml(question.prompt)}${question.required ? '<em aria-label="必答" title="必答">*</em>' : ""}</h2>
            </div>
            <div class="question-response">
              ${questionControl(question)}
              <div class="question-error" data-question-error role="alert" hidden></div>
            </div>
          </section>`).join("")}
        </div>
        <footer class="questionnaire-actions">
          <button type="button" class="secondary" data-action="prev" ${state.page === 0 ? "disabled" : ""}>上一页</button>
          <span>答案仅用于当前对话</span>
          <button type="submit" class="primary">${state.page === totalPages - 1 ? "提交问卷" : "下一页"}</button>
        </footer>
      </form>
    </main>`;

  root.querySelectorAll(".answer-option input").forEach(input => input.addEventListener("change", () => {
    cancelPendingAutoAdvance();
    const item = input.closest("[data-question-id]");
    item.querySelectorAll(".answer-option").forEach(option => option.classList.toggle("is-selected", option.querySelector("input").checked));
    const customSelected = item.querySelector(`input[value="${CUSTOM_OPTION_VALUE}"]`)?.checked;
    item.querySelector(".custom-answer-row")?.classList.toggle("is-visible", Boolean(customSelected));
    collectCurrentPage();
    const question = state.questionnaire.questions.find(candidate => candidate.id === item.dataset.questionId);
    updateMultiCustomPresentation(item, question);
    if (isAnswerValid(question)) clearQuestionError(item);
    if (question.type === "single" && input.value !== CUSTOM_OPTION_VALUE && input.checked) scrollToNextQuestion(item);
  }));
  root.querySelectorAll("[data-custom-answer-id]").forEach(customInput => {
    const selectCustomOption = () => {
      const item = customInput.closest("[data-question-id]");
      const selector = item.querySelector(`input[value="${CUSTOM_OPTION_VALUE}"]`);
      if (selector && !selector.checked) {
        selector.checked = true;
        selector.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    customInput.addEventListener("focus", selectCustomOption);
    customInput.addEventListener("input", () => {
      selectCustomOption();
      autoGrowTextarea(customInput);
      collectCurrentPage();
      const item = customInput.closest("[data-question-id]");
      const question = state.questionnaire.questions.find(candidate => candidate.id === item.dataset.questionId);
      if (isAnswerValid(question)) clearQuestionError(item);
    });
  });
  root.querySelectorAll("[data-answer-id]").forEach(control => control.addEventListener("input", () => {
    if (control.matches("[data-auto-grow]")) autoGrowTextarea(control);
    collectCurrentPage();
    const item = control.closest("[data-question-id]");
    const question = state.questionnaire.questions.find(candidate => candidate.id === item.dataset.questionId);
    if (!question.required || isAnswerValid(question)) clearQuestionError(item);
  }));
  root.querySelectorAll("[data-auto-grow]").forEach(autoGrowTextarea);
  requestAnimationFrame(syncControlsFromState);
  root.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
    collectCurrentPage();
    state.page = Math.max(0, state.page - 1);
    render();
    focusCurrentPageFirstQuestion();
  });
  root.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!validateCurrentPage()) return;
    if (state.page < totalPages - 1) {
      state.page += 1;
      render();
      focusCurrentPageFirstQuestion();
      return;
    }
    await submitQuestionnaire();
  });
}

async function submitQuestionnaire() {
  collectCurrentPage();
  const payload = buildAnswerContext(state.questionnaire, state.answers, state.customAnswers);
  const contextText = `[PRD_CLARIFICATION_ANSWERS]\n${JSON.stringify(payload, null, 2)}\n[/PRD_CLARIFICATION_ANSWERS]`;
  const primary = root.querySelector(".primary");
  if (primary) { primary.disabled = true; primary.textContent = "正在提交…"; }
  try {
    if (state.app) {
      await state.app.updateModelContext({ content: [{ type: "text", text: contextText }] });
      await state.app.sendMessage({
        role: "user",
        content: [{ type: "text", text: "我已提交 PRD 需求澄清问卷，请读取问卷答案并继续当前分析或 PRD 撰写。" }]
      });
    }
    state.submitted = true;
    root.innerHTML = `<div class="success-state"><span class="success-icon">✓</span><h2>答案已提交</h2><p>Agent 将根据本轮确认结果继续整理需求。</p></div>`;
  } catch (error) {
    root.innerHTML = `<div class="fallback-state"><h2>答案已整理，但未能自动发送</h2><p>请复制以下内容并发送到当前对话。</p><textarea readonly>${escapeHtml(contextText)}</textarea><button type="button" class="primary" data-copy>复制答案</button><span data-copy-status></span></div>`;
    root.querySelector("[data-copy]").addEventListener("click", async () => {
      await navigator.clipboard.writeText(contextText);
      root.querySelector("[data-copy-status]").textContent = "已复制";
    });
  }
}

function loadQuestionnaire(raw) {
  const candidate = raw?.questionnaire || raw;
  try {
    state.questionnaire = normalizeQuestionnaire(candidate);
    state.page = 0;
    render();
  } catch (error) {
    root.innerHTML = `<div class="error-state"><h2>问卷数据无法读取</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

const preview = globalThis.__PRD_QUESTIONNAIRE_PREVIEW__;
if (preview) {
  loadQuestionnaire(preview);
} else {
  const app = new App({ name: "PRD Clarification Questionnaire", version: "0.1.0" }, {}, { autoResize: true });
  state.app = app;
  app.ontoolinput = params => loadQuestionnaire(params?.arguments);
  app.ontoolresult = result => result?.structuredContent && loadQuestionnaire(result.structuredContent);
  app.onhostcontextchanged = context => {
    document.documentElement.dataset.theme = context?.theme === "dark" ? "dark" : "light";
    document.documentElement.lang = context?.locale?.split("-")[0] || "zh";
  };
  render();
  app.connect().catch(error => {
    root.innerHTML = `<div class="error-state"><h2>无法连接问卷宿主</h2><p>${escapeHtml(error.message)}</p></div>`;
  });
}
