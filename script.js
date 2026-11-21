
// ======================================
// Study - 学習管理システム
// ======================================

let appData = StudyStorage.load();

const pageNames = {
  home: "ホーム",
  calendar: "カレンダー",
  tasks: "課題管理",
  timetable: "時間割"
};

let currentPage = "home";
let calendarDate = new Date();
let calendarView = "month";
let selectedDate = todayString();
let editingEventId = null;
let detailEventId = null;

// ドラッグコピー用
let calendarDrag = null;
let suppressNextEventClick = false;
let suppressClickTimer = null;

// カレンダー復帰用
let calendarReturnScrollY = 0;

// コピー通知用
let copyToastTimer = null;

// 時間割の表示週（月曜日を基準）
let timetableWeekStart = null;

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

  setupCalendarInteractions();
  setupZoomPrevention();
  setupCalendarStyles();

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
    case "timetable":
      renderTimetable(content);
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
// iPad・ブラウザ操作設定
// --------------------------------------

function setupZoomPrevention() {
  // ズームを一律禁止しない。
  // iPad Safariではズームアウトだけを許可する制御は
  // 安定して実現できないため、標準のズーム操作を維持する。

  let viewport = document.querySelector('meta[name="viewport"]');

  if (!viewport) {
    viewport = document.createElement("meta");
    viewport.name = "viewport";
    document.head.appendChild(viewport);
  }

  viewport.content = "width=device-width, initial-scale=1";
}

// --------------------------------------
// カレンダー表示スタイル
// --------------------------------------

function setupCalendarStyles() {
  if (document.getElementById("study-calendar-custom-styles")) return;

  const style = document.createElement("style");
  style.id = "study-calendar-custom-styles";

  style.textContent = `
    /* カレンダー上の文字選択を抑制 */
    .month-calendar,
    .month-calendar * {
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }

    /* ドラッグ操作 */
    .month-event-bar {
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      touch-action: none;
      cursor: grab;
    }

    .month-event-bar.dragging {
      opacity: 0.45;
    }

    /* 前後の月の日付 */
    .month-day.outside-month .month-day-number {
      color: #c2c7d0;
      background: #f4f5f7;
    }

    .month-day.outside-month .month-overflow {
      opacity: 0.45;
    }

    /* ドラッグ中の表示 */
    .study-drag-ghost {
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      opacity: 0.85;
      padding: 7px 12px;
      border-radius: 7px;
      font-size: 13px;
      color: #222;
      background: #e4efff;
      border: 1px solid #9bbce9;
      box-shadow: 0 3px 12px rgba(0,0,0,0.15);
      white-space: nowrap;
      transform: translate(-50%, -140%);
    }

    .month-day.drag-copy-target {
      outline: 2px solid #6b9fe8;
      outline-offset: -2px;
      background-color: #edf4ff;
    }
  `;

  document.head.appendChild(style);
}

// --------------------------------------
// コピー完了通知
// --------------------------------------

