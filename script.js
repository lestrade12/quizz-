// ===== Storage keys =====
const KEY_QUIZZES = "vquiz_quizzes_v2";
const KEY_SETTINGS = "vquiz_settings_v1";
const KEY_SCORE = "vquiz_score_v1";

// ===== DOM helpers =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ===== State =====
let quizzes = loadQuizzes();
let settings = loadSettings();
let score = loadScore();

let current = null;      // {id, word, options[], correct}
let locked = false;

// ===== Init UI =====
applyStats();
setupTabs();
setupSettingsUI();
renderList();
updateTotals();
loadNext(true); // initial

// ===== Tabs =====
function setupTabs(){
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach(x => x.classList.remove("active"));
      $$(".panel").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      $("#tab-" + btn.dataset.tab).classList.add("active");

      if(btn.dataset.tab === "play") {
        // refresh play state
        applyStats();
        updateTotals();
      }
      if(btn.dataset.tab === "list") renderList();
    });
  });
}

// ===== Settings =====
function loadSettings(){
  try{
    return JSON.parse(localStorage.getItem(KEY_SETTINGS)) ?? {
      shuffleOptions: true,
      autoNext: true
    };
  } catch {
    return { shuffleOptions: true, autoNext: true };
  }
}
function saveSettings(){
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
}
function setupSettingsUI(){
  $("#shuffleOptions").checked = !!settings.shuffleOptions;
  $("#autoNext").checked = !!settings.autoNext;

  $("#shuffleOptions").addEventListener("change", (e)=>{
    settings.shuffleOptions = e.target.checked;
    saveSettings();
    toast("Настройки сохранены ✅", "good");
  });
  $("#autoNext").addEventListener("change", (e)=>{
    settings.autoNext = e.target.checked;
    saveSettings();
    toast("Настройки сохранены ✅", "good");
  });
}

