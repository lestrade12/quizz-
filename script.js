
const STORAGE_KEY = "vquiz_local_quizzes_v2";

const state = {
  quizzes: loadQuizzes(),
  currentSharedQuiz: null,
};

const views = {
  home: document.getElementById("homeView"),
  create: document.getElementById("createView"),
  library: document.getElementById("libraryView"),
  play: document.getElementById("playView"),
};

const tabs = document.querySelectorAll(".tab");
const questionsContainer = document.getElementById("questionsContainer");
const questionTemplate = document.getElementById("questionTemplate");

document.getElementById("goCreateBtn").addEventListener("click", () => switchView("create"));
document.getElementById("goLibraryBtn").addEventListener("click", () => switchView("library"));
document.getElementById("backHomeBtn").addEventListener("click", () => switchView("home"));
document.getElementById("addQuestionBtn").addEventListener("click", () => addQuestionBlock());
document.getElementById("resetBuilderBtn").addEventListener("click", resetBuilder);
document.getElementById("quizForm").addEventListener("submit", handleSaveQuiz);
document.getElementById("solveForm").addEventListener("submit", handleSolveQuiz);

tabs.forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));

init();

function init() {
  addQuestionBlock();
  addQuestionBlock();
  renderLibrary();
  updateStats();
  loadSharedQuizFromUrl();
}

function switchView(name) {
  Object.values(views).forEach(v => v.classList.remove("active"));
  views[name].classList.add("active");
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.view === name));
  if (name === "play") {
    tabs.forEach(tab => tab.classList.remove("active"));
  }
}

function addQuestionBlock(prefill = null) {
  const clone = questionTemplate.content.cloneNode(true);
  const block = clone.querySelector(".question-block");
  const removeBtn = clone.querySelector(".remove-btn");
  removeBtn.addEventListener("click", () => {
    block.remove();
    renumberQuestions();
  });

  if (prefill) {
    clone.querySelector(".q-text").value = prefill.text || "";
    const opts = clone.querySelectorAll(".q-option");
    opts.forEach((input, i) => input.value = prefill.options?.[i] || "");
    clone.querySelector(".q-correct").value = String(prefill.correctIndex ?? 0);
  }

  questionsContainer.appendChild(clone);
  renumberQuestions();
}

function renumberQuestions() {
  [...questionsContainer.querySelectorAll(".question-block")].forEach((block, idx) => {
    block.querySelector(".question-number").textContent = `Вопрос ${idx + 1}`;
  });
}

function resetBuilder() {
  document.getElementById("quizForm").reset();
  questionsContainer.innerHTML = "";
  addQuestionBlock();
  addQuestionBlock();
}

function handleSaveQuiz(e) {
  e.preventDefault();

  const title = document.getElementById("quizTitle").value.trim();
  const author = document.getElementById("quizAuthor").value.trim();
  const description = document.getElementById("quizDescription").value.trim();

  const questionBlocks = [...document.querySelectorAll(".question-block")];
  const questions = questionBlocks.map(block => ({
    text: block.querySelector(".q-text").value.trim(),
    options: [...block.querySelectorAll(".q-option")].map(i => i.value.trim()),
    correctIndex: Number(block.querySelector(".q-correct").value),
  })).filter(q => q.text && q.options.every(Boolean));

  if (!title || !author) {
    alert("Заполни название и имя автора.");
    return;
  }

  if (questions.length === 0) {
    alert("Добавь хотя бы один вопрос.");
    return;
  }

  const quiz = {
    id: cryptoRandomId(),
    title,
    author,
    description,
    createdAt: new Date().toISOString(),
    questions,
    attempts: [],
  };

  state.quizzes.unshift(quiz);
  saveQuizzes();
  renderLibrary();
  updateStats();
  resetBuilder();
  switchView("library");
}

function renderLibrary() {
  const list = document.getElementById("myQuizzesList");
  const empty = document.getElementById("myQuizzesEmpty");
  list.innerHTML = "";

  if (state.quizzes.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  state.quizzes.forEach(quiz => {
    const shareUrl = buildShareUrl(quiz);
    const avg = quiz.attempts.length
      ? Math.round(quiz.attempts.reduce((s, a) => s + a.scorePercent, 0) / quiz.attempts.length)
      : 0;

    const item = document.createElement("div");
    item.className = "quiz-item";
    item.innerHTML = `
      <div class="quiz-item-top">
        <div>
          <h3>${escapeHtml(quiz.title)}</h3>
          <div class="quiz-meta">
            Автор: ${escapeHtml(quiz.author)} · Вопросов: ${quiz.questions.length} ·
            Проходов на этом устройстве: ${quiz.attempts.length}
          </div>
        </div>
        <span class="badge">${avg}% средний результат</span>
      </div>

      <p class="muted">${escapeHtml(quiz.description || "Без описания")}</p>

      <div class="mono">${escapeHtml(shareUrl)}</div>

      <div class="quiz-actions">
        <button class="primary" data-copy="${quiz.id}">Копировать ссылку</button>
        <button class="secondary" data-open="${quiz.id}">Открыть квиз</button>
        <button class="secondary" data-results="${quiz.id}">Результаты</button>
        <button class="remove-btn" data-delete="${quiz.id}">Удалить</button>
      </div>

      <div id="results-${quiz.id}" class="hidden"></div>
    `;

    item.querySelector(`[data-copy="${quiz.id}"]`).addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert("Ссылка скопирована.");
      } catch {
        alert("Не удалось скопировать. Скопируй вручную.");
      }
    });

    item.querySelector(`[data-open="${quiz.id}"]`).addEventListener("click", () => {
      window.location.href = shareUrl;
    });

    item.querySelector(`[data-delete="${quiz.id}"]`).addEventListener("click", () => {
      if (!confirm("Удалить этот квиз?")) return;
      state.quizzes = state.quizzes.filter(q => q.id !== quiz.id);
      saveQuizzes();
      renderLibrary();
      updateStats();
    });

    item.querySelector(`[data-results="${quiz.id}"]`).addEventListener("click", () => {
      const box = item.querySelector(`#results-${quiz.id}`);
      box.classList.toggle("hidden");
      if (!box.classList.contains("hidden")) {
        box.innerHTML = renderAttemptsHtml(quiz.attempts);
      }
    });

    list.appendChild(item);
  });
}