function showCopyToast(title, targetDate) {
  let toast = document.getElementById("study-copy-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "study-copy-toast";
    toast.className = "study-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    document.body.appendChild(toast);
  }

  const date = parseDate(targetDate);

  toast.innerHTML = `
    <div class="study-toast-title">
      ${date.getMonth() + 1}月${date.getDate()}日にコピーしました
    </div>
    <div class="study-toast-message">
      ${escapeHTML(title)}
    </div>
  `;

  toast.classList.remove("show");

  if (copyToastTimer) {
    clearTimeout(copyToastTimer);
  }

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  copyToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

// --------------------------------------
// 予定のドラッグ＆ドロップコピー
// --------------------------------------

function setupCalendarInteractions() {
  document.addEventListener("pointerdown", event => {
    const bar = event.target.closest(".month-event-bar");
    if (!bar) return;

    const id = Number(bar.dataset.eventId);
    const item = appData.events.find(event => event.id === id);

    if (!item) return;

    calendarDrag = {
      id,
      item,
      bar,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      timer: null,
      ghost: null,
      target: null
    };

    if (event.pointerType === "mouse") {
      startCalendarDrag();
    } else {
      // タッチ操作では長押ししてからドラッグ開始
      calendarDrag.timer = setTimeout(() => {
        if (calendarDrag) {
          startCalendarDrag();
        }
      }, 350);
    }
  });

  document.addEventListener("pointermove", event => {
    if (!calendarDrag) return;
    if (event.pointerId !== calendarDrag.pointerId) return;

    if (!calendarDrag.active) {
      const distance = Math.hypot(
        event.clientX - calendarDrag.startX,
        event.clientY - calendarDrag.startY
      );

      // 長押しが成立する前に動かした場合は通常操作に戻す
      if (distance > 10 && calendarDrag.timer) {
        clearTimeout(calendarDrag.timer);
        calendarDrag.timer = null;
        calendarDrag = null;
        return;
      }
    }

    if (!calendarDrag || !calendarDrag.active) return;

    event.preventDefault();

    moveCalendarDrag(event.clientX, event.clientY);
  }, { passive: false });

  document.addEventListener("pointerup", event => {
    if (!calendarDrag) return;
    if (event.pointerId !== calendarDrag.pointerId) return;

    if (calendarDrag.timer) {
      clearTimeout(calendarDrag.timer);
    }

    if (calendarDrag.active) {
      const targetDate = findCalendarDateAtPoint(
        event.clientX,
        event.clientY
      );

      if (targetDate) {
        copyEventToDate(calendarDrag.item, targetDate);

        suppressNextEventClick = true;

        if (suppressClickTimer) {
          clearTimeout(suppressClickTimer);
        }

        suppressClickTimer = setTimeout(() => {
          suppressNextEventClick = false;
        }, 500);
      }

      finishCalendarDrag();
    } else {
      calendarDrag = null;
    }
  });

  document.addEventListener("pointercancel", () => {
    if (calendarDrag) {
      if (calendarDrag.timer) {
        clearTimeout(calendarDrag.timer);
      }
      finishCalendarDrag();
    }
  });
}

function startCalendarDrag() {
  if (!calendarDrag || calendarDrag.active) return;

  calendarDrag.active = true;

  calendarDrag.bar.classList.add("dragging");

  const ghost = document.createElement("div");
  ghost.className = "study-drag-ghost";
  ghost.textContent = calendarDrag.item.title;

  document.body.appendChild(ghost);

  calendarDrag.ghost = ghost;

  moveCalendarDrag(
    calendarDrag.startX,
    calendarDrag.startY
  );
}

function moveCalendarDrag(x, y) {
  if (!calendarDrag || !calendarDrag.active) return;

  if (calendarDrag.ghost) {
    calendarDrag.ghost.style.left = `${x}px`;
    calendarDrag.ghost.style.top = `${y}px`;
  }

  document.querySelectorAll(".month-day.drag-copy-target").forEach(cell => {
    cell.classList.remove("drag-copy-target");
  });

  const targetDate = findCalendarDateAtPoint(x, y);

  if (targetDate) {
    const targetCell = Array.from(
      document.querySelectorAll(".month-day")
    ).find(cell => cell.dataset.date === targetDate);

    if (targetCell) {
      targetCell.classList.add("drag-copy-target");
      calendarDrag.target = targetDate;
    }
  } else {
    calendarDrag.target = null;
  }
}

function findCalendarDateAtPoint(x, y) {
  const cells = document.querySelectorAll(".month-day");

  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();

    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      return cell.dataset.date || null;
    }
  }

  return null;
}

function finishCalendarDrag() {
  if (!calendarDrag) return;

  if (calendarDrag.timer) {
    clearTimeout(calendarDrag.timer);
  }

  if (calendarDrag.bar) {
    calendarDrag.bar.classList.remove("dragging");
  }

  if (calendarDrag.ghost) {
    calendarDrag.ghost.remove();
  }

  document.querySelectorAll(".month-day.drag-copy-target").forEach(cell => {
    cell.classList.remove("drag-copy-target");
  });

  calendarDrag = null;
}