// ===== Quizzes =====
function loadQuizzes(){
  try{
    const raw = localStorage.getItem(KEY_QUIZZES);
    const data = raw ? JSON.parse(raw) : [];
    // normalize
    return Array.isArray(data) ? data.filter(isValidQuiz).map(normalizeQuiz) : [];
  } catch {
    return [];
  }
}
function saveQuizzes(){
  localStorage.setItem(KEY_QUIZZES, JSON.stringify(quizzes));
  updateTotals();
}
function isValidQuiz(q){
  return q && typeof q.word === "string" && Array.isArray(q.options) && q.options.length === 3;
}
function normalizeQuiz(q){
  return {
    id: q.id || cryptoId(),
    word: q.word.trim(),
    options: q.options.map(x => String(x ?? "").trim()),
    correct: Number(q.correct ?? 0)
  };
}
function cryptoId(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// ===== Score =====
function loadScore(){
  try{
    return JSON.parse(localStorage.getItem(KEY_SCORE)) ?? { points: 0, streak: 0, answered: 0 };
  } catch {
    return { points: 0, streak: 0, answered: 0 };
  }
}
function saveScore(){
  localStorage.setItem(KEY_SCORE, JSON.stringify(score));
  applyStats();
}
function resetScore(){
  score = { points: 0, streak: 0, answered: 0 };
  saveScore();
  toast("Счёт сброшен", "good");
}
$("#btnResetScore").addEventListener("click", resetScore);

// ===== Add quiz =====
$("#btnAdd").addEventListener("click", addQuiz);
$("#btnFillDemo").addEventListener("click", fillDemo);

function addQuiz(){
  const word = $("#word").value.trim();
  const o1 = $("#option1").value.trim();
  const o2 = $("#option2").value.trim();
  const o3 = $("#option3").value.trim();
  const correct = Number($("#correct").value);

  if(!word || !o1 || !o2 || !o3){
    $("#addMsg").textContent = "Заполни слово и все 3 варианта.";
    $("#addMsg").className = "small";
    toast("Заполни все поля", "bad");
    return;
  }
  if(new Set([o1,o2,o3]).size < 3){
    toast("Варианты должны отличаться", "bad");
    $("#addMsg").textContent = "Сделай варианты разными.";
    $("#addMsg").className = "small";
    return;
  }

  quizzes.unshift({
    id: cryptoId(),
    word,
    options: [o1,o2,o3],
    correct
  });

  saveQuizzes();
  $("#addMsg").textContent = "Сохранено ✅ Теперь можно играть!";
  $("#addMsg").className = "small";
  toast("Добавлено в базу ✅", "good");

  // clear inputs
  $("#word").value = "";
  $("#option1").value = "";
  $("#option2").value = "";
  $("#option3").value = "";
  $("#correct").value = "0";

  renderList();
  updateTotals();

  // optional: jump to play and show next
  activateTab("play");
  loadNext(true);
}

function fillDemo(){
  $("#word").value = "revenue";
  $("#option1").value = "выручка";
  $("#option2").value = "аренда";
  $("#option3").value = "расход";
  $("#correct").value = "0";
  toast("Демо заполнено", "good");
}

function activateTab(name){
  const btn = $(`.tab[data-tab="${name}"]`);
  if(btn) btn.click();
}

// ===== Play mode =====
$("#btnNext").addEventListener("click", ()=>loadNext(false));

function updateTotals(){
  $("#statTotal").textContent = String(quizzes.length);
  $("#modePill").textContent = quizzes.length ? "Режим: Случайный" : "Нет слов в базе";
}

function loadNext(first){
  $("#feedback").textContent = "";
  $("#feedback").className = "feedback";
  $("#progressBar").style.width = quizzes.length ? "20%" : "0%";

  if(quizzes.length === 0){
    $("#qWord").textContent = "Добавь слова во вкладке “Добавить”";
    $("#answers").innerHTML = "";
    return;
  }

  locked = false;
  current = pickRandomQuiz();
  renderQuestion(current);

  if(!first) toast("Новый вопрос ✨", "good");
}

function pickRandomQuiz(){
  const q = quizzes[Math.floor(Math.random() * quizzes.length)];
  // clone and maybe shuffle options
  const copy = {
    id: q.id,
    word: q.word,
    options: [...q.options],
    correct: q.correct
  };

  if(settings.shuffleOptions){
    // shuffle while tracking correct index
    const indexed = copy.options.map((txt, idx)=>({txt, idx}));
    shuffle(indexed);
    copy.options = indexed.map(x=>x.txt);
    copy.correct = indexed.findIndex(x=>x.idx === q.correct);
  }
  return copy;
}

function renderQuestion(q){
  $("#qWord").textContent = q.word;

  const answersEl = $("#answers");
  answersEl.innerHTML = "";

  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "answer";
    btn.type = "button";
    btn.innerHTML = `<span>${escapeHtml(opt)}</span><span class="mini">Выбрать</span>`;
    btn.addEventListener("click", ()=>checkAnswer(i, btn));
    answersEl.appendChild(btn);
  });
}

function checkAnswer(selectedIndex, btnEl){
  if(locked) return;
  locked = true;

  const isCorrect = selectedIndex === current.correct;
  const answerButtons = $$(".answer");

  answerButtons.forEach((b, i)=>{
    if(i === current.correct) b.classList.add("good");
    if(i === selectedIndex && !isCorrect) b.classList.add("bad");
    b.disabled = true;
  });

  score.answered += 1;

  if(isCorrect){
    score.points += 10 + Math.min(score.streak, 10); // бонус за серию
    score.streak += 1;
    saveScore();

    $("#feedback").textContent = `✅ Правильно! +${10 + Math.min(score.streak-1,10)} очков`;
    $("#feedback").className = "feedback good";

    $("#progressBar").style.width = "100%";
    confettiBurst();
    toast("Верно ✅", "good");
  } else {
    score.streak = 0;
    saveScore();

    $("#feedback").textContent = `❌ Неправильно. Правильный: “${current.options[current.correct]}”`;
    $("#feedback").className = "feedback bad";

    $("#progressBar").style.width = "60%";
    btnEl.classList.add("shake");
    toast("Неверно ❌", "bad");
  }

  if(settings.autoNext){
    setTimeout(()=>loadNext(false), 1200);
  }
}

