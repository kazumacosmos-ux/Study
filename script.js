
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
let selectedDate = todayString();
let editingEventId = null;
let detailEventId = null;

// --------------------------------------
// 初期化
// --------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("today-label").textContent = formatDate(new Date());

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

function parseDate(value) {
  const parts = value.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getEventStart(item) {
  return item.startDate || item.date || todayString();
}

function getEventEnd(item) {
  return item.endDate || item.startDate || item.date || todayString();
}

function eventOccursOn(item, date) {
  return date >= getEventStart(item) && date <= getEventEnd(item);
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

function showCalendarScreen(title) {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === "calendar");
  });

  document.getElementById("page-title").textContent = title;
}

// --------------------------------------
// ホーム
// --------------------------------------

function renderHome(content) {
  const today = todayString();
  const todayEvents = appData.events.filter(item => eventOccursOn(item, today));
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
            <button class="list-item event-list-button" onclick="openCalendarDay('${today}')">
              <strong>${escapeHTML(item.title)}</strong>
              <span class="tag">${escapeHTML(item.category || "その他")}</span>
            </button>
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
        <button class="primary-button" onclick="openEventForm()">＋ 予定を追加</button>
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

    const events = appData.events.filter(item => eventOccursOn(item, dateKey));
    const tasks = appData.tasks.filter(item => item.dueDate === dateKey);

    cells += `
      <div class="calendar-day calendar-day-clickable ${dateKey === today ? "today" : ""} ${outside ? "outside-month" : ""}"
        onclick="openCalendarDay('${dateKey}')"
        role="button" tabindex="0"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCalendarDay('${dateKey}')}">

        <button class="calendar-date" type="button" onclick="event.stopPropagation();openCalendarDay('${dateKey}')">
          ${date.getDate()}
        </button>

        ${events.map(item => `
          <button type="button" class="calendar-event ${getCategoryStyle(item.category)}"
            onclick="event.stopPropagation();openCalendarDay('${dateKey}')">
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
  return `<div class="day-calendar">${renderDayColumn(calendarDate)}</div>`;
}

