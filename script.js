
// ======================================
// Study - 学習管理システム
// ======================================

let appData = StudyStorage.load();

const pageNames = {
  home: "ホーム",
  calendar: "カレンダー",
  tasks: "課題管理",
  materials: "教材管理",
  records: "学習記録",
  grades: "成績分析"
};

let currentPage = "home";
let calendarDate = new Date();
let calendarView = "month";

// --------------------------------------
// 初期化
// --------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("today-label").textContent =
    formatDate(new Date());

  document.getElementById("navigation").addEventListener("click", event => {
    const button = event.target.closest(".nav-item");
    if (!button) return;
    showPage(button.dataset.page);
  });

  showPage("home");
});

// --------------------------------------
// 共通処理
// --------------------------------------

function saveData() {
  StudyStorage.save(appData);
}

function formatDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayString() {
  return dateString(new Date());
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showPage(page) {
  if (!pageNames[page]) return;

  currentPage = page;

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  document.getElementById("page-title").textContent = pageNames[page];

  const content = document.getElementById("page-content");

  switch (page) {
    case "home":
      renderHome(content);
      break;
    case "calendar":
      renderCalendar(content);
      break;
    case "tasks":
      renderTasks(content);
      break;
    case "materials":
      renderMaterials(content);
      break;
    case "records":
      renderRecords(content);
      break;
    case "grades":
      renderGrades(content);
      break;
  }
}

// --------------------------------------
// ホーム
// --------------------------------------

function renderHome(content) {
  const today = todayString();

  const todayEvents = appData.events.filter(item => item.date === today);
  const pendingTasks = appData.tasks.filter(item => item.status !== "completed");

  const upcomingTasks = pendingTasks
    .filter(item => item.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const totalMinutes = appData.records
    .filter(item => item.date === today)
    .reduce((sum, item) => sum + Number(item.minutes || 0), 0);

  content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">今日の予定</div>
        <div class="stat-value">${todayEvents.length}<span class="muted"> 件</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">未完了の課題</div>
        <div class="stat-value">${pendingTasks.length}<span class="muted"> 件</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日の学習時間</div>
        <div class="stat-value">${Math.floor(totalMinutes / 60)}<span class="muted">時間</span>${totalMinutes % 60}<span class="muted">分</span></div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <h2 class="card-title">今日の予定</h2>
        <div class="item-list">
          ${todayEvents.length ? todayEvents.map(item => `
            <div class="list-item">
              <div>
                <strong>${escapeHTML(item.title)}</strong>
                <div class="muted">${escapeHTML(item.time || "時間未設定")}</div>
              </div>
              <span class="tag">${escapeHTML(item.category || "その他")}</span>
            </div>
          `).join("") : `<p class="muted">今日の予定はありません。</p>`}
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">これからの課題</h2>
        <div class="item-list">
          ${upcomingTasks.length ? upcomingTasks.map(item => `
            <div class="list-item">
              <div>
                <strong>${escapeHTML(item.title)}</strong>
                <div class="muted">期限：${escapeHTML(item.dueDate)}</div>
              </div>
              <span class="tag">${escapeHTML(item.subject || "未分類")}</span>
            </div>
          `).join("") : `<p class="muted">課題はありません。</p>`}
        </div>
      </div>

      <div class="card wide">
        <h2 class="card-title">Studyへようこそ</h2>
        <p class="muted">予定・課題・教材・学習記録をまとめて管理しよう。</p>
        <button class="primary-button" onclick="showPage('calendar')">カレンダーを開く</button>
      </div>
    </div>
  `;
}

// --------------------------------------
// カレンダー
// --------------------------------------

function getCategoryStyle(category) {
  const styles = {
    "授業・通常予定": "event-blue",
    "小テスト・定期テスト": "event-green",
    "行事・イベント": "event-purple",
    "休校・休み": "event-red",
    "その他": "event-orange"
  };

  return styles[category] || "event-blue";
}

function renderCalendar(content) {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  let heading;

  if (calendarView === "day") {
    heading = formatDate(calendarDate);
  } else if (calendarView === "week") {
    const start = new Date(calendarDate);
    start.setDate(start.getDate() - start.getDay());

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    heading = `${start.getMonth() + 1}/${start.getDate()} ～ ${end.getMonth() + 1}/${end.getDate()}`;
  } else {
    heading = `${year}年${month + 1}月`;
  }

  let body = "";

  if (calendarView === "month") {
    body = renderMonthView(year, month);
  } else if (calendarView === "week") {
    body = renderWeekView();
  } else {
    body = renderDayView();
  }

  content.innerHTML = `
    <div class="card">
      <div class="calendar-toolbar">
        <div class="calendar-navigation">
          <button class="secondary-button" onclick="changeCalendar(-1)">←</button>
          <button class="secondary-button" onclick="goToday()">今日</button>
          <button class="secondary-button" onclick="changeCalendar(1)">→</button>
        </div>

        <strong class="calendar-heading">${heading}</strong>

        <div class="calendar-views">
          <button class="secondary-button ${calendarView === "month" ? "view-active" : ""}" onclick="setCalendarView('month')">月</button>
          <button class="secondary-button ${calendarView === "week" ? "view-active" : ""}" onclick="setCalendarView('week')">週</button>
          <button class="secondary-button ${calendarView === "day" ? "view-active" : ""}" onclick="setCalendarView('day')">日</button>
        </div>
      </div>

      ${body}

      <div class="calendar-legend">
        <span><i class="legend-blue"></i>通常予定</span>
        <span><i class="legend-green"></i>テスト</span>
        <span><i class="legend-purple"></i>行事</span>
        <span><i class="legend-red"></i>休み</span>
        <span><i class="legend-orange"></i>その他</span>
      </div>

      <div class="calendar-add-area">
        <button class="primary-button" onclick="addEvent()">＋ 予定を追加</button>
      </div>
    </div>
  `;
}

function renderMonthView(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((firstDay + lastDate) / 7);
  const today = todayString();

  let cells = "";

  for (let i = 0; i < weeks * 7; i++) {
    const day = i - firstDay + 1;
    const date = new Date(year, month, day);
    const dateKey = dateString(date);

    const outside = date.getMonth() !== month;
    const events = appData.events
      .map((item, index) => ({ ...item, index }))
      .filter(item => item.date === dateKey);

    const tasks = appData.tasks.filter(item => item.dueDate === dateKey);

    cells += `
      <div class="calendar-day ${dateKey === today ? "today" : ""} ${outside ? "outside-month" : ""}">
        <button class="calendar-date" onclick="openCalendarDay('${dateKey}')">
          ${date.getDate()}
        </button>

        ${events.map(item => `
          <button class="calendar-event ${getCategoryStyle(item.category)}"
            onclick="editEvent(${item.index})">
            ${escapeHTML(item.title)}
          </button>
        `).join("")}

        ${tasks.map(item => `
          <div class="calendar-event event-task">
            課題：${escapeHTML(item.title)}
          </div>
        `).join("")}
      </div>
    `;
  }

  return `
    <div class="calendar-grid">
      ${["日", "月", "火", "水", "木", "金", "土"].map(day => `
        <div class="calendar-weekday">${day}</div>
      `).join("")}
      ${cells}
    </div>
  `;
}

function renderWeekView() {
  const start = new Date(calendarDate);
  start.setDate(start.getDate() - start.getDay());

  let cells = "";

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells += renderDayColumn(date);
  }

  return `<div class="week-calendar">${cells}</div>`;
}

function renderDayView() {
  return `
    <div class="day-calendar">
      ${renderDayColumn(calendarDate)}
    </div>
  `;
}

function renderDayColumn(date) {
  const dateKey = dateString(date);

  const events = appData.events
    .map((item, index) => ({ ...item, index }))
    .filter(item => item.date === dateKey);

  const tasks = appData.tasks.filter(item => item.dueDate === dateKey);

  return `
    <div class="calendar-column">
      <button class="calendar-column-date" onclick="openCalendarDay('${dateKey}')">
        ${date.getMonth() + 1}/${date.getDate()}
        (${["日", "月", "火", "水", "木", "金", "土"][date.getDay()]})
      </button>

      ${events.length ? events.map(item => `
        <button class="calendar-event ${getCategoryStyle(item.category)}"
          onclick="editEvent(${item.index})">
          ${escapeHTML(item.time || "")}
          ${escapeHTML(item.title)}
        </button>
      `).join("") : `<p class="muted">予定はありません。</p>`}

      ${tasks.map(item => `
        <div class="calendar-event event-task">
          課題：${escapeHTML(item.title)}
        </div>
      `).join("")}

      <button class="secondary-button" onclick="addEvent('${dateKey}')">
        ＋ 予定を追加
      </button>
    </div>
  `;
}

function setCalendarView(view) {
  calendarView = view;
  renderCalendar(document.getElementById("page-content"));
}

function changeCalendar(amount) {
  if (calendarView === "month") {
    calendarDate.setDate(1);
    calendarDate.setMonth(calendarDate.getMonth() + amount);
  } else if (calendarView === "week") {
    calendarDate.setDate(calendarDate.getDate() + amount * 7);
  } else {
    calendarDate.setDate(calendarDate.getDate() + amount);
  }

  renderCalendar(document.getElementById("page-content"));
}

function goToday() {
  calendarDate = new Date();
  renderCalendar(document.getElementById("page-content"));
}

function openCalendarDay(date) {
  const parts = date.split("-").map(Number);
  calendarDate = new Date(parts[0], parts[1] - 1, parts[2]);
  calendarView = "day";
  renderCalendar(document.getElementById("page-content"));
}

// --------------------------------------
// 予定の追加・編集・削除
// --------------------------------------

function addEvent(defaultDate = todayString()) {
  const title = prompt("予定の名前を入力してください");
  if (!title) return;

  const date = prompt("日付を入力してください（例：2026-11-20）", defaultDate);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    alert("日付の形式が正しくありません。");
    return;
  }

  const categories = [
    "授業・通常予定",
    "小テスト・定期テスト",
    "行事・イベント",
    "休校・休み",
    "その他"
  ];

  const categoryText = categories.map((item, index) => `${index + 1}. ${item}`).join("\n");

  const choice = prompt(`予定の種類を選んでください。\n${categoryText}`, "1");
  if (choice === null) return;

  const category = categories[Number(choice) - 1];

  if (!category) {
    alert("正しい番号を選んでください。");
    return;
  }

  const time = prompt("時間を入力してください（任意）", "");

  appData.events.push({
    id: Date.now(),
    title,
    date,
    category,
    time: time || ""
  });

  saveData();
  renderCalendar(document.getElementById("page-content"));
}

function editEvent(index) {
  const item = appData.events[index];
  if (!item) return;

  const action = prompt(
    "操作を選んでください。\n1. 編集\n2. 削除",
    "1"
  );

  if (action === "2") {
    if (confirm("この予定を削除しますか？")) {
      appData.events.splice(index, 1);
      saveData();
      renderCalendar(document.getElementById("page-content"));
    }
    return;
  }

  if (action !== "1") return;

  const title = prompt("予定名", item.title);
  if (title === null || !title.trim()) return;

  const date = prompt("日付（YYYY-MM-DD）", item.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    alert("日付の形式が正しくありません。");
    return;
  }

  const categories = [
    "授業・通常予定",
    "小テスト・定期テスト",
    "行事・イベント",
    "休校・休み",
    "その他"
  ];

  const currentCategory = categories.indexOf(item.category);
  const categoryText = categories.map((value, i) => `${i + 1}. ${value}`).join("\n");

  const choice = prompt(
    `予定の種類\n${categoryText}`,
    String(currentCategory >= 0 ? currentCategory + 1 : 1)
  );

  if (choice === null) return;

  const category = categories[Number(choice) - 1];
  if (!category) {
    alert("正しい番号を選んでください。");
    return;
  }

  const time = prompt("時間", item.time || "");
  if (time === null) return;

  appData.events[index] = {
    ...item,
    title: title.trim(),
    date,
    category,
    time
  };

  saveData();
  renderCalendar(document.getElementById("page-content"));
}

// --------------------------------------
// 課題管理
// --------------------------------------

function renderTasks(content) {
  content.innerHTML = `
    <div class="card">
      <div class="calendar-toolbar">
        <h2 class="card-title">課題一覧</h2>
        <button class="primary-button" onclick="addTask()">＋ 課題を追加</button>
      </div>

      <div class="item-list">
        ${appData.tasks.length ? appData.tasks.map((item, index) => `
          <div class="list-item">
            <div>
              <strong>${escapeHTML(item.title)}</strong>
              <div class="muted">${escapeHTML(item.subject || "未分類")} ・ 期限：${escapeHTML(item.dueDate || "未設定")}</div>
            </div>
            <div>
              <select onchange="changeTaskStatus(${index}, this.value)">
                <option value="notStarted" ${item.status === "notStarted" ? "selected" : ""}>未着手</option>
                <option value="inProgress" ${item.status === "inProgress" ? "selected" : ""}>進行中</option>
                <option value="completed" ${item.status === "completed" ? "selected" : ""}>完了</option>
              </select>
              <button class="secondary-button" onclick="deleteTask(${index})">削除</button>
            </div>
          </div>
        `).join("") : `<p class="muted">まだ課題は登録されていません。</p>`}
      </div>
    </div>
  `;
}

function addTask() {
  const title = prompt("課題の内容を入力してください");
  if (!title) return;

  const subject = prompt("教科を入力してください（例：数学）", "");
  const dueDate = prompt("期限を入力してください（例：2026-11-25）", todayString());

  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    alert("日付の形式が正しくありません。");
    return;
  }

  appData.tasks.push({
    id: Date.now(),
    title,
    subject: subject || "",
    dueDate: dueDate || "",
    status: "notStarted"
  });

  saveData();
  showPage("tasks");
}

function changeTaskStatus(index, status) {
  if (!appData.tasks[index]) return;
  appData.tasks[index].status = status;
  saveData();
  showPage("tasks");
}

function deleteTask(index) {
  if (!confirm("この課題を削除しますか？")) return;
  appData.tasks.splice(index, 1);
  saveData();
  showPage("tasks");
}

// --------------------------------------
// 教材管理
// --------------------------------------

function renderMaterials(content) {
  content.innerHTML = `
    <div class="card">
      <div class="calendar-toolbar">
        <h2 class="card-title">教材一覧</h2>
        <button class="primary-button" onclick="addMaterial()">＋ 教材を追加</button>
      </div>

      <div class="item-list">
        ${appData.materials.length ? appData.materials.map((item, index) => `
          <div class="list-item">
            <div>
              <strong>${escapeHTML(item.title)}</strong>
              <div class="muted">${escapeHTML(item.subject || "未分類")} ・ ${escapeHTML(item.type || "教材")}</div>
            </div>
            <button class="secondary-button" onclick="deleteMaterial(${index})">削除</button>
          </div>
        `).join("") : `<p class="muted">教材はまだ登録されていません。</p>`}
      </div>
    </div>
  `;
}

function addMaterial() {
  const title = prompt("教材名を入力してください");
  if (!title) return;

  const subject = prompt("教科を入力してください", "");
  const type = prompt("種類を入力してください（教科書・問題集・プリントなど）", "教科書");

  appData.materials.push({
    id: Date.now(),
    title,
    subject: subject || "",
    type: type || "教材"
  });

  saveData();
  showPage("materials");
}

function deleteMaterial(index) {
  if (!confirm("この教材を削除しますか？")) return;
  appData.materials.splice(index, 1);
  saveData();
  showPage("materials");
}

// --------------------------------------
// 学習記録
// --------------------------------------

function renderRecords(content) {
  const total = appData.records.reduce(
    (sum, item) => sum + Number(item.minutes || 0), 0
  );

  content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">累計学習時間</div>
        <div class="stat-value">${Math.floor(total / 60)}時間${total % 60}分</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">記録件数</div>
        <div class="stat-value">${appData.records.length}件</div>
      </div>
    </div>

    <div class="card">
      <div class="calendar-toolbar">
        <h2 class="card-title">学習記録</h2>
        <button class="primary-button" onclick="addRecord()">＋ 記録する</button>
      </div>

      <div class="item-list">
        ${appData.records.length ? appData.records.slice().reverse().map(item => `
          <div class="list-item">
            <div>
              <strong>${escapeHTML(item.subject || "自主学習")}</strong>
              <div class="muted">${escapeHTML(item.date)} ・ ${escapeHTML(item.note || "")}</div>
            </div>
            <span class="tag">${Number(item.minutes)}分</span>
          </div>
        `).join("") : `<p class="muted">学習記録はまだありません。</p>`}
      </div>
    </div>
  `;
}

function addRecord() {
  const subject = prompt("教科を入力してください");
  if (subject === null) return;

  const minutes = Number(prompt("学習時間を分単位で入力してください"));

  if (!Number.isFinite(minutes) || minutes <= 0) {
    alert("正しい学習時間を入力してください。");
    return;
  }

  const note = prompt("学習内容（任意）", "");

  appData.records.push({
    id: Date.now(),
    date: todayString(),
    subject: subject || "",
    minutes,
    note: note || ""
  });

  saveData();
  showPage("records");
}

// --------------------------------------
// 成績分析
// --------------------------------------

function renderGrades(content) {
  content.innerHTML = `
    <div class="card">
      <div class="calendar-toolbar">
        <h2 class="card-title">成績一覧</h2>
        <button class="primary-button" onclick="addGrade()">＋ 成績を追加</button>
      </div>

      <div class="item-list">
        ${appData.grades.length ? appData.grades.map(item => `
          <div class="list-item">
            <div>
              <strong>${escapeHTML(item.subject)}</strong>
              <div class="muted">${escapeHTML(item.testName)} ・ ${escapeHTML(item.date)}</div>
            </div>
            <span class="tag">${escapeHTML(item.score)}点</span>
          </div>
        `).join("") : `<p class="muted">成績はまだ登録されていません。</p>`}
      </div>
    </div>
  `;
}

function addGrade() {
  const subject = prompt("教科を入力してください");
  if (!subject) return;

  const testName = prompt("テスト名を入力してください");
  if (!testName) return;

  const score = Number(prompt("点数を入力してください"));

  if (!Number.isFinite(score) || score < 0) {
    alert("正しい点数を入力してください。");
    return;
  }

  const date = prompt("テスト日を入力してください（例：2026-11-20）", todayString());

  appData.grades.push({
    id: Date.now(),
    subject,
    testName,
    score,
    date: date || ""
  });

  saveData();
  showPage("grades");
}