function copyEventToDate(item, targetDate) {
  if (!item || !targetDate) return;

  const originalStart = getEventStart(item);
  const originalEnd = getEventEnd(item);

  const originalStartDate = parseDate(originalStart);
  const originalEndDate = parseDate(originalEnd);

  const duration = Math.round(
    (originalEndDate - originalStartDate) / 86400000
  );

  const newStartDate = targetDate;

  const newEnd = new Date(parseDate(targetDate));
  newEnd.setDate(newEnd.getDate() + duration);

  const newEndDate = dateString(newEnd);

  const newId = createUniqueEventId();

  const copiedEvent = {
    ...item,
    id: newId,
    date: newStartDate,
    startDate: newStartDate,
    endDate: newEndDate
  };

  appData.events.push(copiedEvent);

  saveData();

  selectedDate = newStartDate;
  calendarDate = parseDate(newStartDate);

  if (currentPage === "calendar") {
    renderCalendar(document.getElementById("page-content"));
  }

  showCopyToast(item.title, targetDate);
}

function createUniqueEventId() {
  let id = Date.now();

  while (appData.events.some(item => item.id === id)) {
    id++;
  }

  return id;
}

function handleMonthEventClick(event, id, date) {
  event.stopPropagation();

  if (suppressNextEventClick) {
    suppressNextEventClick = false;

    if (suppressClickTimer) {
      clearTimeout(suppressClickTimer);
      suppressClickTimer = null;
    }

    return;
  }

  openCalendarDay(date);
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
        <p class="muted">予定と課題をまとめて管理しよう。</p>
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

// --------------------------------------
// 月表示
// --------------------------------------

function renderMonthView(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((firstDay + lastDate) / 7);
  const today = todayString();

  const firstDate = new Date(year, month, 1 - firstDay);

  let html = `
    <div class="month-calendar">
      <div class="month-weekdays">
        ${["日", "月", "火", "水", "木", "金", "土"].map(day =>
          `<div class="calendar-weekday">${day}</div>`
        ).join("")}
      </div>
  `;

  for (let week = 0; week < weeks; week++) {
    const weekStart = new Date(firstDate);
    weekStart.setDate(firstDate.getDate() + week * 7);

    const days = [];
    const weekDates = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);

      const key = dateString(date);
      weekDates.push(key);

      const events = appData.events.filter(item =>
        eventOccursOn(item, key)
      );

      const tasks = appData.tasks.filter(item => item.dueDate === key);

      days.push({
        date,
        key,
        events,
        tasks,
        outside: date.getMonth() !== month
      });
    }

    // この週に関係する予定を取得
    const weekEvents = appData.events
      .filter(item =>
        getEventStart(item) <= weekDates[6] &&
        getEventEnd(item) >= weekDates[0]
      )
      .sort((a, b) => {
        const aStart = getEventStart(a);
        const aEnd = getEventEnd(a);
        const bStart = getEventStart(b);
        const bEnd = getEventEnd(b);

        const aMulti = aStart !== aEnd;
        const bMulti = bStart !== bEnd;

        // 複数日予定を優先
        if (aMulti !== bMulti) {
          return aMulti ? -1 : 1;
        }

        // 複数日予定同士は期間が長い順
        const aDuration =
          parseDate(aEnd) - parseDate(aStart);

        const bDuration =
          parseDate(bEnd) - parseDate(bStart);

        if (aDuration !== bDuration) {
          return bDuration - aDuration;
        }

        return aStart.localeCompare(bStart);
      });

    // 予定を最大3段に配置
    const lanes = [[], [], []];
    const visibleEvents = [];

    weekEvents.forEach(item => {
      const start = getEventStart(item);
      const end = getEventEnd(item);

      const foundStart = weekDates.findIndex(date => date >= start);
      const startIndex = foundStart === -1 ? 7 : foundStart;

      let endIndex = weekDates.findIndex(date => date > end);
      endIndex = endIndex === -1 ? 6 : endIndex - 1;

      if (startIndex > 6 || endIndex < 0) return;

      let laneIndex = -1;

      for (let lane = 0; lane < 3; lane++) {
        const collision = lanes[lane].some(range =>
          !(endIndex < range.start || startIndex > range.end)
        );

        if (!collision) {
          laneIndex = lane;
          break;
        }
      }

      if (laneIndex === -1) return;

      lanes[laneIndex].push({
        start: startIndex,
        end: endIndex
      });

      visibleEvents.push({
        item,
        startIndex,
        endIndex,
        laneIndex
      });
    });

    // 日付の数字
    const dayCells = days.map(day => {
      const count = day.events.length;

      return `
        <div class="month-day ${day.key === today ? "today" : ""} ${day.outside ? "outside-month" : ""}"
          data-date="${day.key}"
          onclick="openCalendarDay('${day.key}')"
          role="button"
          tabindex="0"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCalendarDay('${day.key}')}">

          <div class="month-day-heading">
            <span class="month-day-number">${day.date.getDate()}</span>
            ${count > 3 ? `<span class="month-overflow">4つ以上</span>` : ""}
          </div>
        </div>
      `;
    }).join("");

    // 予定欄の空白部分をクリックできるようにする
    const eventHitTargets = days.map((day, index) => `
      <button
        type="button"
        class="month-event-hit-target"
        data-date="${day.key}"
        style="grid-column: ${index + 1}; grid-row: 1 / 4;"
        aria-label="${day.date.getMonth() + 1}月${day.date.getDate()}日を開く"
        onclick="openCalendarDay('${day.key}')">
      </button>
    `).join("");

    // 予定の帯
    const eventBars = visibleEvents.map(({ item, startIndex, endIndex, laneIndex }) => {
      const span = endIndex - startIndex + 1;
      const continuesBefore = getEventStart(item) < weekDates[startIndex];
      const continuesAfter = getEventEnd(item) > weekDates[endIndex];

      return `
        <button
          type="button"
          class="month-event-bar ${getCategoryStyle(item.category)}
            ${continuesBefore ? "continues-before" : ""}
            ${continuesAfter ? "continues-after" : ""}"
          data-event-id="${item.id}"
          style="grid-column: ${startIndex + 1} / span ${span}; grid-row: ${laneIndex + 1};"
          onclick="handleMonthEventClick(event, ${item.id}, '${weekDates[startIndex]}')"
          title="${escapeHTML(item.title)}">
          ${escapeHTML(item.title)}
        </button>
      `;
    }).join("");

    // 課題
    const taskCells = days.map(day => `
      <div class="month-task-cell"
        onclick="openCalendarDay('${day.key}')">
        ${day.tasks.map(task => `
          <div class="month-task-label">課題：${escapeHTML(task.title)}</div>
        `).join("")}
      </div>
    `).join("");

    html += `
      <div class="month-week">
        <div class="month-day-grid">
          ${dayCells}
        </div>

        <div class="month-event-grid">
          ${eventHitTargets}
          ${eventBars}
        </div>

        <div class="month-task-grid">
          ${taskCells}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

// --------------------------------------
// 週表示・日表示
// --------------------------------------

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

  const events = appData.events.filter(item =>
    eventOccursOn(item, dateKey)
  );

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
        <div class="calendar-event event-task">
          課題：${escapeHTML(item.title)}
        </div>
      `).join("")}

      <button class="secondary-button" onclick="openCalendarDay('${dateKey}')">
        この日の予定を見る
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