function renderDayColumn(date) {
  const dateKey = dateString(date);
  const events = appData.events.filter(item => eventOccursOn(item, dateKey));
  const tasks = appData.tasks.filter(item => item.dueDate === dateKey);

  return `
    <div class="calendar-column">
      <button class="calendar-column-date" onclick="openCalendarDay('${dateKey}')">
        ${date.getMonth() + 1}/${date.getDate()}
        (${["日", "月", "火", "水", "木", "金", "土"][date.getDay()]})
      </button>

      ${events.length ? events.map(item => `
        <button class="calendar-event ${getCategoryStyle(item.category)}"
          onclick="openCalendarDay('${dateKey}')">
          ${escapeHTML(item.title)}
        </button>
      `).join("") : `<p class="muted">予定はありません。</p>`}

      ${tasks.map(item => `
        <div class="calendar-event event-task">課題：${escapeHTML(item.title)}</div>
      `).join("")}

      <button class="secondary-button" onclick="openCalendarDay('${dateKey}')">この日の予定を見る</button>
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

// --------------------------------------
// 日付専用画面
// --------------------------------------

function openCalendarDay(date) {
  selectedDate = date;
  calendarDate = parseDate(date);
  renderCalendarDay();
}

function renderCalendarDay() {
  showCalendarScreen("予定一覧");

  const content = document.getElementById("page-content");
  const date = parseDate(selectedDate);
  const events = appData.events.filter(item => eventOccursOn(item, selectedDate));
  const tasks = appData.tasks.filter(item => item.dueDate === selectedDate);

  content.innerHTML = `
    <div class="card calendar-detail-page">
      <div class="calendar-detail-header">
        <button class="secondary-button" onclick="showPage('calendar')">← カレンダーに戻る</button>
        <button class="primary-button" onclick="openEventForm()">＋ 予定を追加</button>
      </div>

      <div class="calendar-detail-date">
        <div class="eyebrow">DAILY SCHEDULE</div>
        <h2>${formatDate(date)}</h2>
        <p class="muted">${["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][date.getDay()]}</p>
      </div>

      <h3 class="card-title">予定 ${events.length}件</h3>
      <div class="item-list">
        ${events.length ? events.map(item => `
          <button class="event-detail-row" onclick="openEventDetail(${item.id})">
            <span class="event-color-mark ${getCategoryStyle(item.category)}"></span>
            <span class="event-detail-title">${escapeHTML(item.title)}</span>
            <span class="muted">›</span>
          </button>
        `).join("") : `<p class="muted">この日の予定はありません。</p>`}
      </div>

      ${tasks.length ? `
        <div class="calendar-day-tasks">
          <h3 class="card-title">期限がこの日の課題</h3>
          ${tasks.map(item => `
            <div class="list-item">
              <strong>${escapeHTML(item.title)}</strong>
              <span class="tag">${escapeHTML(item.subject || "未分類")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

// --------------------------------------
// 予定の追加・編集画面
// --------------------------------------

function openEventForm(id = null) {
  editingEventId = id;
  renderEventForm();
}

function renderEventForm() {
  showCalendarScreen(editingEventId === null ? "予定を追加" : "予定を編集");

  const content = document.getElementById("page-content");
  const item = editingEventId === null
    ? null
    : appData.events.find(event => event.id === editingEventId);

  if (editingEventId !== null && !item) {
    renderCalendarDay();
    return;
  }

  const categories = [
    "授業・通常予定",
    "小テスト・定期テスト",
    "行事・イベント",
    "休校・休み",
    "その他"
  ];

  const startDate = item ? getEventStart(item) : selectedDate;
  const endDate = item ? getEventEnd(item) : selectedDate;
  const isAllDay = item ? item.allDay !== false : true;

  content.innerHTML = `
    <div class="card event-form-card">
      <div class="event-form-header">
        <button class="secondary-button" onclick="cancelEventForm()">← 戻る</button>
        <h2 class="card-title">${item ? "予定を編集" : "新しい予定"}</h2>
      </div>

      <form id="event-form" class="event-form">
        <div class="form-field">
          <label for="event-title">予定名</label>
          <input id="event-title" name="title" type="text"
            placeholder="例：数学の小テスト" maxlength="100"
            value="${escapeHTML(item?.title || "")}" required>
        </div>

        <div class="event-date-range">
          <div class="form-field">
            <label for="event-start-date">開始日</label>
            <input id="event-start-date" name="startDate" type="date"
              value="${escapeHTML(startDate)}" required>
          </div>

          <div class="form-field">
            <label for="event-end-date">終了日</label>
            <input id="event-end-date" name="endDate" type="date"
              value="${escapeHTML(endDate)}" required>
          </div>
        </div>

        <div class="form-field">
          <label class="all-day-label">
            <input id="event-all-day" name="allDay" type="checkbox" ${isAllDay ? "checked" : ""}>
            終日
          </label>
        </div>

        <div id="event-time-fields" class="event-time-fields" ${isAllDay ? "hidden" : ""}>
          <div class="form-field">
            <label for="event-start-time">開始時刻</label>
            <input id="event-start-time" name="startTime" type="time"
              value="${escapeHTML(item?.startTime || "")}" ${isAllDay ? "disabled" : ""}>
          </div>

          <div class="form-field">
            <label for="event-end-time">終了時刻</label>
            <input id="event-end-time" name="endTime" type="time"
              value="${escapeHTML(item?.endTime || "")}" ${isAllDay ? "disabled" : ""}>
          </div>
        </div>

        <div class="form-field">
          <label>カテゴリー</label>
          <div class="event-category-options">
            ${categories.map((category, index) => `
              <label class="event-category-option">
                <input type="radio" name="category" value="${category}"
                  ${item ? (item.category === category ? "checked" : "") : (index === 0 ? "checked" : "")}>
                <span class="event-category-chip ${getCategoryStyle(category)}">${category}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="form-field">
          <label for="event-memo">メモ <span class="muted">（任意）</span></label>
          <textarea id="event-memo" name="memo" rows="4"
            placeholder="予定についてのメモ">${escapeHTML(item?.memo || "")}</textarea>
        </div>

        <div class="event-form-actions">
          <button type="button" class="secondary-button" onclick="cancelEventForm()">キャンセル</button>
          <button type="submit" class="primary-button">${item ? "変更を保存" : "予定を保存"}</button>
        </div>
      </form>
    </div>
  `;

  const allDayCheckbox = document.getElementById("event-all-day");
  const timeFields = document.getElementById("event-time-fields");
  const startTimeInput = document.getElementById("event-start-time");
  const endTimeInput = document.getElementById("event-end-time");

  allDayCheckbox.addEventListener("change", () => {
    const allDay = allDayCheckbox.checked;
    timeFields.hidden = allDay;
    startTimeInput.disabled = allDay;
    endTimeInput.disabled = allDay;
  });

  document.getElementById("event-form").addEventListener("submit", saveEventForm);
  document.getElementById("event-title").focus();
}

function saveEventForm(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const title = form.elements.title.value.trim();
  const startDate = form.elements.startDate.value;
  const endDate = form.elements.endDate.value;
  const allDay = form.elements.allDay.checked;
  const startTime = allDay ? "" : form.elements.startTime.value;
  const endTime = allDay ? "" : form.elements.endTime.value;
  const categoryInput = form.querySelector('input[name="category"]:checked');
  const category = categoryInput ? categoryInput.value : "";
  const memo = form.elements.memo.value.trim();

  if (!title || !startDate || !endDate || !category) {
    alert("予定名・開始日・終了日・カテゴリーを入力してください。");
    return;
  }

  if (endDate < startDate) {
    alert("終了日は開始日以降の日付にしてください。");
    return;
  }

  if (!allDay && startTime && endTime && endTime < startTime && startDate === endDate) {
    alert("同じ日の予定では、終了時刻を開始時刻より後にしてください。");
    return;
  }

  const eventData = {
    title,
    date: startDate,
    startDate,
    endDate,
    allDay,
    startTime,
    endTime,
    category,
    memo
  };

  if (editingEventId === null) {
    appData.events.push({
      id: Date.now(),
      ...eventData
    });
  } else {
    const index = appData.events.findIndex(item => item.id === editingEventId);
    if (index === -1) return;

    appData.events[index] = {
      ...appData.events[index],
      ...eventData
    };
  }

  selectedDate = startDate;
  calendarDate = parseDate(startDate);

  saveData();
  renderCalendarDay();
}

function cancelEventForm() {
  if (editingEventId !== null) {
    openEventDetail(editingEventId);
  } else {
    renderCalendarDay();
  }
}

// --------------------------------------
// 予定の詳細画面
// --------------------------------------

function openEventDetail(id) {
  detailEventId = id;
  renderEventDetail();
}

function renderEventDetail() {
  const item = appData.events.find(event => event.id === detailEventId);

  if (!item) {
    renderCalendarDay();
    return;
  }

  selectedDate = getEventStart(item);
  showCalendarScreen("予定の詳細");

  const content = document.getElementById("page-content");
  const startDate = getEventStart(item);
  const endDate = getEventEnd(item);
  const dateText = startDate === endDate
    ? formatDate(parseDate(startDate))
    : `${formatDate(parseDate(startDate))} ～ ${formatDate(parseDate(endDate))}`;

  let timeText = "終日";
  if (item.allDay === false) {
    if (item.startTime && item.endTime) {
      timeText = `${item.startTime} ～ ${item.endTime}`;
    } else if (item.startTime) {
      timeText = `${item.startTime}から`;
    } else if (item.endTime) {
      timeText = `${item.endTime}まで`;
    } else {
      timeText = "時刻未設定";
    }
  }

  content.innerHTML = `
    <div class="card event-detail-page">
      <button class="secondary-button" onclick="renderCalendarDay()">← 予定一覧に戻る</button>

      <div class="event-detail-main">
        <span class="event-color-mark large ${getCategoryStyle(item.category)}"></span>
        <div>
          <div class="muted">${escapeHTML(item.category || "その他")}</div>
          <h2>${escapeHTML(item.title)}</h2>
          <p class="muted">${escapeHTML(dateText)}</p>
          <p class="muted">${escapeHTML(timeText)}</p>
        </div>
      </div>

      ${item.memo ? `
        <div class="event-memo">
          <h3>メモ</h3>
          <p>${escapeHTML(item.memo).replace(/\n/g, "<br>")}</p>
        </div>
      ` : ""}

      <div class="event-detail-actions">
        <button class="primary-button" onclick="openEventForm(${item.id})">編集する</button>
        <button class="secondary-button danger-button" onclick="deleteEvent(${item.id})">削除する</button>
      </div>
    </div>
  `;
}

function deleteEvent(id) {
  const item = appData.events.find(event => event.id === id);
  if (!item) return;

  if (!confirm(`「${item.title}」を削除しますか？`)) return;

  appData.events = appData.events.filter(event => event.id !== id);
  saveData();
  renderCalendarDay();
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
