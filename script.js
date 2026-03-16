
const STORAGE_KEY = "vquiz_room_theme_v2_quizzes";
const THEME_KEY = "vquiz_room_theme_mode";

const state = {
  quizzes: loadQuizzes(),
  activeQuiz: null,
  currentIndex: 0,
  currentScore: 0,
  solverName: "",
  answers: [],
};

const views = {
  home: document.getElementById("homeView"),
  create: document.getElementById("createView"),
  library: document.getElementById("libraryView"),
  join: document.getElementById("joinView"),
  play: document.getElementById("playView"),
};

const tabs = document.querySelectorAll(".tab");
const questionsContainer = document.getElementById("questionsContainer");
const questionTemplate = document.getElementById("questionTemplate");

document.getElementById("goCreateBtn").addEventListener("click", () => switchView("create"));
document.getElementById("goJoinBtn").addEventListener("click", () => switchView("join"));
document.getElementById("addQuestionBtn").addEventListener("click", () => addQuestionBlock());
document.getElementById("resetBuilderBtn").addEventListener("click", resetBuilder);
document.getElementById("quizForm").addEventListener("submit", handleSaveQuiz);
document.getElementById("joinForm").addEventListener("submit", handleJoinByCode);
document.getElementById("startQuizBtn").addEventListener("click", startQuiz);
document.getElementById("nextQuestionBtn").addEventListener("click", goNextQuestion);
document.getElementById("finishQuizBtn").addEventListener("click", finishQuiz);
document.getElementById("backLibraryBtn").addEventListener("click", () => switchView("library"));
document.getElementById("themeToggle").addEventListener("click", toggleTheme);

tabs.forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));

init();

function init() {
  applySavedTheme();
  addQuestionBlock();
  addQuestionBlock();
  renderLibrary();
  updateStats();
}

function switchView(name) {
  Object.values(views).forEach(v => v.classList.remove("active"));
  views[name].classList.add("active");
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.view === name));
  if (name === "play") tabs.forEach(tab => tab.classList.remove("active"));
}

function applySavedTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("themeToggle").textContent =
    theme === "light" ? "🌙 Тёмная тема" : "☀️ Светлая тема";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applySavedTheme();
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

  if (!title || !author) return alert("Заполни название и автора.");
  if (!questions.length) return alert("Добавь хотя бы один вопрос.");

  const roomCode = generateRoomCode();
  const quiz = {
    id: "qz-" + Math.random().toString(36).slice(2, 10),
    roomCode,
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

  if (!state.quizzes.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  state.quizzes.forEach(quiz => {
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
            Автор: ${escapeHtml(quiz.author)} · Вопросов: ${quiz.questions.length} · Проходов: ${quiz.attempts.length}
          </div>
        </div>
        <span class="badge">${avg}% средний результат</span>
      </div>

      <p class="muted">${escapeHtml(quiz.description || "Без описания")}</p>

      <div class="code-pill">
        Код комнаты:
        <span>${quiz.roomCode}</span>
      </div>

      <div class="quiz-actions">
        <button class="primary" data-copy="${quiz.roomCode}">Копировать код</button>
        <button class="secondary" data-open="${quiz.roomCode}">Открыть</button>
        <button class="secondary" data-results="${quiz.id}">Результаты</button>
        <button class="remove-btn" data-delete="${quiz.id}">Удалить</button>
      </div>

      <div id="results-${quiz.id}" class="hidden"></div>
    `;

    item.querySelector(`[data-copy="${quiz.roomCode}"]`).addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(quiz.roomCode);
        alert("Код комнаты скопирован.");
      } catch {
        alert("Не удалось скопировать код.");
      }
    });

    item.querySelector(`[data-open="${quiz.roomCode}"]`).addEventListener("click", () => {
      openQuizByCode(quiz.roomCode);
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
    return `<p class="footer-note">Пока нет результатов на этом устройстве.</p>`;
  }
  return attempts.map(a => `
    <div class="card-soft" style="margin-top:10px;">
      <strong>${escapeHtml(a.solverName)}</strong><br>
      ${a.correctAnswers}/${a.totalQuestions} (${a.scorePercent}%)<br>
      <span class="muted">${new Date(a.finishedAt).toLocaleString("ru-RU")}</span>
    </div>
  `).join("");
}

function handleJoinByCode(e) {
  e.preventDefault();
  const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  openQuizByCode(code);
}

function openQuizByCode(code) {
  const quiz = state.quizzes.find(q => q.roomCode === code);
  if (!quiz) {
    alert("Комната с таким кодом не найдена.");
    return;
  }
  state.activeQuiz = structuredClone(quiz);
  resetPlayState();
  document.getElementById("playTitle").textContent = quiz.title;
  document.getElementById("playMeta").textContent = `Автор: ${quiz.author} · Код комнаты: ${quiz.roomCode}`;
  document.getElementById("playerSetup").classList.remove("hidden");
  document.getElementById("quizRunner").classList.add("hidden");
  document.getElementById("finalResult").classList.add("hidden");
  document.getElementById("solverName").value = "";
  switchView("play");
}

function resetPlayState() {
  state.currentIndex = 0;
  state.currentScore = 0;
  state.solverName = "";
  state.answers = [];
  document.getElementById("feedbackBox").className = "feedback hidden";
  document.getElementById("feedbackBox").innerHTML = "";
  document.getElementById("nextQuestionBtn").classList.add("hidden");
  document.getElementById("finishQuizBtn").classList.add("hidden");
}

function startQuiz() {
  if (!state.activeQuiz) return;
  const name = document.getElementById("solverName").value.trim();
  if (!name) return alert("Введите имя.");
  state.solverName = name;
  document.getElementById("playerSetup").classList.add("hidden");
  document.getElementById("quizRunner").classList.remove("hidden");
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const quiz = state.activeQuiz;
  const idx = state.currentIndex;
  const q = quiz.questions[idx];

  document.getElementById("questionCountBadge").textContent = `Вопрос ${idx + 1} из ${quiz.questions.length}`;
  document.getElementById("scoreBadge").textContent = `${state.currentScore} правильных`;
  document.getElementById("questionText").textContent = q.text;
  document.getElementById("feedbackBox").className = "feedback hidden";
  document.getElementById("feedbackBox").innerHTML = "";
  document.getElementById("nextQuestionBtn").classList.add("hidden");
  document.getElementById("finishQuizBtn").classList.add("hidden");

  const progress = ((idx) / quiz.questions.length) * 100;
  document.getElementById("progressFill").style.width = `${progress}%`;

  const wrap = document.getElementById("answerOptions");
  wrap.innerHTML = "";

  q.options.forEach((option, optionIndex) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "answer-btn";
    btn.innerHTML = `<strong>${String.fromCharCode(65 + optionIndex)}.</strong> ${escapeHtml(option)}`;
    btn.addEventListener("click", () => handleAnswer(optionIndex, btn));
    wrap.appendChild(btn);
  });
}

function handleAnswer(selectedIndex, clickedBtn) {
  const quiz = state.activeQuiz;
  const q = quiz.questions[state.currentIndex];
  const buttons = [...document.querySelectorAll(".answer-btn")];
  const feedbackBox = document.getElementById("feedbackBox");
  const isCorrect = selectedIndex === q.correctIndex;

  buttons.forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.add("locked");
    if (i === q.correctIndex) btn.classList.add("correct");
  });

  if (!isCorrect) clickedBtn.classList.add("wrong");
  if (isCorrect) {
    state.currentScore += 1;
    feedbackBox.className = "feedback correct";
    feedbackBox.textContent = "Правильно! Отличный ответ.";
  } else {
    feedbackBox.className = "feedback wrong";
    feedbackBox.textContent = `Неправильно. Верный ответ: ${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}`;
  }

  state.answers.push({
    question: q.text,
    selectedIndex,
    correctIndex: q.correctIndex,
    isCorrect,
  });

  document.getElementById("scoreBadge").textContent = `${state.currentScore} правильных`;
  feedbackBox.classList.remove("hidden");

  const isLast = state.currentIndex === quiz.questions.length - 1;
  document.getElementById("nextQuestionBtn").classList.toggle("hidden", isLast);
  document.getElementById("finishQuizBtn").classList.toggle("hidden", !isLast);
}

function goNextQuestion() {
  state.currentIndex += 1;
  renderCurrentQuestion();
}

function finishQuiz() {
  if (!state.activeQuiz) return;
  const total = state.activeQuiz.questions.length;
  const percent = Math.round((state.currentScore / total) * 100);
  document.getElementById("progressFill").style.width = "100%";
  document.getElementById("quizRunner").classList.add("hidden");

  const attempt = {
    solverName: state.solverName,
    correctAnswers: state.currentScore,
    totalQuestions: total,
    scorePercent: percent,
    finishedAt: new Date().toISOString(),
  };

  const original = state.quizzes.find(q => q.roomCode === state.activeQuiz.roomCode);
  if (original) {
    original.attempts.unshift(attempt);
    saveQuizzes();
    renderLibrary();
    updateStats();
  }

  const result = document.getElementById("finalResult");
  result.classList.remove("hidden");
  result.innerHTML = `
    <h3>Квиз завершён</h3>
    <div class="result-summary">
      <div class="result-card"><strong>${escapeHtml(state.solverName)}</strong><br><span class="muted">Игрок</span></div>
      <div class="result-card"><strong>${state.currentScore}/${total}</strong><br><span class="muted">Правильных ответов</span></div>
      <div class="result-card"><strong>${percent}%</strong><br><span class="muted">Итоговый результат</span></div>
    </div>
    <p class="footer-note" style="margin-top:16px;">
      В этой версии ответы проверяются сразу после каждого вопроса.
    </p>
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

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (state.quizzes.some(q => q.roomCode === code));
  return code;
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