// --------------------------------------
// 日付専用画面
// --------------------------------------

function openCalendarDay(date) {
  if (suppressNextEventClick) {
    suppressNextEventClick = false;

    if (suppressClickTimer) {
      clearTimeout(suppressClickTimer);
      suppressClickTimer = null;
    }

    return;
  }

  calendarReturnScrollY = window.scrollY;

  selectedDate = date;
  calendarDate = parseDate(date);

  renderCalendarDay();
}

function changeSelectedDay(amount) {
  const date = parseDate(selectedDate);
  date.setDate(date.getDate() + amount);

  selectedDate = dateString(date);
  calendarDate = new Date(date);

  renderCalendarDay();
}

function returnToCalendar() {
  showPage("calendar");

  requestAnimationFrame(() => {
    window.scrollTo({
      top: calendarReturnScrollY,
      behavior: "auto"
    });
  });
}

function renderCalendarDay() {
  showCalendarScreen("予定一覧");

  const content = document.getElementById("page-content");
  const date = parseDate(selectedDate);

  const events = appData.events.filter(item =>
    eventOccursOn(item, selectedDate)
  );

  const tasks = appData.tasks.filter(item => item.dueDate === selectedDate);

  content.innerHTML = `
    <div class="card calendar-detail-page">
      <div class="calendar-detail-header">
        <div class="calendar-return-group">
          <button class="secondary-button" onclick="returnToCalendar()">
            ← カレンダーに戻る
          </button>
          <button type="button" class="calendar-day-nav-button" onclick="changeSelectedDay(-1)" aria-label="前の日">‹</button>
          <button type="button" class="calendar-day-nav-button" onclick="changeSelectedDay(1)" aria-label="次の日">›</button>
        </div>

        <button class="primary-button" onclick="openEventForm()">
          ＋ 予定を追加
        </button>
      </div>

      <div class="calendar-detail-date">
        <div class="eyebrow">DAILY SCHEDULE</div>
        <h2>${formatDate(date)}</h2>
        <p class="muted">
          ${["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][date.getDay()]}
        </p>
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
        <button class="secondary-button" onclick="cancelEventForm()">
          ← 戻る
        </button>

        <h2 class="card-title">${item ? "予定を編集" : "新しい予定"}</h2>
      </div>

      <form id="event-form" class="event-form">
        <div class="form-field">
          <label for="event-title">予定名</label>
          <input
            id="event-title"
            name="title"
            type="text"
            placeholder="例：数学の小テスト"
            maxlength="100"
            value="${escapeHTML(item?.title || "")}"
            required>
        </div>

        <div class="event-date-range">
          <div class="form-field">
            <label for="event-start-date">開始日</label>
            <input
              id="event-start-date"
              name="startDate"
              type="date"
              value="${escapeHTML(startDate)}"
              required>
          </div>

          <div class="form-field">
            <label for="event-end-date">終了日</label>
            <input
              id="event-end-date"
              name="endDate"
              type="date"
              value="${escapeHTML(endDate)}"
              required>
          </div>
        </div>

        <div class="form-field">
          <label class="all-day-label">
            <input
              id="event-all-day"
              name="allDay"
              type="checkbox"
              ${isAllDay ? "checked" : ""}>
            終日
          </label>
        </div>

        <div id="event-time-fields" class="event-time-fields" ${isAllDay ? "hidden" : ""}>
          <div class="form-field">
            <label for="event-start-time">開始時刻</label>
            <input
              id="event-start-time"
              name="startTime"
              type="time"
              value="${escapeHTML(item?.startTime || "")}"
              ${isAllDay ? "disabled" : ""}>
          </div>

          <div class="form-field">
            <label for="event-end-time">終了時刻</label>
            <input
              id="event-end-time"
              name="endTime"
              type="time"
              value="${escapeHTML(item?.endTime || "")}"
              ${isAllDay ? "disabled" : ""}>
          </div>
        </div>

        <div class="form-field">
          <label>カテゴリー</label>

          <div class="event-category-options">
            ${categories.map((category, index) => `
              <label class="event-category-option">
                <input
                  type="radio"
                  name="category"
                  value="${category}"
                  ${item
                    ? (item.category === category ? "checked" : "")
                    : (index === 0 ? "checked" : "")}>
                <span class="event-category-chip ${getCategoryStyle(category)}">
                  ${category}
                </span>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="form-field">
          <label for="event-memo">メモ <span class="muted">（任意）</span></label>
          <textarea
            id="event-memo"
            name="memo"
            rows="4"
            placeholder="予定についてのメモ">${escapeHTML(item?.memo || "")}</textarea>
        </div>

        <div class="event-form-actions">
          <button type="button" class="secondary-button" onclick="cancelEventForm()">
            キャンセル
          </button>

          <button type="submit" class="primary-button">
            ${item ? "変更を保存" : "予定を保存"}
          </button>
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
      id: createUniqueEventId(),
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
      <button class="secondary-button" onclick="renderCalendarDay()">
        ← 予定一覧に戻る
      </button>

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
        <button class="primary-button" onclick="openEventForm(${item.id})">
          編集する
        </button>

        <button class="secondary-button danger-button" onclick="deleteEvent(${item.id})">
          削除する
        </button>
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
              <div class="muted">
                ${escapeHTML(item.subject || "未分類")} ・ 期限：${escapeHTML(item.dueDate || "未設定")}
              </div>
            </div>

            <div>
              <select onchange="changeTaskStatus(${index}, this.value)">
                <option value="notStarted" ${item.status === "notStarted" ? "selected" : ""}>未着手</option>
                <option value="inProgress" ${item.status === "inProgress" ? "selected" : ""}>進行中</option>
                <option value="completed" ${item.status === "completed" ? "selected" : ""}>完了</option>
              </select>

              <button class="secondary-button" onclick="deleteTask(${index})">
                削除
              </button>
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
// 時間割
// --------------------------------------

const timetableDays = [
  { number: 1, name: "月" },
  { number: 2, name: "火" },
  { number: 3, name: "水" },
  { number: 4, name: "木" },
  { number: 5, name: "金" },
  { number: 6, name: "土" }
];

function getMonday(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function ensureTimetableData() {
  if (!appData.timetable) {
    appData.timetable = JSON.parse(JSON.stringify(studyData.timetable));
  }
  if (!appData.timetable.weekly) {
    appData.timetable.weekly = JSON.parse(JSON.stringify(studyData.timetable.weekly));
  }
  if (!Array.isArray(appData.timetable.changes)) {
    appData.timetable.changes = [];
  }

  // 今後の時間割変更に備え、全曜日を7限まで保持する。
  timetableDays.forEach(day => {
    if (!Array.isArray(appData.timetable.weekly[day.number])) {
      appData.timetable.weekly[day.number] = Array(7).fill("");
    }
    appData.timetable.weekly[day.number] =
      appData.timetable.weekly[day.number].slice(0, 7);
    while (appData.timetable.weekly[day.number].length < 7) {
      appData.timetable.weekly[day.number].push("");
    }
  });
}

function renderTimetable(content) {
  ensureTimetableData();

  if (!timetableWeekStart) {
    timetableWeekStart = getMonday(new Date());
  }

  const weekDates = timetableDays.map((day, index) => {
    const date = new Date(timetableWeekStart);
    date.setDate(date.getDate() + index);
    return { ...day, date, key: dateString(date) };
  });

  const weekEnd = weekDates[5].date;
  const rangeLabel = `${timetableWeekStart.getFullYear()}年${timetableWeekStart.getMonth() + 1}月${timetableWeekStart.getDate()}日 〜 ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;

  const weeklyRows = Array.from({ length: 7 }, (_, periodIndex) => `
    <tr>
      <th class="timetable-period">${periodIndex + 1}限</th>
      ${weekDates.map(day => {
        const item = getTimetableForDate(day.key)[periodIndex];
        const subject = item && item.subject ? escapeHTML(item.subject) : "／";
        return `
          <td>
            <div class="timetable-cell ${item && item.changed ? "is-changed" : ""} ${item && !item.subject ? "is-no-class" : ""}">
              ${subject}
            </div>
          </td>
        `;
      }).join("")}
    </tr>
  `).join("");

  const changes = appData.timetable.changes
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);

  const settingsRows = Array.from({ length: 7 }, (_, periodIndex) => `
    <tr>
      <th class="timetable-period">${periodIndex + 1}限</th>
      ${timetableDays.map(day => `
        <td>
          <input class="timetable-setting-input" type="text" maxlength="30"
            name="weekly-${day.number}-${periodIndex + 1}"
            value="${escapeHTML(appData.timetable.weekly[day.number][periodIndex] || "")}"
            aria-label="${day.name}曜日 ${periodIndex + 1}限">
        </td>
      `).join("")}
    </tr>
  `).join("");

  content.innerHTML = `
    <div class="card timetable-card">
      <div class="timetable-week-navigation">
        <button type="button" class="secondary-button timetable-week-button" onclick="shiftTimetableWeek(-1)">‹ <span>前の週</span></button>
        <div class="timetable-week-heading">
          <h2 class="card-title">${rangeLabel}</h2>
          <button type="button" class="timetable-current-week" onclick="goToCurrentTimetableWeek()">今週</button>
        </div>
        <button type="button" class="secondary-button timetable-week-button" onclick="shiftTimetableWeek(1)"><span>次の週</span> ›</button>
      </div>

      <h3 class="timetable-subtitle timetable-main-subtitle">時間割</h3>
      <div class="timetable-scroll">
        <table class="timetable-table">
          <thead>
            <tr>
              <th class="timetable-period">時限</th>
              ${weekDates.map(day => `
                <th>
                  <span class="timetable-day-name">${day.name}</span>
                  <span class="timetable-day-date">${formatShortDate(day.date)}</span>
                </th>
              `).join("")}
            </tr>
          </thead>
          <tbody>${weeklyRows}</tbody>
        </table>
      </div>
      <div class="timetable-legend">
        <span><i class="timetable-legend-outline"></i> 時間割変更あり</span>
        <span><b>／</b> 授業なし</span>
      </div>
    </div>

    <div class="card timetable-card">
      <h2 class="card-title">時間割変更</h2>
      <p class="muted">日付と時限を選び、その日だけの授業を変更できます。変更したコマには上の表で枠線が付きます。</p>

      <form class="timetable-change-form" onsubmit="saveTimetableChange(event)">
        <div class="form-field">
          <label for="timetable-change-date">変更する日付</label>
          <input id="timetable-change-date" type="date" value="${todayString()}" onchange="updateTimetablePeriodOptions(this.value)" required>
        </div>
        <div class="form-field">
          <label for="timetable-change-period">何時間目</label>
          <select id="timetable-change-period" required>
            ${Array.from({length:7},(_,i)=>`<option value="${i+1}">${i+1}限</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label for="timetable-change-subject">変更後の教科</label>
          <input id="timetable-change-subject" type="text" maxlength="30" placeholder="例：英語（授業なしは空欄）">
        </div>
        <button class="primary-button" type="submit">変更を保存</button>
      </form>

      <div class="timetable-change-list">
        <h3 class="timetable-subtitle">登録済みの変更</h3>
        ${changes.length ? changes.map(change => `
          <div class="timetable-change-row">
            <div>
              <strong>${escapeHTML(change.date)}・${change.period}限</strong>
              <div class="muted">${change.subject ? escapeHTML(change.subject) : "／（授業なし）"}</div>
            </div>
            <div class="timetable-change-actions">
              <button class="secondary-button" type="button" onclick="editTimetableChange(${change.id})">編集</button>
              <button class="secondary-button" type="button" onclick="deleteTimetableChange(${change.id})">削除</button>
            </div>
          </div>
        `).join("") : `<p class="muted">時間割変更は登録されていません。</p>`}
      </div>
    </div>

    <details class="card timetable-card timetable-settings-card">
      <summary>通常時間割を設定</summary>
      <p class="muted">ここで設定した内容が、上の時間割表の基本になります。上の表自体は編集できません。</p>
      <form onsubmit="saveWeeklyTimetable(event)">
        <div class="timetable-scroll">
          <table class="timetable-table timetable-settings-table">
            <thead>
              <tr><th class="timetable-period">時限</th>${timetableDays.map(day => `<th>${day.name}</th>`).join("")}</tr>
            </thead>
            <tbody>${settingsRows}</tbody>
          </table>
        </div>
        <button class="primary-button timetable-settings-save" type="submit">通常時間割を保存</button>
      </form>
    </details>
  `;
}

function shiftTimetableWeek(amount) {
  if (!timetableWeekStart) timetableWeekStart = getMonday(new Date());
  timetableWeekStart.setDate(timetableWeekStart.getDate() + amount * 7);
  renderTimetable(document.getElementById("page-content"));
}

function goToCurrentTimetableWeek() {
  timetableWeekStart = getMonday(new Date());
  renderTimetable(document.getElementById("page-content"));
}

function saveWeeklyTimetable(event) {
  event.preventDefault();
  ensureTimetableData();
  const form = event.currentTarget;

  timetableDays.forEach(day => {
    for (let period = 1; period <= 7; period++) {
      const field = form.elements.namedItem(`weekly-${day.number}-${period}`);
      appData.timetable.weekly[day.number][period - 1] = field ? field.value.trim() : "";
    }
  });

  saveData();
  renderTimetable(document.getElementById("page-content"));
}

function updateTimetablePeriodOptions(date) {
  const select = document.getElementById("timetable-change-period");
  if (!select || !date) return;

  const currentValue = Number(select.value || 1);
  select.innerHTML = Array.from(
    { length: 7 },
    (_, index) => `<option value="${index + 1}">${index + 1}限</option>`
  ).join("");
  select.value = String(Math.min(currentValue, 7));
}

function saveTimetableChange(event) {
  event.preventDefault();
  ensureTimetableData();

  const date = document.getElementById("timetable-change-date").value;
  const period = Number(document.getElementById("timetable-change-period").value);
  const subject = document.getElementById("timetable-change-subject").value.trim();

  if (!date) return;

  const dayNumber = parseDate(date).getDay();
  if (dayNumber === 0) {
    alert("日曜日は時間割の対象外です。");
    return;
  }
  if (period < 1 || period > 7) return;

  const existing = appData.timetable.changes.find(
    item => item.date === date && Number(item.period) === period
  );

  if (existing) {
    existing.subject = subject;
  } else {
    appData.timetable.changes.push({
      id: Date.now(),
      date,
      period,
      subject
    });
  }

  saveData();
  renderTimetable(document.getElementById("page-content"));
}

function editTimetableChange(id) {
  const item = appData.timetable.changes.find(change => change.id === id);
  if (!item) return;

  const subject = prompt(`${item.date} ${item.period}限の変更後の教科\n空欄にすると授業なしになります。`, item.subject || "");
  if (subject === null) return;

  item.subject = subject.trim();
  saveData();
  renderTimetable(document.getElementById("page-content"));
}

function deleteTimetableChange(id) {
  if (!confirm("この時間割変更を削除しますか？")) return;
  appData.timetable.changes = appData.timetable.changes.filter(item => item.id !== id);
  saveData();
  renderTimetable(document.getElementById("page-content"));
}

function getTimetableForDate(date) {
  ensureTimetableData();
  const dayNumber = parseDate(date).getDay();
  if (dayNumber === 0) return [];

  const periods = appData.timetable.weekly[dayNumber] || [];

  return Array.from({ length: 7 }, (_, index) => {
    const change = appData.timetable.changes.find(
      item => item.date === date && Number(item.period) === index + 1
    );
    return {
      period: index + 1,
      subject: change ? (change.subject || "") : (periods[index] || ""),
      changed: Boolean(change)
    };
  });
}
