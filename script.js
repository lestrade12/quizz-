import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CREATED_IDS_KEY = "vquiz_firebase_created_ids";
const THEME_KEY = "vquiz_theme_mode";

const state = {
  myQuizIds: loadCreatedIds(),
  myQuizzes: [],
  activeQuiz: null,
  currentIndex: 0,
  currentScore: 0,
  solverName: "",
  answers: [],
  editingQuizId: null,
};
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user;

  if (user) {
    const name =
      user.first_name + (user.last_name ? " " + user.last_name : "");

    window.TelegramUserName = name;
  }
}
function getRoomCodeFromTelegram() {
  const tg = window.Telegram?.WebApp;

  if (!tg) return null;

  const startParam = tg.initDataUnsafe?.start_param;

  if (!startParam) return null;

  return startParam.trim().toUpperCase();
}

const views = {
  home: document.getElementById("homeView"),
  create: document.getElementById("createView"),
  library: document.getElementById("libraryView"),
  join: document.getElementById("joinView"),
  play: document.getElementById("playView"),
  edit: document.getElementById("editView"),
};

const tabs = document.querySelectorAll(".tab");
const questionsContainer = document.getElementById("questionsContainer");
const editQuestionsContainer = document.getElementById("editQuestionsContainer");
const questionTemplate = document.getElementById("questionTemplate");

document.getElementById("goCreateBtn").addEventListener("click", () => switchView("create"));
document.getElementById("goJoinBtn").addEventListener("click", () => switchView("join"));
document.getElementById("addQuestionBtn").addEventListener("click", () => addQuestionBlock(questionsContainer));
document.getElementById("resetBuilderBtn").addEventListener("click", resetBuilder);
document.getElementById("quizForm").addEventListener("submit", handleSaveQuiz);
document.getElementById("joinForm").addEventListener("submit", handleJoinByCode);
document.getElementById("startQuizBtn").addEventListener("click", startQuiz);
document.getElementById("nextQuestionBtn").addEventListener("click", goNextQuestion);
document.getElementById("finishQuizBtn").addEventListener("click", finishQuiz);
document.getElementById("backLibraryBtn").addEventListener("click", () => switchView("library"));
document.getElementById("themeToggle").addEventListener("click", toggleTheme);
document.getElementById("cancelEditBtn").addEventListener("click", () => switchView("library"));
document.getElementById("addEditQuestionTopBtn").addEventListener("click", () => addQuestionBlock(editQuestionsContainer, null, true));
document.getElementById("addEditQuestionBottomBtn").addEventListener("click", () => addQuestionBlock(editQuestionsContainer, null, false));
document.getElementById("editQuizForm").addEventListener("submit", handleUpdateQuiz);
document.getElementById("retryQuizBtn").addEventListener("click", retryQuiz);
document.getElementById("backToJoinBtn").addEventListener("click", () => switchView("join"));

tabs.forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));

init();

async function init() {
  applySavedTheme();
  addQuestionBlock(questionsContainer);
  addQuestionBlock(questionsContainer);
  updateStats();
  await loadMyQuizzes();

  const roomCode = getRoomCodeFromTelegram();

  if (roomCode) {
    const input = document.getElementById("roomCodeInput");

    if (input) {
      input.value = roomCode;
    }

    await openQuizByCode(roomCode);
  }
}
function switchView(name) {
  Object.values(views).forEach(v => v.classList.remove("active"));
  views[name].classList.add("active");
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.view === name));
  if (name === "play" || name === "edit") tabs.forEach(tab => tab.classList.remove("active"));
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

function buildQuestionBlock(prefill = null, isNew = false) {
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

  if (isNew) {
    const top = clone.querySelector(".question-top");
    const badge = document.createElement("span");
    badge.className = "edit-new-badge";
    badge.textContent = "Новый сверху";
    top.querySelector(".question-number").after(badge);
  }

  return clone;
}

function addQuestionBlock(container, prefill = null, insertTop = false) {
  const node = buildQuestionBlock(prefill, insertTop);
  if (insertTop && container.firstChild) {
    container.prepend(node);
  } else {
    container.appendChild(node);
  }
  renumberQuestions();
}

function renumberQuestions() {
  const createBlocks = [...document.querySelectorAll("#questionsContainer .question-block")];
  createBlocks.forEach((block, idx) => {
    block.querySelector(".question-number").textContent = `Вопрос ${idx + 1}`;
  });

  const editBlocks = [...document.querySelectorAll("#editQuestionsContainer .question-block")];
  editBlocks.forEach((block, idx) => {
    block.querySelector(".question-number").textContent = `Вопрос ${idx + 1}`;
  });
}