// ===== List (database) =====
$("#listSearch").addEventListener("input", renderList);
$("#btnClearAll").addEventListener("click", clearAll);
$("#btnExport").addEventListener("click", exportJSON);
$("#importFile").addEventListener("change", importJSON);

function renderList(){
  const q = ($("#listSearch").value || "").trim().toLowerCase();
  const listEl = $("#list");

  const filtered = quizzes.filter(item => {
    const hay = [item.word, ...item.options].join(" ").toLowerCase();
    return !q || hay.includes(q);
  });

  $("#listInfo").textContent = `Показано: ${filtered.length} из ${quizzes.length}`;

  if(filtered.length === 0){
    listEl.innerHTML = `<div class="item"><b>Пусто</b><div class="opts">Добавь слова во вкладке “Добавить”.</div></div>`;
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach(item => {
    const el = document.createElement("div");
    el.className = "item";
    const correctText = item.options[item.correct];

    el.innerHTML = `
      <div class="item-top">
        <div>
          <b>${escapeHtml(item.word)}</b>
          <div class="opts">
            1) ${escapeHtml(item.options[0])}<br/>
            2) ${escapeHtml(item.options[1])}<br/>
            3) ${escapeHtml(item.options[2])}<br/>
            <span style="color:#bff5d0;font-weight:900">✓ Правильный: ${escapeHtml(correctText)}</span>
          </div>
        </div>
        <div class="actions">
          <button class="iconbtn" data-act="play">Играть</button>
          <button class="iconbtn" data-act="edit">Ред</button>
          <button class="iconbtn danger" data-act="del">Удалить</button>
        </div>
      </div>
    `;

    el.querySelector('[data-act="del"]').addEventListener("click", ()=>{
      quizzes = quizzes.filter(x => x.id !== item.id);
      saveQuizzes();
      renderList();
      toast("Удалено", "good");
      updateTotals();
      if(quizzes.length === 0) loadNext(true);
    });

    el.querySelector('[data-act="play"]').addEventListener("click", ()=>{
      activateTab("play");
      // set current by selecting this one (without shuffle tracking issues)
      current = pickSpecific(item.id);
      locked = false;
      renderQuestion(current);
      $("#feedback").textContent = "";
      $("#feedback").className = "feedback";
      $("#progressBar").style.width = "20%";
      toast("Открыт вопрос из базы", "good");
    });

    el.querySelector('[data-act="edit"]').addEventListener("click", ()=>{
      // quick edit: load into add form and replace on save
      activateTab("add");
      $("#word").value = item.word;
      $("#option1").value = item.options[0];
      $("#option2").value = item.options[1];
      $("#option3").value = item.options[2];
      $("#correct").value = String(item.correct);

      $("#addMsg").textContent = "Редактирование: после сохранения заменим старую запись.";
      $("#addMsg").className = "small";

      // Replace mode
      const oldHandler = $("#btnAdd").onclick;
      $("#btnAdd").textContent = "Сохранить изменения";
      $("#btnAdd").dataset.editId = item.id;

      // ensure click uses same addQuiz, but in edit mode
      toast("Режим редактирования ✏️", "good");
    });

    listEl.appendChild(el);
  });
}

// Edit mode: if btnAdd has data-edit-id, replace instead of add
const originalAdd = addQuiz;
function addQuiz(){
  const editId = $("#btnAdd").dataset.editId || "";
  const word = $("#word").value.trim();
  const o1 = $("#option1").value.trim();
  const o2 = $("#option2").value.trim();
  const o3 = $("#option3").value.trim();
  const correct = Number($("#correct").value);

  if(!word || !o1 || !o2 || !o3){
    toast("Заполни все поля", "bad");
    $("#addMsg").textContent = "Заполни слово и все 3 варианта.";
    return;
  }
  if(new Set([o1,o2,o3]).size < 3){
    toast("Варианты должны отличаться", "bad");
    $("#addMsg").textContent = "Сделай варианты разными.";
    return;
  }

  if(editId){
    const idx = quizzes.findIndex(x => x.id === editId);
    if(idx >= 0){
      quizzes[idx] = { id: editId, word, options:[o1,o2,o3], correct };
      saveQuizzes();
      toast("Изменения сохранены ✅", "good");
      $("#addMsg").textContent = "Изменения сохранены ✅";
    }
    // exit edit mode
    delete $("#btnAdd").dataset.editId;
    $("#btnAdd").textContent = "Сохранить";
  } else {
    quizzes.unshift({ id: cryptoId(), word, options:[o1,o2,o3], correct });
    saveQuizzes();
    toast("Добавлено ✅", "good");
    $("#addMsg").textContent = "Сохранено ✅ Теперь можно играть!";
  }

  // clear
  $("#word").value = "";
  $("#option1").value = "";
  $("#option2").value = "";
  $("#option3").value = "";
  $("#correct").value = "0";

  renderList();
  updateTotals();
  activateTab("play");
  loadNext(true);
}

function pickSpecific(id){
  const q = quizzes.find(x=>x.id===id);
  if(!q) return pickRandomQuiz();
  const copy = { id:q.id, word:q.word, options:[...q.options], correct:q.correct };
  if(settings.shuffleOptions){
    const indexed = copy.options.map((txt, idx)=>({txt, idx}));
    shuffle(indexed);
    copy.options = indexed.map(x=>x.txt);
    copy.correct = indexed.findIndex(x=>x.idx===q.correct);
  }
  return copy;
}

function clearAll(){
  if(!confirm("Точно очистить всю базу VQuiz?")) return;
  quizzes = [];
  saveQuizzes();
  renderList();
  updateTotals();
  loadNext(true);
  toast("База очищена", "good");
}

// ===== Export / Import =====
function exportJSON(){
  const blob = new Blob([JSON.stringify(quizzes, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vquiz_export.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Экспорт готов ✅", "good");
}

function importJSON(e){
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(String(reader.result || "[]"));
      if(!Array.isArray(data)) throw new Error("not array");

      const cleaned = data.filter(isValidQuiz).map(normalizeQuiz);
      quizzes = [...cleaned, ...quizzes]; // import on top
      saveQuizzes();
      renderList();
      updateTotals();
      toast(`Импортировано: ${cleaned.length} ✅`, "good");
      e.target.value = "";
    } catch {
      toast("Ошибка импорта: нужен JSON файл", "bad");
      e.target.value = "";
    }
  };
  reader.readAsText(file);
}

// ===== UI: Toasts =====
function toast(text, type="good"){
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(()=>{ el.style.opacity = "0"; el.style.transform = "translateY(8px)"; }, 2200);
  setTimeout(()=>{ el.remove(); }, 2600);
}

// ===== Stats =====
function applyStats(){
  $("#statScore").textContent = String(score.points);
  $("#statStreak").textContent = String(score.streak);
  $("#statTotal").textContent = String(quizzes.length);
}

// ===== Utilities =====
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ===== Confetti (tiny) =====
const canvas = $("#confetti");
const ctx = canvas.getContext("2d");
let confetti = [];
let anim = null;

function resizeCanvas(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function confettiBurst(){
  const n = 80;
  const x = window.innerWidth * 0.5;
  const y = window.innerHeight * 0.25;
  for(let i=0;i<n;i++){
    confetti.push({
      x, y,
      vx: (Math.random()-0.5)*10,
      vy: (Math.random()-1.1)*10,
      g: 0.28 + Math.random()*0.12,
      r: 2 + Math.random()*3,
      a: 1,
      life: 80 + Math.floor(Math.random()*40),
    });
  }
  if(!anim) animateConfetti();
}

function animateConfetti(){
  anim = requestAnimationFrame(animateConfetti);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  confetti.forEach(p=>{
    p.vy += p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;
    p.a = Math.max(0, p.life/120);

    ctx.globalAlpha = p.a;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
  });

  confetti = confetti.filter(p => p.life > 0 && p.y < canvas.height + 40);
  ctx.globalAlpha = 1;

  if(confetti.length === 0){
    cancelAnimationFrame(anim);
    anim = null;
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }
}