function renderAttemptsHtml(attempts) {
  if (!attempts.length) {
    return `<p class="footer-note">Пока нет сохраненных прохождений на этом устройстве.</p>`;
  }

  return `
    <div class="answer-review">
      ${attempts.map(a => `
        <div class="review-item">
          <strong>${escapeHtml(a.solverName)}</strong><br>
          Результат: ${a.correctAnswers}/${a.totalQuestions} (${a.scorePercent}%)<br>
          <span class="muted">${new Date(a.finishedAt).toLocaleString("ru-RU")}</span>
        </div>
      `).join("")}
    </div>
    <p class="footer-note">Важно: в статической версии результаты сохраняются локально в браузере того устройства, где проходили тест.</p>
  `;
}

function buildShareUrl(quiz) {
  const payload = {
    id: quiz.id,
    title: quiz.title,
    author: quiz.author,
    description: quiz.description,
    questions: quiz.questions,
  };
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  return `${location.origin}${location.pathname}#play=${encoded}`;
}

function loadSharedQuizFromUrl() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#play=")) return;

  try {
    const encoded = hash.replace("#play=", "");
    const json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    const quiz = JSON.parse(json);
    state.currentSharedQuiz = quiz;
    renderPlayView(quiz);
    switchView("play");
  } catch (err) {
    console.error(err);
    alert("Не удалось открыть квиз по ссылке.");
  }
}

function renderPlayView(quiz) {
  document.getElementById("playTitle").textContent = quiz.title;
  document.getElementById("playMeta").textContent =
    `Автор: ${quiz.author} · Вопросов: ${quiz.questions.length}`;
  document.getElementById("resultBox").classList.add("hidden");
  document.getElementById("resultBox").innerHTML = "";
  document.getElementById("solverName").value = "";

  const wrap = document.getElementById("solveQuestions");
  wrap.innerHTML = quiz.questions.map((q, idx) => `
    <div class="question-block card-soft">
      <h4>Вопрос ${idx + 1}</h4>
      <p><strong>${escapeHtml(q.text)}</strong></p>
      <div class="answer-review">
        ${q.options.map((opt, optIndex) => `
          <label class="card-soft" style="padding:12px; margin:0;">
            <input type="radio" name="solve-${idx}" value="${optIndex}" required />
            ${String.fromCharCode(65 + optIndex)}. ${escapeHtml(opt)}
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function handleSolveQuiz(e) {
  e.preventDefault();
  if (!state.currentSharedQuiz) return;

  const solverName = document.getElementById("solverName").value.trim();
  if (!solverName) {
    alert("Введи имя.");
    return;
  }

  const userAnswers = state.currentSharedQuiz.questions.map((_, idx) => {
    const checked = document.querySelector(`input[name="solve-${idx}"]:checked`);
    return checked ? Number(checked.value) : null;
  });

  const correctAnswers = state.currentSharedQuiz.questions.reduce((sum, q, idx) => {
    return sum + (q.correctIndex === userAnswers[idx] ? 1 : 0);
  }, 0);

  const totalQuestions = state.currentSharedQuiz.questions.length;
  const scorePercent = Math.round((correctAnswers / totalQuestions) * 100);

  const attempt = {
    solverName,
    correctAnswers,
    totalQuestions,
    scorePercent,
    finishedAt: new Date().toISOString(),
  };

  const localQuiz = state.quizzes.find(q => q.id === state.currentSharedQuiz.id);
  if (localQuiz) {
    localQuiz.attempts.unshift(attempt);
    saveQuizzes();
    renderLibrary();
    updateStats();
  }

  const resultBox = document.getElementById("resultBox");
  resultBox.classList.remove("hidden");
  resultBox.innerHTML = `
    <h3>Результат: ${correctAnswers} из ${totalQuestions}</h3>
    <p><strong>${solverName}</strong>, ты набрал <strong>${scorePercent}%</strong>.</p>
    <div class="answer-review">
      ${state.currentSharedQuiz.questions.map((q, idx) => {
        const ok = q.correctIndex === userAnswers[idx];
        return `
          <div class="review-item ${ok ? "correct" : "wrong"}">
            <strong>Вопрос ${idx + 1}.</strong> ${escapeHtml(q.text)}<br>
            Твой ответ: ${userAnswers[idx] !== null ? escapeHtml(q.options[userAnswers[idx]]) : "—"}<br>
            Правильный ответ: ${escapeHtml(q.options[q.correctIndex])}
          </div>
        `;
      }).join("")}
    </div>
    <p class="footer-note">Чтобы автор видел результаты всех друзей в одном месте, следующим шагом подключим backend и базу данных.</p>
  `;
}

function updateStats() {
  document.getElementById("statQuizzes").textContent = state.quizzes.length;
  document.getElementById("statQuestions").textContent =
    state.quizzes.reduce((sum, q) => sum + q.questions.length, 0);
}

function saveQuizzes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.quizzes));
}

function loadQuizzes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function cryptoRandomId() {
  return "qz-" + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