function collectQuestions(container) {
  return [...container.querySelectorAll(".question-block")].map(block => ({
    text: block.querySelector(".q-text").value.trim(),
    options: [...block.querySelectorAll(".q-option")].map(i => i.value.trim()),
    correctIndex: Number(block.querySelector(".q-correct").value),
  })).filter(q => q.text && q.options.every(Boolean));
}

function resetBuilder() {
  document.getElementById("quizForm").reset();
  questionsContainer.innerHTML = "";
  addQuestionBlock(questionsContainer);
  addQuestionBlock(questionsContainer);
}

async function handleSaveQuiz(e) {
  e.preventDefault();

  const title = document.getElementById("quizTitle").value.trim();
  const author = document.getElementById("quizAuthor").value.trim();
  const description = document.getElementById("quizDescription").value.trim();
  const questions = collectQuestions(questionsContainer);

  if (!title || !author) return alert("Заполни название и автора.");
  if (!questions.length) return alert("Добавь хотя бы один вопрос.");

  const roomCode = await generateUniqueRoomCode();

  const payload = {
    roomCode,
    title,
    author,
    description,
    questions,
    createdAt: serverTimestamp(),
  };

  try {
    const ref = await addDoc(collection(db, "quizzes"), payload);
    state.myQuizIds.unshift(ref.id);
    saveCreatedIds();
    resetBuilder();
    await loadMyQuizzes();
    switchView("library");
    alert(`Квиз сохранён. Код комнаты: ${roomCode}`);
  } catch (err) {
    console.error(err);
    alert("Ошибка при сохранении квиза в Firebase.");
  }
}

async function loadMyQuizzes() {
  if (!state.myQuizIds.length) {
    state.myQuizzes = [];
    renderLibrary();
    updateStats();
    return;
  }

  const loaded = [];
  for (const id of state.myQuizIds) {
    try {
      const snap = await getDoc(doc(db, "quizzes", id));
      if (snap.exists()) {
        loaded.push({ id: snap.id, ...snap.data() });
      }
    } catch (err) {
      console.error("Failed to load quiz", id, err);
    }
  }

  state.myQuizzes = loaded;
  renderLibrary();
  updateStats();
}

function renderLibrary() {
  const list = document.getElementById("myQuizzesList");
  const empty = document.getElementById("myQuizzesEmpty");
  list.innerHTML = "";

  if (!state.myQuizzes.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  state.myQuizzes.forEach(quiz => {
    const item = document.createElement("div");
    item.className = "quiz-item";
    item.innerHTML = `
      <div class="quiz-item-top">
        <div>
          <h3>${escapeHtml(quiz.title)}</h3>
          <div class="quiz-meta">
            Автор: ${escapeHtml(quiz.author)} · Вопросов: ${quiz.questions.length}
          </div>
        </div>
        <span class="badge">${quiz.roomCode}</span>
      </div>

      <p class="muted">${escapeHtml(quiz.description || "Без описания")}</p>

      <div class="code-pill">
        Код комнаты:
        <span>${quiz.roomCode}</span>
      </div>

      <div class="quiz-actions">
        <button class="primary" data-copy="${quiz.roomCode}">Копировать код</button>
        <button class="secondary" data-open="${quiz.roomCode}">Открыть</button>
        <button class="secondary" data-edit="${quiz.id}">Изменить квиз</button>
        <button class="secondary" data-results="${quiz.id}">Результаты</button>
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

    item.querySelector(`[data-edit="${quiz.id}"]`).addEventListener("click", () => {
      openEditQuiz(quiz.id);
    });

    item.querySelector(`[data-results="${quiz.id}"]`).addEventListener("click", async () => {
      const box = item.querySelector(`#results-${quiz.id}`);
      box.classList.toggle("hidden");
      if (!box.classList.contains("hidden")) {
        box.innerHTML = "<p class='footer-note'>Загрузка результатов...</p>";
        const html = await renderAttemptsHtml(quiz.id);
        box.innerHTML = html;
      }
    });

    list.appendChild(item);
  });
}

function openEditQuiz(quizId) {
  const quiz = state.myQuizzes.find(q => q.id === quizId);
  if (!quiz) return alert("Квиз не найден.");
  state.editingQuizId = quizId;

  document.getElementById("editQuizTitle").value = quiz.title || "";
  document.getElementById("editQuizAuthor").value = quiz.author || "";
  document.getElementById("editQuizDescription").value = quiz.description || "";
  editQuestionsContainer.innerHTML = "";

  quiz.questions.forEach(q => addQuestionBlock(editQuestionsContainer, q, false));
  switchView("edit");
}

async function handleUpdateQuiz(e) {
  e.preventDefault();
  if (!state.editingQuizId) return;

  const title = document.getElementById("editQuizTitle").value.trim();
  const author = document.getElementById("editQuizAuthor").value.trim();
  const description = document.getElementById("editQuizDescription").value.trim();
  const questions = collectQuestions(editQuestionsContainer);

  if (!title || !author) return alert("Заполни название и автора.");
  if (!questions.length) return alert("Добавь хотя бы один вопрос.");

  try {
    await updateDoc(doc(db, "quizzes", state.editingQuizId), {
      title,
      author,
      description,
      questions,
      updatedAt: serverTimestamp(),
    });
    await loadMyQuizzes();
    switchView("library");
    alert("Квиз обновлён. Код комнаты остался прежним.");
  } catch (err) {
    console.error(err);
    alert("Не удалось обновить квиз.");
  }
}

async function renderAttemptsHtml(quizId) {
  try {
    const qRef = query(
      collection(db, "quizzes", quizId, "attempts"),
      orderBy("finishedAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(qRef);
    if (snap.empty) {
      return `<p class="footer-note">Пока нет результатов.</p>`;
    }

    return snap.docs.map(d => {
      const a = d.data();
      return `
        <div class="card-soft" style="margin-top:10px;">
          <strong>${escapeHtml(a.solverName)}</strong><br>
          ${a.correctAnswers}/${a.totalQuestions} (${a.scorePercent}%)<br>
          <span class="muted">${formatDate(a.finishedAt)}</span>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    return `<p class="footer-note">Не удалось загрузить результаты.</p>`;
  }
}

async function handleJoinByCode(e) {
  e.preventDefault();
  const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  await openQuizByCode(code);
}

async function openQuizByCode(code) {
  try {
    const qRef = query(collection(db, "quizzes"), where("roomCode", "==", code), limit(1));
    const snap = await getDocs(qRef);
    if (snap.empty) {
      alert("Комната с таким кодом не найдена.");
      return;
    }

    const docSnap = snap.docs[0];
    state.activeQuiz = { id: docSnap.id, ...docSnap.data() };

    resetPlayState();
    document.getElementById("playTitle").textContent = state.activeQuiz.title;
    document.getElementById("playMeta").textContent =
      `Автор: ${state.activeQuiz.author} · Код комнаты: ${state.activeQuiz.roomCode}`;
    document.getElementById("playerSetup").classList.remove("hidden");
    document.getElementById("quizRunner").classList.add("hidden");
    document.getElementById("finalResult").classList.add("hidden");
    document.getElementById("retryActions").classList.add("hidden");
    document.getElementById("solverName").value = "";
    switchView("play");
  } catch (err) {
    console.error(err);
    alert("Ошибка при открытии комнаты.");
  }
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
  document.getElementById("finalResult").classList.add("hidden");
  document.getElementById("finalResult").innerHTML = "";
  document.getElementById("retryActions").classList.add("hidden");
  document.getElementById("progressFill").style.width = "0%";
}

function startQuiz() {
  if (!state.activeQuiz) return;
  let name = document.getElementById("solverName").value.trim();

if (!name && window.TelegramUserName) {
  name = window.TelegramUserName;
}
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

async function finishQuiz() {
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
    answers: state.answers,
    finishedAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "quizzes", state.activeQuiz.id, "attempts"), attempt);
  } catch (err) {
    console.error(err);
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
      Результат сохранён в Firebase и доступен автору в разделе «Мои квизы».
    </p>
  `;
  document.getElementById("retryActions").classList.remove("hidden");
}

function retryQuiz() {
  if (!state.activeQuiz) return;
  const previousName = state.solverName;
  resetPlayState();
  document.getElementById("playerSetup").classList.remove("hidden");
  document.getElementById("quizRunner").classList.add("hidden");
  document.getElementById("finalResult").classList.add("hidden");
  document.getElementById("retryActions").classList.add("hidden");
  document.getElementById("solverName").value = previousName || "";
}

function updateStats() {
  document.getElementById("statQuizzes").textContent = state.myQuizzes.length;
  document.getElementById("statQuestions").textContent =
    state.myQuizzes.reduce((sum, q) => sum + q.questions.length, 0);
}

async function generateUniqueRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  while (true) {
    const code = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const qRef = query(collection(db, "quizzes"), where("roomCode", "==", code), limit(1));
    const snap = await getDocs(qRef);
    if (snap.empty) return code;
  }
}

function loadCreatedIds() {
  try {
    return JSON.parse(localStorage.getItem(CREATED_IDS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCreatedIds() {
  localStorage.setItem(CREATED_IDS_KEY, JSON.stringify(state.myQuizIds));
}

function formatDate(value) {
  try {
    if (value?.toDate) return value.toDate().toLocaleString("ru-RU");
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return "Дата недоступна";
  }
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
