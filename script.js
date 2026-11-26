
// ======================================
// Study - 学習管理システム
// ======================================

let appData = StudyStorage.load();

// Firebase同期設定
const firebaseConfig = {
  apiKey: "AIzaSyD0emj0nw9RTp8COfdSoUFqAgVjD2LNAcQ",
  authDomain: "study-ecd4a.firebaseapp.com",
  databaseURL: "https://study-ecd4a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "study-ecd4a",
  storageBucket: "study-ecd4a.firebasestorage.app",
  messagingSenderId: "411981535833",
  appId: "1:411981535833:web:c06a4a7d1be077e5e9ef48"
};

let firebaseAuth = null;
let firebaseDatabase = null;
let cloudUser = null;
let cloudReady = false;
let remoteListener = null;
let authMode = "login";

const pageNames = {
  home: "ホーム",
  calendar: "カレンダー",
  tasks: "課題管理",
  todo: "TODO",
  timetable: "時間割",
  dailyRecord: "1日の記録",
  notifications: "通知設定"
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
let dailyRecordDate = todayString();

// --------------------------------------
// 初期化
// --------------------------------------

let startupScreenStartedAt = Date.now();
let startupScreenFinished = false;

function finishStartupScreen() {
  if (startupScreenFinished) return;
  startupScreenFinished = true;

  const splash = document.getElementById("startup-screen");
  if (!splash) return;

  // 起動直後に一瞬で消えないよう、最低限の表示時間を確保する
  const remaining = Math.max(0, 750 - (Date.now() - startupScreenStartedAt));
  window.setTimeout(() => {
    splash.classList.add("is-leaving");
    window.setTimeout(() => splash.remove(), 480);
  }, remaining);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("today-label").textContent = formatDate(new Date());

  // サイドバーの各ボタンに直接クリック処理を登録する
  document.querySelectorAll("#navigation .nav-item").forEach(button => {
    button.type = "button";
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if (page) showPage(page);
    });
  });

  setupCalendarInteractions();
  setupZoomPrevention();
  setupCalendarStyles();
  setupFirebaseSync();

  // 認証状態の確認が長引いた場合も、接続待ちで画面が固まったままにしない
  window.setTimeout(() => {
    if (startupScreenFinished) return;
    renderAuthScreen("接続に時間がかかっています。通信状態を確認してください。");
  }, 12000);
});

// --------------------------------------
// 共通処理
// --------------------------------------

function saveData() {
  StudyStorage.save(appData);
  if (!cloudReady || !cloudUser || !firebaseDatabase) return;
  const payload = JSON.parse(JSON.stringify(appData));
  firebaseDatabase.ref(`study/${cloudUser.uid}`).set(payload).catch(error => {
    console.error("クラウドへの保存に失敗しました", error);
    showSyncNotice("クラウドへの保存に失敗しました。通信状態を確認してください。");
  });
}

function showSyncNotice(message) {
  let notice = document.getElementById("study-sync-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "study-sync-notice";
    notice.className = "sync-notice";
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.hidden = false;
}

function hideSyncNotice() {
  const notice = document.getElementById("study-sync-notice");
  if (notice) notice.hidden = true;
}

function renderAuthScreen(message = "") {
  const screen = document.getElementById("auth-screen");
  document.getElementById("app").hidden = true;
  screen.hidden = false;
  finishStartupScreen();
  screen.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">Study<span>.</span></div>
      <h1>${authMode === "signup" ? "アカウント作成" : "ログイン"}</h1>
      <p class="auth-description">iPadとスマホで同じアカウントを使うと、データが自動で同期されます。</p>
      <form id="auth-form">
        <label>メールアドレス<input id="auth-email" type="email" autocomplete="email" required></label>
        <label>パスワード<input id="auth-password" type="password" minlength="6" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}" required></label>
        <button class="primary-button" type="submit">${authMode === "signup" ? "アカウントを作成" : "ログイン"}</button>
      </form>
      <p id="auth-error" class="auth-error">${escapeHTML(message)}</p>
      <button type="button" id="auth-mode-button" class="auth-mode-button">${authMode === "signup" ? "すでにアカウントを持っている場合はログイン" : "初めて使う場合はアカウントを作成"}</button>
    </div>`;

  document.getElementById("auth-mode-button").addEventListener("click", () => {
    authMode = authMode === "signup" ? "login" : "signup";
    renderAuthScreen();
  });
  document.getElementById("auth-form").addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const errorBox = document.getElementById("auth-error");
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    errorBox.textContent = "処理中…";
    try {
      if (authMode === "signup") await firebaseAuth.createUserWithEmailAndPassword(email, password);
      else await firebaseAuth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      const messages = {
        "auth/email-already-in-use": "このメールアドレスは既に登録されています。ログインしてください。",
        "auth/invalid-email": "メールアドレスの形式を確認してください。",
        "auth/weak-password": "パスワードは6文字以上にしてください。",
        "auth/invalid-credential": "メールアドレスまたはパスワードが違います。",
        "auth/user-not-found": "アカウントが見つかりません。先にアカウントを作成してください。",
        "auth/network-request-failed": "通信に失敗しました。ネットワークを確認してください。"
      };
      errorBox.textContent = messages[error.code] || `エラーが発生しました（${error.code || "不明"}）。`;
      submit.disabled = false;
    }
  });
}

function setupFirebaseSync() {
  try {
    if (!window.firebase) throw new Error("Firebase SDKを読み込めませんでした。通信環境を確認してください。");
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    firebaseAuth = firebase.auth();
    firebaseDatabase = firebase.database();
    firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    document.getElementById("logout-button").addEventListener("click", async () => {
      if (!confirm("ログアウトしますか？")) return;
      await firebaseAuth.signOut();
    });
    firebaseAuth.onAuthStateChanged(async user => {
      cloudReady = false;
      if (remoteListener && cloudUser) {
        firebaseDatabase.ref(`study/${cloudUser.uid}`).off("value", remoteListener);
        remoteListener = null;
      }
      cloudUser = user;
      if (!user) {
        renderAuthScreen();
        return;
      }
      document.getElementById("auth-screen").hidden = true;
      document.getElementById("app").hidden = false;
      try {
        const userRef = firebaseDatabase.ref(`study/${user.uid}`);
        const snapshot = await userRef.once("value");
        if (snapshot.exists()) {
          appData = normalizeStudyData(snapshot.val());
          StudyStorage.save(appData);
        } else {
          // 初回接続時のみ、この端末に保存されている既存データをクラウドへ移行
          appData = StudyStorage.load();
          await userRef.set(appData);
        }
        cloudReady = true;
        remoteListener = snapshot => {
          if (!snapshot.exists()) return;
          appData = normalizeStudyData(snapshot.val());
          StudyStorage.save(appData);
          if (currentPage) showPage(currentPage);
          hideSyncNotice();
        };
        userRef.on("value", remoteListener, error => {
          console.error("同期の受信に失敗しました", error);
          showSyncNotice("同期の受信に失敗しました。Firebaseのルールを確認してください。");
        });
        showPage("home");
        finishStartupScreen();
      } catch (error) {
        console.error("Studyデータの同期準備に失敗しました", error);
        showSyncNotice("データを読み込めませんでした。Firebaseのルールと通信状態を確認してください。");
        showPage("home");
        finishStartupScreen();
      }
    });
  } catch (error) {
    console.error(error);
    renderAuthScreen(error.message || "Firebaseの初期化に失敗しました。");
  }
}

function normalizeStudyData(value) {
  const defaults = JSON.parse(JSON.stringify(studyData));
  const source = value && typeof value === "object" ? value : {};
  const timetable = source.timetable || {};
  return {
    events: Array.isArray(source.events) ? source.events : [],
    tasks: Array.isArray(source.tasks) ? source.tasks : [],
    todos: Array.isArray(source.todos) ? source.todos : [],
    dailyRecords: source.dailyRecords && typeof source.dailyRecords === "object" ? source.dailyRecords : {},
    dailyTags: Array.isArray(source.dailyTags) ? source.dailyTags : defaults.dailyTags,
    dailyTemplates: Array.isArray(source.dailyTemplates) ? source.dailyTemplates : [],
    notificationSettings: source.notificationSettings && typeof source.notificationSettings === "object" ? source.notificationSettings : null,
    timetable: {
      weekly: { ...defaults.timetable.weekly, ...(timetable.weekly || {}) },
      changes: Array.isArray(timetable.changes) ? timetable.changes : [],
      specialDays: Array.isArray(timetable.specialDays) ? timetable.specialDays : [],
      enabled: timetable.enabled !== false
    }
  };
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

// 日本の祝日（振替休日・国民の休日を含む）
function getJapaneseHolidays(year) {
  const holidays = new Set();
  const add = (month, day) => holidays.add(dateString(new Date(year, month - 1, day)));
  const nthMonday = (month, nth) => {
    const first = new Date(year, month - 1, 1).getDay();
    return 1 + (8 - first) % 7 + (nth - 1) * 7;
  };
  const vernal = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const autumn = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

  add(1, 1);
  year >= 2000 ? add(1, nthMonday(1, 2)) : add(1, 15);
  add(2, 11);
  if (year >= 2020) add(2, 23);
  add(3, vernal);
  add(4, 29);
  add(5, 3); add(5, 4); add(5, 5);

  if (year === 2020) { add(7, 23); add(7, 24); }
  else if (year === 2021) { add(7, 22); add(7, 23); }
  else if (year >= 2003) add(7, nthMonday(7, 3));
  else add(7, 20);

  if (year === 2020) add(8, 10);
  else if (year === 2021) add(8, 8);
  else if (year >= 2016) add(8, 11);

  year >= 2003 ? add(9, nthMonday(9, 3)) : add(9, 15);
  add(9, autumn);

  if (year >= 2000 && year !== 2020 && year !== 2021) add(10, nthMonday(10, 2));
  else if (year < 2000) add(10, 10);
  add(11, 3); add(11, 23);
  if (year >= 1989 && year <= 2018) add(12, 23);

  // 祝日に挟まれた日（国民の休日）
  const base = [...holidays].sort();
  for (let i = 0; i < base.length - 1; i++) {
    const middle = parseDate(base[i]);
    middle.setDate(middle.getDate() + 1);
    const after = new Date(middle);
    after.setDate(after.getDate() + 1);
    if (dateString(after) === base[i + 1] && middle.getDay() !== 0) holidays.add(dateString(middle));
  }

  // 日曜日に当たる祝日の振替休日
  [...holidays].sort().forEach(key => {
    if (parseDate(key).getDay() !== 0) return;
    const substitute = parseDate(key);
    do { substitute.setDate(substitute.getDate() + 1); }
    while (holidays.has(dateString(substitute)));
    holidays.add(dateString(substitute));
  });
  return holidays;
}

function isJapaneseHoliday(date) {
  return getJapaneseHolidays(date.getFullYear()).has(dateString(date));
}

function getJapaneseHolidayName(date) {
  const y = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const key = dateString(date);
  const nthMonday = (m, nth) => {
    const first = new Date(y, m - 1, 1).getDay();
    return 1 + (8 - first) % 7 + (nth - 1) * 7;
  };
  const vernal = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  const autumn = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

  if (month === 1 && day === 1) return "元日";
  if (month === 1 && day === (y >= 2000 ? nthMonday(1, 2) : 15)) return "成人の日";
  if (month === 2 && day === 11) return "建国記念の日";
  if (month === 2 && y >= 2020 && day === 23) return "天皇誕生日";
  if (month === 3 && day === vernal) return "春分の日";
  if (month === 4 && day === 29) return "昭和の日";
  if (month === 5 && day === 3) return "憲法記念日";
  if (month === 5 && day === 4) return "みどりの日";
  if (month === 5 && day === 5) return "こどもの日";
  if (month === 7 && day === (y === 2020 ? 23 : y === 2021 ? 22 : y >= 2003 ? nthMonday(7, 3) : 20)) return "海の日";
  if (month === 8 && day === (y === 2020 ? 10 : y === 2021 ? 8 : y >= 2016 ? 11 : -1)) return "山の日";
  if (month === 9 && day === (y >= 2003 ? nthMonday(9, 3) : 15)) return "敬老の日";
  if (month === 9 && day === autumn) return "秋分の日";
  if (month === 10 && day === (y === 2020 ? 24 : y === 2021 ? 23 : y >= 2000 ? nthMonday(10, 2) : 10)) return "スポーツの日";
  if (month === 11 && day === 3) return "文化の日";
  if (month === 11 && day === 23) return "勤労感謝の日";

  if (!isJapaneseHoliday(date)) return "";
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  if (isJapaneseHoliday(previous) && isJapaneseHoliday(next)) return "国民の休日";
  return "振替休日";
}

function isClosureEvent(item) {
  return item.category === "休校・休み";
}

function isDayOff(date, events = appData.events) {
  const key = dateString(date);
  return date.getDay() === 0 || isJapaneseHoliday(date) || events.some(item =>
    isClosureEvent(item) && eventOccursOn(item, key)
  );
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
    case "todo":
      renderTodo(content);
      break;
    case "timetable":
      renderTimetable(content);
      break;
    case "dailyRecord":
      renderDailyRecord(content);
      break;
    case "notifications":
      renderNotifications(content);
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
  // 日付数字の欄だけでなく、同じ週の予定欄・課題欄も含めて
  // 7列それぞれのマス全体をドロップ判定にする。
  const weeks = document.querySelectorAll(".month-week");

  for (const week of weeks) {
    const rect = week.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom || x < rect.left || x > rect.right) continue;

    const dayGrid = week.querySelector(".month-day-grid");
    if (!dayGrid) continue;

    const gridRect = dayGrid.getBoundingClientRect();
    const dayCells = Array.from(dayGrid.querySelectorAll(".month-day"));
    if (!dayCells.length || gridRect.width <= 0) continue;

    const columnWidth = gridRect.width / 7;
    const column = Math.max(0, Math.min(6, Math.floor((x - gridRect.left) / columnWidth)));
    return dayCells[column]?.dataset.date || null;
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
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 1);

  // 提出期限が今日の課題は、完了・未完了に関係なくすべて表示する
  const todayDueTasks = appData.tasks.filter(item => item.dueDate === today);
  const pendingTodos = appData.todos.filter(item => !item.completed);
  const timetableEnabled = appData.timetable?.enabled !== false;
  const todayTimetable = timetableEnabled
    ? getTimetableForDate(today).filter(item => item.subject && item.subject.trim())
    : [];

  const todayDueCard = todayDueTasks.length ? `
    <div class="card">
      <h2 class="card-title">本日提出の課題</h2>
      <div class="item-list">
        ${todayDueTasks.map(item => `
          <div class="list-item">
            <div>
              <strong>${escapeHTML(item.title || item.range || "課題")}</strong>
              <div class="muted">${escapeHTML(item.subject || "未分類")}</div>
            </div>
            <span class="tag">${item.status === "completed" ? "完了" : "未完了"}</span>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  const timetableCard = timetableEnabled ? `
    <div class="card wide">
      <h2 class="card-title">本日の時間割</h2>
      <div class="today-timetable-list">
        ${todayTimetable.length ? todayTimetable.map(item => `
          <div class="list-item today-timetable-item">
            <strong>${item.period}限</strong>
            ${item.changed ? `<span class="tag today-timetable-changed">変更</span>` : ""}
            <span class="today-timetable-subject">${escapeHTML(item.subject)}</span>
          </div>
        `).join("") : `<p class="muted">本日の授業はありません。</p>`}
      </div>
    </div>
  ` : "";

  const todoCard = pendingTodos.length ? `
    <div class="card wide">
      <div class="calendar-toolbar">
        <h2 class="card-title">TODO</h2>
        <button class="secondary-button" onclick="showPage('todo')">TODOを管理</button>
      </div>
      <div class="todo-list item-list">
        ${pendingTodos.map(item => `
          <label class="todo-item">
            <input type="checkbox" onchange="toggleTodo(${Number(item.id)}, this.checked)">
            <span>${escapeHTML(item.text)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  ` : "";

  const todayEventsCard = todayEvents.length ? `
    <div class="card">
      <h2 class="card-title">今日の予定</h2>
      <div class="item-list">
        ${todayEvents.map(item => `
          <button class="list-item event-list-button" onclick="openCalendarDay('${today}')">
            <strong>${escapeHTML(item.title)}</strong>
            <span class="tag">${escapeHTML(item.category || "その他")}</span>
          </button>
        `).join("")}
      </div>
    </div>
  ` : "";

  const upcomingTasksCard = upcomingTasks.length ? `
    <div class="card">
      <h2 class="card-title">これからの課題</h2>
      <div class="item-list">
        ${upcomingTasks.map(item => `
          <div class="list-item">
            <div>
              <strong>${escapeHTML(item.title || item.range || "課題")}</strong>
              <div class="muted">期限：${escapeHTML(item.dueDate)}</div>
            </div>
            <span class="tag">${escapeHTML(item.subject || "未分類")}</span>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  content.innerHTML = `
    ${todayEvents.length || pendingTasks.length ? `
      <div class="stat-grid">
        ${todayEvents.length ? `
          <div class="stat-card">
            <div class="stat-label">今日の予定</div>
            <div class="stat-value">${todayEvents.length}<span class="muted"> 件</span></div>
          </div>
        ` : ""}
        ${pendingTasks.length ? `
          <div class="stat-card">
            <div class="stat-label">未完了の課題</div>
            <div class="stat-value">${pendingTasks.length}<span class="muted"> 件</span></div>
          </div>
        ` : ""}
      </div>
    ` : ""}

    <div class="dashboard-grid">
      ${todayDueCard}
      ${timetableCard}
      ${todoCard}
      ${todayEventsCard}
      ${upcomingTasksCard}
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
    "その他": "event-orange",
    "部活動関係": "event-pink"
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
        <span><i class="legend-pink"></i>部活動</span>
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
        !isClosureEvent(item) &&
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
      const count = day.events.filter(item => !isClosureEvent(item)).length;
      const dayOff = isDayOff(day.date, appData.events);
      const closureTitles = day.events.filter(isClosureEvent).map(item=>item.title).filter(Boolean);
      const dayLabel = isJapaneseHoliday(day.date)
        ? getJapaneseHolidayName(day.date)
        : (day.date.getDay() === 0 ? "" : (closureTitles[0] || ""));

      return `
        <div class="month-day ${day.key === today ? "today" : ""} ${day.outside ? "outside-month" : ""} ${dayOff ? "day-off" : ""}"
          data-date="${day.key}"
          onclick="openCalendarDay('${day.key}')"
          role="button"
          tabindex="0"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCalendarDay('${day.key}')}">

          <div class="month-day-heading">
            <span class="month-day-number">${day.date.getDate()}</span>
            ${dayLabel ? `<span class="month-day-holiday-title">${escapeHTML(dayLabel)}</span>` : ""}
            ${count > 3 ? `<span class="month-overflow">4つ以上</span>` : ""}
          </div>
        </div>
      `;
    }).join("");

    // 予定欄の空白部分をクリックできるようにする
    const eventHitTargets = days.map((day, index) => `
      <button
        type="button"
        class="month-event-hit-target ${isDayOff(day.date, appData.events) ? "day-off" : ""} ${day.outside ? "outside-month" : ""}"
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
      <div class="month-task-cell ${isDayOff(day.date, appData.events) ? "day-off" : ""} ${day.outside ? "outside-month" : ""}"
        onclick="openCalendarDay('${day.key}')">
        ${day.tasks.map(task => `
          <div class="month-task-label">課題：${escapeHTML(task.title || task.range || "課題")}</div>
        `).join("")}
      </div>
    `).join("");

    const weekBackgroundStops = days.map((day, index) => {
      const dayOff = isDayOff(day.date, appData.events);
      const color = day.outside
        ? "#f4f5f7"
        : dayOff
          ? (day.key === today ? "#f8dddd" : "#fce8e8")
          : day.key === today
            ? "#f0f2ff"
            : "#ffffff";
      const start = (index / 7) * 100;
      const end = ((index + 1) / 7) * 100;
      return `${color} ${start}% ${end}%`;
    }).join(", ");

    html += `
      <div class="month-week" style="background: linear-gradient(to right, ${weekBackgroundStops});">
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
    <div class="calendar-column ${isDayOff(date, appData.events) ? "day-off" : ""}">
      <button class="calendar-column-date" onclick="openCalendarDay('${dateKey}')">
        ${date.getMonth() + 1}/${date.getDate()}
        (${["日", "月", "火", "水", "木", "金", "土"][date.getDay()]})
      </button>

      ${events.some(item => !isClosureEvent(item)) ? events.filter(item => !isClosureEvent(item)).map(item => `
        <button class="calendar-event ${getCategoryStyle(item.category)}"
          onclick="openCalendarDay('${dateKey}')">
          ${escapeHTML(item.title)}
        </button>
      `).join("") : (isDayOff(date, appData.events) ? `<p class="day-off-label">休み</p>` : `<p class="muted">予定はありません。</p>`)}

      ${tasks.map(item => `
        <div class="calendar-event event-task">
          課題：${escapeHTML(item.title || item.range || "課題")}
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

      <div class="calendar-detail-date ${isDayOff(date, appData.events) ? "day-off" : ""}">
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
            <span class="event-detail-title">${escapeHTML(item.title || "休み")}</span>
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
    "その他",
    "部活動関係"
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
        <div class="form-field" id="event-title-field">
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

  const titleField = document.getElementById("event-title-field");
  const titleInput = document.getElementById("event-title");
  const categoryInputs = document.querySelectorAll('input[name="category"]');
  const updateClosureForm = () => {
    const closure = document.querySelector('input[name="category"]:checked')?.value === "休校・休み";
    titleField.hidden = closure;
    titleInput.required = !closure;
    if (closure) titleInput.value = "";
  };
  categoryInputs.forEach(input => input.addEventListener("change", updateClosureForm));
  updateClosureForm();

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

  const isClosure = category === "休校・休み";

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
          <h2>${isClosureEvent(item) ? "休み" : escapeHTML(item.title)}</h2>
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
  const pendingTasks = appData.tasks
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item.status !== "completed")
    .sort((a, b) => {
      const dateCompare = (a.item.dueDate || "").localeCompare(b.item.dueDate || "");
      return dateCompare || a.index - b.index;
    });

  const completedTasks = appData.tasks
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item.status === "completed");

  const renderTaskItems = entries => entries.length ? entries.map(({ item, index }) => `
    <div class="list-item">
      <div>
        <strong>${escapeHTML(item.title || item.range || "課題")}</strong>
        <div class="muted">
          ${escapeHTML(item.subject || "未分類")} ・ 期限：${escapeHTML(item.dueDate || "未設定")}
        </div>
        ${item.range ? `<div class="task-range-preview">${escapeHTML(item.range).replace(/\n/g, "<br>")}</div>` : ""}
        ${item.memo ? `<div class="muted task-memo-preview">${escapeHTML(item.memo).replace(/\n/g, "<br>")}</div>` : ""}
      </div>
      <div class="task-actions">
        <select onchange="changeTaskStatus(${index}, this.value)">
          <option value="notStarted" ${item.status === "notStarted" ? "selected" : ""}>未着手</option>
          <option value="inProgress" ${item.status === "inProgress" ? "selected" : ""}>進行中</option>
          <option value="completed" ${item.status === "completed" ? "selected" : ""}>完了</option>
        </select>
        <button class="secondary-button" onclick="deleteTask(${index})">削除</button>
      </div>
    </div>
  `).join("") : `<p class="muted">課題はありません。</p>`;

  content.innerHTML = `
    <div class="card">
      <div class="calendar-toolbar">
        <h2 class="card-title">課題一覧</h2>
        <button class="primary-button" onclick="addTask()">＋ 課題を追加</button>
      </div>
      <section class="task-list-section">
        <h3 class="task-section-title">未完了の課題</h3>
        <div class="item-list">${renderTaskItems(pendingTasks)}</div>
      </section>
      <section class="task-list-section completed-task-section">
        <h3 class="task-section-title">完了した課題</h3>
        <div class="item-list">${renderTaskItems(completedTasks)}</div>
      </section>
    </div>
  `;
}

function addTask() {
  renderTaskForm();
}

function renderTaskForm() {
  const content = document.getElementById("page-content");
  const subjects = [...new Set(appData.tasks.map(task => (task.subject || "").trim()).filter(Boolean))];

  content.innerHTML = `
    <div class="task-form-page">
      <div class="task-form-header">
        <button class="secondary-button" onclick="showPage('tasks')">← 課題一覧に戻る</button>
        <h2>課題を追加</h2>
        <p class="muted">必要な情報を入力してください。</p>
      </div>

      <form class="task-form-card" onsubmit="submitTaskForm(event)">
        <label class="task-form-field">
          <span>課題名 <small>任意</small></span>
          <input type="text" id="task-title" placeholder="例：夏休み課題">
        </label>

        <label class="task-form-field">
          <span>教科</span>
          <input type="text" id="task-subject" list="task-subject-options" placeholder="教科を入力" required>
          <datalist id="task-subject-options">
            ${subjects.map(subject => `<option value="${escapeHTML(subject)}"></option>`).join("")}
          </datalist>
        </label>

        <label class="task-form-field">
          <span>課題の範囲</span>
          <textarea id="task-range" rows="4" placeholder="例：4STEP P.20〜30" required></textarea>
        </label>

        <label class="task-form-field">
          <span>提出期限</span>
          <input type="date" id="task-due-date" value="${todayString()}" required>
        </label>

        <label class="task-form-field">
          <span>メモ <small>任意</small></span>
          <textarea id="task-memo" rows="3" placeholder="補足事項など"></textarea>
        </label>

        <div class="task-form-actions">
          <button type="button" class="secondary-button" onclick="showPage('tasks')">キャンセル</button>
          <button type="submit" class="primary-button">課題を登録</button>
        </div>
      </form>
    </div>
  `;
  document.getElementById("page-title").textContent = "課題を追加";
}

function submitTaskForm(event) {
  event.preventDefault();

  const title = document.getElementById("task-title").value.trim();
  const subject = document.getElementById("task-subject").value.trim();
  const range = document.getElementById("task-range").value.trim();
  const dueDate = document.getElementById("task-due-date").value;
  const memo = document.getElementById("task-memo").value.trim();

  if (!subject || !range || !dueDate) return;

  appData.tasks.push({
    id: Date.now(),
    title,
    subject,
    range,
    dueDate,
    memo,
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
// TODO
// --------------------------------------

function renderTodo(content) {
  const pending = appData.todos.filter(item => !item.completed);
  const completed = appData.todos.filter(item => item.completed);
  const renderItems = (items, isCompleted) => items.length ? items.map(item => `
    <div class="todo-item todo-page-item ${isCompleted ? "is-completed" : ""}">
      <label>
        <input type="checkbox" ${isCompleted ? "checked" : ""} onchange="toggleTodo(${Number(item.id)}, this.checked)">
        <span>${escapeHTML(item.text)}</span>
      </label>
      <button class="secondary-button" onclick="deleteTodo(${Number(item.id)})">削除</button>
    </div>
  `).join("") : `<p class="muted">${isCompleted ? "完了したTODOはありません。" : "TODOはありません。"}</p>`;

  content.innerHTML = `
    <div class="card">
      <h2 class="card-title">TODOを追加</h2>
      <form class="todo-add-form" onsubmit="addTodo(event)">
        <input id="todo-input" type="text" maxlength="120" placeholder="やることを入力" required>
        <button class="primary-button" type="submit">追加</button>
      </form>
      <section class="task-list-section">
        <h3 class="task-section-title">未完了</h3>
        <div class="todo-list">${renderItems(pending, false)}</div>
      </section>
      <section class="task-list-section completed-task-section">
        <h3 class="task-section-title">完了</h3>
        <div class="todo-list">${renderItems(completed, true)}</div>
      </section>
    </div>
  `;
}

function addTodo(event) {
  event.preventDefault();
  const input = document.getElementById("todo-input");
  const text = input.value.trim();
  if (!text) return;
  appData.todos.push({ id: Date.now(), text, completed: false });
  saveData();
  renderTodo(document.getElementById("page-content"));
}

function toggleTodo(id, completed) {
  const item = appData.todos.find(todo => Number(todo.id) === Number(id));
  if (!item) return;
  item.completed = completed;
  saveData();
  if (currentPage === "todo") renderTodo(document.getElementById("page-content"));
  else if (currentPage === "home") renderHome(document.getElementById("page-content"));
}

function deleteTodo(id) {
  appData.todos = appData.todos.filter(todo => Number(todo.id) !== Number(id));
  saveData();
  renderTodo(document.getElementById("page-content"));
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
  { number: 6, name: "土" },
  { number: 0, name: "日" }
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
  if (!Array.isArray(appData.timetable.specialDays)) {
    appData.timetable.specialDays = [];
  }
  if (typeof appData.timetable.enabled !== "boolean") {
    appData.timetable.enabled = true;
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

  const weekEnd = weekDates[6].date;
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

    </div>

    ${appData.timetable.enabled ? `
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
    ` : ""}

    <div class="card timetable-card">
      <h2 class="card-title">特殊時間割</h2>
      <p class="muted">指定した日付の時間割を、通常時間割の代わりに1〜7限までまとめて登録できます。授業がないコマは空欄にしてください。</p>
      <form class="special-timetable-form" id="special-timetable-form">
        <div class="form-field">
          <label for="special-timetable-date">日付</label>
          <input id="special-timetable-date" type="date" value="${todayString()}" required>
        </div>
        <div class="special-timetable-grid">
          ${Array.from({length:7},(_,i)=>`
            <div class="form-field">
              <label for="special-period-${i+1}">${i+1}限</label>
              <input id="special-period-${i+1}" type="text" maxlength="30" placeholder="授業なしは空欄">
            </div>
          `).join("")}
        </div>
        <button class="primary-button" type="submit">特殊時間割を保存</button>
      </form>
    </div>

    <div class="card timetable-toggle-card">
      <h2 class="card-title">時間割の表示</h2>
      <label class="timetable-toggle-label">
        <input type="checkbox" ${appData.timetable.enabled ? "checked" : ""} onchange="toggleTimetable(this.checked)">
        <span>時間割を表示する</span>
      </label>
      <p class="muted">OFFにすると通常時間割・特殊時間割の両方が非表示になります。ONに戻すまで、この設定は維持されます。</p>
    </div>    <details class="card timetable-card timetable-settings-card">
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

    <div class="card timetable-card">
      <h2 class="card-title">登録済みの変更</h2>
      <div class="timetable-change-list">
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

    <div class="card timetable-card">
      <h2 class="card-title">登録済みの特殊時間割</h2>
      <div class="timetable-change-list">
        ${appData.timetable.specialDays.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(item=>`
          <div class="timetable-change-row">
            <div>
              <strong>${escapeHTML(item.date)}（${["日","月","火","水","木","金","土"][parseDate(item.date).getDay()]}）</strong>
              <div class="muted">${(item.periods || []).map((subject,index)=>`${index+1}限 ${subject ? escapeHTML(subject) : "／"}`).join(" ・ ")}</div>
            </div>
            <div class="timetable-change-actions">
              <button class="secondary-button" type="button" onclick="editSpecialTimetable('${item.date}')">編集</button>
              <button class="secondary-button" type="button" onclick="deleteSpecialTimetable('${item.date}')">削除</button>
            </div>
          </div>
        `).join("") || `<p class="muted">特殊時間割は登録されていません。</p>`}
      </div>
    </div>
  `;

  // iOS Safariでも確実に送信処理が動くよう、描画後にsubmitイベントを直接登録する。
  const specialTimetableForm = content.querySelector("#special-timetable-form");
  if (specialTimetableForm) {
    specialTimetableForm.addEventListener("submit", saveSpecialTimetable);
  }
}

function saveSpecialTimetable(event) {
  event.preventDefault();
  ensureTimetableData();
  const date = document.getElementById("special-timetable-date").value;
  if (!date) return;
  const periods = Array.from({length:7},(_,index)=>
    document.getElementById(`special-period-${index+1}`).value.trim()
  );
  const existing = appData.timetable.specialDays.find(item=>item.date===date);
  if (existing) existing.periods = periods;
  else appData.timetable.specialDays.push({ id: Date.now(), date, periods });
  saveData();
  renderTimetable(document.getElementById("page-content"));
}

function editSpecialTimetable(date) {
  const item = appData.timetable.specialDays.find(entry=>entry.date===date);
  if (!item) return;
  document.getElementById("special-timetable-date").value = item.date;
  (item.periods || []).forEach((subject,index)=>{
    const field=document.getElementById(`special-period-${index+1}`);
    if(field) field.value=subject || "";
  });
  document.getElementById("special-timetable-date").scrollIntoView({behavior:"smooth",block:"center"});
}

function deleteSpecialTimetable(date) {
  if (!confirm(`${date}の特殊時間割を削除しますか？`)) return;
  appData.timetable.specialDays=appData.timetable.specialDays.filter(item=>item.date!==date);
  saveData();
  renderTimetable(document.getElementById("page-content"));
}

function toggleTimetable(enabled) {
  ensureTimetableData();
  appData.timetable.enabled = enabled;
  saveData();
  renderTimetable(document.getElementById("page-content"));
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
  const special = appData.timetable.specialDays.find(item => item.date === date);
  const periods = special
    ? (Array.isArray(special.periods) ? special.periods : [])
    : (appData.timetable.weekly[dayNumber] || []);

  return Array.from({ length: 7 }, (_, index) => {
    const change = special ? null : appData.timetable.changes.find(
      item => item.date === date && Number(item.period) === index + 1
    );
    return {
      period: index + 1,
      subject: special
        ? (periods[index] || "")
        : (change ? (change.subject || "") : (periods[index] || "")),
      changed: Boolean(special || change),
      special: Boolean(special)
    };
  });
}


// --------------------------------------
// 1日の記録・24時間タイムチャート
// --------------------------------------

const DEFAULT_DAILY_TAGS = [
  { id: "sleep", name: "睡眠", color: "#8295e5" },
  { id: "study", name: "勉強", color: "#d58dad" },
  { id: "school", name: "学校", color: "#58a68b" },
  { id: "club", name: "部活", color: "#e5b65b" },
  { id: "commute", name: "通学・移動", color: "#70a9c9" },
  { id: "meal", name: "食事", color: "#d58b68" },
  { id: "bath", name: "入浴", color: "#8bb9b4" },
  { id: "free", name: "自由時間", color: "#a78bd4" },
  { id: "other", name: "その他", color: "#9aa1ad" }
];

let dailyRecordView = "main";
let dailyEntryFormState = null;
let dailyTemplatePanelOpen = false;
let dailySelectedTemplateId = "";
let dailyTemplateDraft = null;
let dailyTemplateEntryFormOpen = false;
let dailyTemplateEntryEditingId = "";

function ensureDailyRecordData() {
  if (!appData.dailyRecords || typeof appData.dailyRecords !== "object") appData.dailyRecords = {};
  if (!Array.isArray(appData.dailyTags)) appData.dailyTags = DEFAULT_DAILY_TAGS.map(tag => ({ ...tag }));
  if (!Array.isArray(appData.dailyTemplates)) appData.dailyTemplates = [];
}

function dailyMakeId(prefix = "item") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function dailyTimeToMinutes(value, allow24 = false) {
  if (allow24 && value === "24:00") return 1440;
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function dailyMinutesToTime(value) {
  if (Number(value) === 1440) return "24:00";
  const minutes = ((Math.round(Number(value) || 0) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dailyDateOffset(date, offset) {
  const shifted = parseDate(date);
  shifted.setDate(shifted.getDate() + offset);
  return dateString(shifted);
}

function dailyDateShort(date) {
  const parts = String(date || "").split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : String(date || "");
}

function dailyEntryDateRange(start, end, recordDate) {
  const crossesMidnight = end < start;
  const startDate = crossesMidnight ? dailyDateOffset(recordDate, -1) : recordDate;
  const endDate = recordDate;
  return `${dailyDateShort(startDate)} ${dailyMinutesToTime(start)} 〜 ${dailyDateShort(endDate)} ${dailyMinutesToTime(end)}`;
}

function dailyFormatDuration(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (!value) return "0分";
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return `${hours ? `${hours}時間` : ""}${rest ? `${rest}分` : ""}`;
}

function dailySafeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : "#9aa1ad";
}

function dailyTagSnapshot(tagId, fallback = {}) {
  const tag = appData.dailyTags.find(item => item.id === tagId);
  return tag ? { tagId: tag.id, tagName: tag.name, tagColor: dailySafeColor(tag.color) } : {
    tagId: fallback.tagId || tagId || "",
    tagName: fallback.tagName || "未設定タグ",
    tagColor: dailySafeColor(fallback.tagColor)
  };
}

function dailyNormalizeEntry(entry) {
  const start = Number.isInteger(entry.start) ? entry.start : dailyTimeToMinutes(entry.startTime);
  let end = Number.isInteger(entry.end) ? entry.end : dailyTimeToMinutes(entry.endTime, true);
  if (entry.end24 === true || entry.end === 1440) end = 1440;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= 1440 || end < 0 || end > 1440 || end === start) return null;
  const snapshot = entry.tagName ? {
    tagId: entry.tagId || "",
    tagName: entry.tagName,
    tagColor: dailySafeColor(entry.tagColor)
  } : dailyTagSnapshot(entry.tagId, entry);
  return {
    id: entry.id || dailyMakeId("activity"),
    start,
    end,
    startDate: typeof entry.startDate === "string" ? entry.startDate : "",
    endDate: typeof entry.endDate === "string" ? entry.endDate : "",
    ...snapshot
  };
}

function dailyGetRecord(date = dailyRecordDate) {
  if (!appData.dailyRecords[date]) {
    appData.dailyRecords[date] = { wakeTime: "", sleepTime: "", studyMinutes: "", note: "", entries: [] };
  }
  const record = appData.dailyRecords[date];
  if (!Array.isArray(record.entries)) record.entries = [];
  return record;
}

function dailyEntrySegments(entry) {
  if (entry.end === 1440 || entry.end > entry.start) return [{ start: entry.start, end: entry.end, entry }];
  return [
    { start: entry.start, end: 1440, entry },
    { start: 0, end: entry.end, entry }
  ].filter(segment => segment.end > segment.start);
}

function dailyEntriesOverlap(first, second) {
  const firstSegments = dailyEntrySegments(first);
  const secondSegments = dailyEntrySegments(second);
  return firstSegments.some(a => secondSegments.some(b => a.start < b.end && a.end > b.start));
}

function dailyEntryDuration(entry) {
  return entry.end > entry.start ? entry.end - entry.start : 1440 - entry.start + entry.end;
}

function dailyGetBreakdown(entries) {
  const totals = {};
  const labels = {};
  const colors = {};
  let cursor = 0;
  const sorted = (Array.isArray(entries) ? entries : [])
    .map(dailyNormalizeEntry).filter(Boolean)
    .flatMap(dailyEntrySegments).sort((a, b) => a.start - b.start || a.end - b.end);
  sorted.forEach(segment => {
    const entry = segment.entry;
    if (segment.start > cursor) {
      totals.unassigned = (totals.unassigned || 0) + segment.start - cursor;
      labels.unassigned = "未登録";
      colors.unassigned = "#dfe3ea";
    }
    const start = Math.max(cursor, segment.start);
    const end = Math.max(start, segment.end);
    if (end > start) {
      const key = entry.tagId || `snapshot_${entry.tagName}`;
      totals[key] = (totals[key] || 0) + end - start;
      labels[key] = entry.tagName || "未設定タグ";
      colors[key] = dailySafeColor(entry.tagColor);
      cursor = end;
    }
  });
  if (cursor < 1440) {
    totals.unassigned = (totals.unassigned || 0) + 1440 - cursor;
    labels.unassigned = "未登録";
    colors.unassigned = "#dfe3ea";
  }
  return Object.keys(totals).map(key => ({ key, name: labels[key], minutes: totals[key], color: colors[key] }))
    .filter(item => item.minutes > 0).sort((a, b) => b.minutes - a.minutes);
}

function dailyGetStudyMinutes(record) {
  if (Array.isArray(record.entries) && record.entries.length) {
    return record.entries.reduce((sum, raw) => {
      const entry = dailyNormalizeEntry(raw);
      return sum + (entry && (entry.tagId === "study" || entry.tagName === "勉強") ? dailyEntryDuration(entry) : 0);
    }, 0);
  }
  return Number(record.studyMinutes) || 0;
}

function dailyRenderClock(entries, date = dailyRecordDate, extraClass = "") {
  const segments = (Array.isArray(entries) ? entries : [])
    .map(dailyNormalizeEntry).filter(Boolean)
    .flatMap(dailyEntrySegments).sort((a, b) => a.start - b.start);
  const stops = [];
  let cursor = 0;
  segments.forEach(segment => {
    if (segment.start > cursor) stops.push(`#dfe3ea ${(cursor / 1440 * 360).toFixed(2)}deg ${(segment.start / 1440 * 360).toFixed(2)}deg`);
    const start = Math.max(cursor, segment.start);
    const end = Math.max(start, segment.end);
    if (end > start) {
      stops.push(`${dailySafeColor(segment.entry.tagColor)} ${(start / 1440 * 360).toFixed(2)}deg ${(end / 1440 * 360).toFixed(2)}deg`);
      cursor = end;
    }
  });
  if (cursor < 1440) stops.push(`#dfe3ea ${(cursor / 1440 * 360).toFixed(2)}deg 360deg`);
  const gradient = stops.length ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#dfe3ea 0deg 360deg)";
  const parsed = parseDate(date);
  const centerDate = `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
  const weekday = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][parsed.getDay()];
  const labels = Array.from({ length: 24 }, (_, hour) => {
    const angle = hour / 24 * Math.PI * 2 - Math.PI / 2;
    const left = 50 + Math.cos(angle) * 46;
    const top = 50 + Math.sin(angle) * 46;
    return `<span class="daily-clock-label" style="left:${left.toFixed(3)}%;top:${top.toFixed(3)}%">${hour}</span>`;
  }).join("");
  return `
    <div class="daily-clock-wrap ${extraClass}">
      <div class="daily-clock-stage">
        <div class="daily-clock" role="img" aria-label="${escapeHTML(formatDate(parsed))}の24時間タイムチャート。空白部分をタップすると予定を追加、色の付いた部分をタップすると編集できます。" style="background:${gradient}">
          <div class="daily-clock-hole"><strong>${centerDate}</strong><small>${weekday}</small></div>
        </div>
        ${labels}
      </div>
    </div>`;
}
function dailyRenderBreakdown(entries) {
  const breakdown = dailyGetBreakdown(entries);
  return `<div class="daily-pie-legend">${breakdown.map(item => `
    <div class="daily-pie-legend-row"><span class="daily-pie-dot" style="background:${item.color}"></span><span class="daily-pie-name">${escapeHTML(item.name)}</span><strong>${dailyFormatDuration(item.minutes)}</strong><small>${(item.minutes / 1440 * 100).toFixed(1)}%</small></div>`).join("")}</div>`;
}

function dailyTagOptions(selectedId, fallbackEntry = null) {
  const options = appData.dailyTags.map(tag => `<option value="${escapeHTML(tag.id)}" ${tag.id === selectedId ? "selected" : ""}>${escapeHTML(tag.name)}</option>`);
  if (selectedId && !appData.dailyTags.some(tag => tag.id === selectedId) && fallbackEntry) {
    options.push(`<option value="${escapeHTML(selectedId)}" selected>${escapeHTML(fallbackEntry.tagName || "削除済みタグ")}（過去のタグ）</option>`);
  }
  return options.join("");
}

function dailyRenderEntryForm(mode, entry = null, startValue = "08:00") {
  const isEdit = mode === "edit";
  const start = entry ? dailyMinutesToTime(entry.start) : startValue;
  const end = dailyEntryFormState?.end || (entry ? dailyMinutesToTime(entry.end) : dailyMinutesToTime((dailyTimeToMinutes(startValue) + 60) % 1440));
  const selectedTag = entry ? entry.tagId : (appData.dailyTags[0]?.id || "");
  return `<form id="daily-entry-form" class="daily-entry-form" data-mode="${mode}" data-entry-id="${escapeHTML(entry?.id || "")}">
    <div class="daily-entry-form-heading"><strong>${isEdit ? "予定を編集" : "予定を追加"}</strong><button type="button" class="icon-text-button" data-action="close-entry-form">閉じる</button></div>
    <div class="daily-entry-time-fields">
      <label>開始時刻<input id="daily-entry-start" type="time" step="300" value="${escapeHTML(start === "24:00" ? "00:00" : start)}" required></label>
      <span>〜</span>
      <label>終了時刻<input id="daily-entry-end" type="time" step="300" value="${escapeHTML(end === "24:00" ? "00:00" : end)}" required></label>
    </div>
    <p id="daily-entry-date-range" class="muted">${dailyEntryDateRange(dailyTimeToMinutes(start), dailyTimeToMinutes(end, true), dailyRecordDate)}</p>
    <label class="daily-entry-tag-label">タグ<select id="daily-entry-tag" required>${dailyTagOptions(selectedTag, entry)}</select></label>
    <div class="daily-entry-form-actions"><button type="submit" class="primary-button" ${appData.dailyTags.length ? "" : "disabled"}>${isEdit ? "変更を保存" : "予定を登録"}</button>${isEdit ? `<button type="button" class="danger-button" data-action="delete-current-entry">削除</button>` : ""}</div>
    <p class="muted">例：23:00〜06:00のように終了時刻が開始時刻より早い場合は翌日扱い。24:00も入力できるよ。</p>
    ${appData.dailyTags.length ? "" : `<p class="muted">先にタグを追加してな。</p>`}
  </form>`;
}

function dailyRenderTemplateEditor() {
  if (!dailyTemplateDraft) return "";
  const draft = dailyTemplateDraft;
  const entries = (draft.entries || []).map(dailyNormalizeEntry).filter(Boolean).sort((a, b) => a.start - b.start);
  const editEntry = entries.find(item => item.id === dailyTemplateEntryEditingId);
  return `<div class="daily-template-editor">
    <div class="daily-section-heading"><strong>${draft.id ? "テンプレートを編集" : "新しいテンプレート"}</strong><button type="button" class="icon-text-button" data-action="close-template-editor">閉じる</button></div>
    <label class="daily-template-name-label">テンプレート名<input id="daily-template-name" type="text" maxlength="30" placeholder="例：平日（部活あり）" value="${escapeHTML(draft.name || "")}"></label>
    <div class="daily-template-entry-list">${entries.length ? entries.map(entry => `<div class="daily-template-entry-row"><span class="daily-entry-color" style="background:${dailySafeColor(entry.tagColor)}"></span><span><strong>${escapeHTML(entry.tagName)}</strong><small>${dailyEntryDateRange(entry.start, entry.end, dailyRecordDate)}</small></span><button type="button" class="secondary-button" data-action="edit-template-entry" data-entry-id="${escapeHTML(entry.id)}">編集</button><button type="button" class="danger-button" data-action="delete-template-entry" data-entry-id="${escapeHTML(entry.id)}">削除</button></div>`).join("") : `<p class="muted">まだ予定がありません。空の状態から1件ずつ追加できるよ。</p>`}</div>
    <button type="button" class="secondary-button" data-action="add-template-entry">＋ 予定を追加</button>
    ${dailyTemplateEntryFormOpen ? `<form id="daily-template-entry-form" class="daily-entry-form" data-entry-id="${escapeHTML(editEntry?.id || "")}">
      <strong>${editEntry ? "テンプレートの予定を編集" : "テンプレートに予定を追加"}</strong>
      <div class="daily-entry-time-fields"><label>開始時刻<input id="daily-template-entry-start" type="time" step="300" value="${editEntry ? dailyMinutesToTime(editEntry.start) : "08:00"}" required></label><span>〜</span><label>終了時刻<input id="daily-template-entry-end" type="time" step="300" value="${editEntry ? (dailyMinutesToTime(editEntry.end) === "24:00" ? "00:00" : dailyMinutesToTime(editEntry.end)) : "09:00"}" required></label></div>
      <label class="daily-entry-tag-label">タグ<select id="daily-template-entry-tag" required>${dailyTagOptions(editEntry?.tagId || appData.dailyTags[0]?.id || "", editEntry)}</select></label>
      <div class="daily-entry-form-actions"><button type="submit" class="primary-button" ${appData.dailyTags.length ? "" : "disabled"}>${editEntry ? "変更を保存" : "追加"}</button><button type="button" class="secondary-button" data-action="cancel-template-entry">キャンセル</button></div>
    </form>` : ""}
    <div class="daily-entry-form-actions"><button type="button" class="primary-button" data-action="save-template">テンプレートを保存</button><button type="button" class="secondary-button" data-action="close-template-editor">キャンセル</button></div>
  </div>`;
}

function dailyRenderSettings(content) {
  const templateRows = appData.dailyTemplates.length ? appData.dailyTemplates.map(item => `
    <div class="daily-template-row"><strong>${escapeHTML(item.name)}</strong><small>${(item.entries || []).length}件</small>
      <button type="button" class="secondary-button" data-action="edit-template" data-template-id="${escapeHTML(item.id)}">編集</button>
      <button type="button" class="danger-button" data-action="delete-template" data-template-id="${escapeHTML(item.id)}">削除</button>
    </div>`).join("") : `<p class="muted">テンプレートはまだありません。</p>`;
  content.innerHTML = `
    <div class="daily-record-card">
      <button type="button" class="secondary-button daily-back-button" data-action="back-to-daily-main">‹ 1日の記録に戻る</button>
      <h2 class="card-title">設定</h2>
      <section class="card daily-tag-manager">
        <h3 class="card-title">タグ管理</h3>
        <p class="muted">予定1件につきタグは1つ。タグ名や色を変更できるよ。過去の記録には登録当時の名前と色を残すよ。</p>
        <form id="daily-tag-add-form" class="daily-tag-add-form">
          <label>新しいタグ<input id="daily-tag-new-name" type="text" maxlength="20" placeholder="例：読書" required></label>
          <label>色<input id="daily-tag-new-color" type="color" value="#8295e5"></label>
          <button type="submit" class="secondary-button">タグを追加</button>
        </form>
        <div class="daily-tag-list">${appData.dailyTags.map(tag => `
          <div class="daily-tag-row" data-tag-id="${escapeHTML(tag.id)}">
            <input class="daily-tag-edit-name" type="text" maxlength="20" value="${escapeHTML(tag.name)}" aria-label="タグ名">
            <input class="daily-tag-edit-color" type="color" value="${dailySafeColor(tag.color)}" aria-label="タグの色">
            <button type="button" class="secondary-button" data-action="save-tag">保存</button>
            <button type="button" class="danger-button" data-action="delete-tag">削除</button>
          </div>`).join("")}</div>
      </section>
      <section class="card daily-template-manager">
        <div class="daily-section-heading"><h3 class="card-title">テンプレート管理</h3><button type="button" class="primary-button" data-action="create-template">＋ 新規作成</button></div>
        <p class="muted">空の状態から予定を1件ずつ追加してテンプレートを作れるよ。</p>
        ${templateRows}
        ${dailyRenderTemplateEditor()}
      </section>
    </div>`;
  dailyBindSettingsEvents(content);
}

function dailyBindSettingsEvents(content) {
  content.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "back-to-daily-main") { dailyRecordView = "main"; dailyTemplateDraft = null; renderDailyRecord(content); return; }
    if (action === "create-template") { dailyTemplateDraft = { id: "", name: "", entries: [] }; dailyTemplateEntryFormOpen = false; dailyTemplateEntryEditingId = ""; renderDailyRecord(content); return; }
    if (action === "edit-template") {
      const template = appData.dailyTemplates.find(item => item.id === button.dataset.templateId);
      if (!template) return;
      dailyTemplateDraft = { id: template.id, name: template.name, entries: (template.entries || []).map(item => ({ ...item })) };
      dailyTemplateEntryFormOpen = false; dailyTemplateEntryEditingId = ""; renderDailyRecord(content); return;
    }
    if (action === "delete-template") {
      const template = appData.dailyTemplates.find(item => item.id === button.dataset.templateId);
      if (!template || !confirm(`「${template.name}」を削除する？`)) return;
      appData.dailyTemplates = appData.dailyTemplates.filter(item => item.id !== template.id);
      if (dailyTemplateDraft?.id === template.id) dailyTemplateDraft = null;
      saveData(); renderDailyRecord(content); return;
    }
    if (action === "add-template-entry") { dailyTemplateEntryFormOpen = true; dailyTemplateEntryEditingId = ""; renderDailyRecord(content); return; }
    if (action === "edit-template-entry") { dailyTemplateEntryEditingId = button.dataset.entryId; dailyTemplateEntryFormOpen = true; renderDailyRecord(content); return; }
    if (action === "delete-template-entry") {
      if (!dailyTemplateDraft) return;
      dailyTemplateDraft.entries = dailyTemplateDraft.entries.filter(item => item.id !== button.dataset.entryId);
      renderDailyRecord(content); return;
    }
    if (action === "cancel-template-entry") { dailyTemplateEntryFormOpen = false; dailyTemplateEntryEditingId = ""; renderDailyRecord(content); return; }
    if (action === "close-template-editor") { dailyTemplateDraft = null; dailyTemplateEntryFormOpen = false; dailyTemplateEntryEditingId = ""; renderDailyRecord(content); return; }
    if (action === "save-template") {
      if (!dailyTemplateDraft) return;
      const name = document.getElementById("daily-template-name").value.trim();
      if (!name) return alert("テンプレート名を入力してな。");
      const duplicate = appData.dailyTemplates.some(item => item.id !== dailyTemplateDraft.id && item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return alert("同じ名前のテンプレートがあるで。");
      dailyTemplateDraft.name = name;
      if (dailyTemplateDraft.id) {
        const index = appData.dailyTemplates.findIndex(item => item.id === dailyTemplateDraft.id);
        if (index >= 0) appData.dailyTemplates[index] = dailyTemplateDraft;
      } else {
        dailyTemplateDraft.id = dailyMakeId("template");
        appData.dailyTemplates.push(dailyTemplateDraft);
      }
      dailyTemplateDraft = null; dailyTemplateEntryFormOpen = false; dailyTemplateEntryEditingId = "";
      saveData(); renderDailyRecord(content);
    }
  }));

  const addTagForm = document.getElementById("daily-tag-add-form");
  if (addTagForm) addTagForm.addEventListener("submit", event => {
    event.preventDefault();
    const name = document.getElementById("daily-tag-new-name").value.trim();
    if (!name) return;
    if (appData.dailyTags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) return alert("同じ名前のタグがあるで。");
    appData.dailyTags.push({ id: dailyMakeId("tag"), name, color: dailySafeColor(document.getElementById("daily-tag-new-color").value) });
    saveData(); renderDailyRecord(content);
  });
  content.querySelectorAll(".daily-tag-row [data-action='save-tag']").forEach(button => button.addEventListener("click", () => {
    const row = button.closest(".daily-tag-row");
    const tag = appData.dailyTags.find(item => item.id === row.dataset.tagId);
    if (!tag) return;
    const name = row.querySelector(".daily-tag-edit-name").value.trim();
    if (!name) return alert("タグ名を入力してな。");
    if (appData.dailyTags.some(item => item.id !== tag.id && item.name.toLowerCase() === name.toLowerCase())) return alert("同じ名前のタグがあるで。");
    tag.name = name; tag.color = dailySafeColor(row.querySelector(".daily-tag-edit-color").value);
    saveData(); renderDailyRecord(content);
  }));
  content.querySelectorAll(".daily-tag-row [data-action='delete-tag']").forEach(button => button.addEventListener("click", () => {
    const row = button.closest(".daily-tag-row");
    const tag = appData.dailyTags.find(item => item.id === row.dataset.tagId);
    if (!tag || !confirm(`タグ「${tag.name}」を削除する？\n過去の記録やテンプレートには登録当時のタグ名と色が残るで。`)) return;
    appData.dailyTags = appData.dailyTags.filter(item => item.id !== tag.id);
    saveData(); renderDailyRecord(content);
  }));

  const templateEntryForm = document.getElementById("daily-template-entry-form");
  if (templateEntryForm) templateEntryForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!dailyTemplateDraft) return;
    const start = dailyTimeToMinutes(document.getElementById("daily-template-entry-start").value);
    let end = dailyTimeToMinutes(document.getElementById("daily-template-entry-end").value, true);
    if (start === 0 && end === 0) end = 1440;
    const tagId = document.getElementById("daily-template-entry-tag").value;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end === start) return alert("時刻を選択してな。終了が開始より早い場合は翌日扱いになるで。");
    const candidate = { start, end };
    if (dailyTemplateDraft.entries.some(item => item.id !== dailyTemplateEntryEditingId && dailyEntriesOverlap(candidate, dailyNormalizeEntry(item)))) return alert("テンプレート内のほかの予定と時間が重なってるで。");
    if (!appData.dailyTags.some(tag => tag.id === tagId)) return alert("タグを選択してな。");
    const snapshot = dailyTagSnapshot(tagId);
    if (dailyTemplateEntryEditingId) {
      dailyTemplateDraft.entries = dailyTemplateDraft.entries.map(item => item.id === dailyTemplateEntryEditingId ? { id: item.id, start, end, ...snapshot } : item);
    } else {
      dailyTemplateDraft.entries.push({ id: dailyMakeId("template_activity"), start, end, ...snapshot });
    }
    dailyTemplateDraft.entries.sort((a, b) => a.start - b.start);
    dailyTemplateEntryFormOpen = false; dailyTemplateEntryEditingId = ""; renderDailyRecord(content);
  });
}

function dailyRenderHistory(content) {
  const dates = Object.keys(appData.dailyRecords || {})
    .filter(date => appData.dailyRecords[date] && Array.isArray(appData.dailyRecords[date].entries) && appData.dailyRecords[date].entries.length > 0)
    .sort((a, b) => b.localeCompare(a));
  content.innerHTML = `
    <div class="daily-record-card daily-history-page">
      <button type="button" class="secondary-button daily-back-button" data-action="back-to-daily-main">‹ 1日の記録に戻る</button>
      <div class="daily-history-grid">
        ${dates.length ? dates.map(date => {
          const record = appData.dailyRecords[date];
          return `<button type="button" class="daily-history-chart-button" data-history-date="${escapeHTML(date)}" aria-label="${escapeHTML(formatDate(parseDate(date)))}の記録を開く"><span class="daily-history-chart">${dailyRenderClock(record.entries, date, "daily-history-clock-wrap")}</span><span class="daily-history-note"><strong>ひとこと</strong><span>${escapeHTML(record.note || "（コメントなし）")}</span></span></button>`;
        }).join("") : `<p class="muted daily-history-empty">過去の記録はまだありません。</p>`}
      </div>
    </div>`;
  content.querySelector("[data-action='back-to-daily-main']")?.addEventListener("click", () => { dailyRecordView = "main"; renderDailyRecord(content); });
  content.querySelectorAll("[data-history-date]").forEach(button => button.addEventListener("click", () => {
    dailyRecordDate = button.dataset.historyDate;
    dailyRecordView = "main";
    dailyEntryFormState = null;
    renderDailyRecord(content);
  }));
}

function renderDailyRecord(content) {
  ensureDailyRecordData();
  if (dailyRecordView === "settings") return dailyRenderSettings(content);
  if (dailyRecordView === "history") return dailyRenderHistory(content);

  const record = appData.dailyRecords[dailyRecordDate] || { note: "", entries: [] };
  const entries = (Array.isArray(record.entries) ? record.entries : []).map(dailyNormalizeEntry).filter(Boolean).sort((a, b) => a.start - b.start);
  const selectedTemplate = appData.dailyTemplates.find(item => item.id === dailySelectedTemplateId);
  const addStart = dailyEntryFormState?.mode === "add" ? dailyEntryFormState.start : dailyMinutesToTime(Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 5) * 5);

  content.innerHTML = `
    <div class="card daily-record-card daily-record-main">
      <div class="daily-date-toolbar"><h2 class="card-title">1日の記録</h2><div class="daily-date-actions"><input id="daily-record-date" type="date" value="${escapeHTML(dailyRecordDate)}" aria-label="記録する日付"><button type="button" class="secondary-button daily-today-button" data-action="back-to-today">今日に戻る</button></div></div>
      <button type="button" class="secondary-button daily-template-use-button" data-action="toggle-template-panel">テンプレートを使う</button>
      ${dailyTemplatePanelOpen ? `<div class="daily-template-panel">
        <label>テンプレート<select id="daily-template-select"><option value="">テンプレートを選択</option>${appData.dailyTemplates.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === dailySelectedTemplateId ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select></label>
        <button type="button" class="primary-button" data-action="apply-template" ${appData.dailyTemplates.length ? "" : "disabled"}>この日の予定に適用</button>
      </div>` : ""}
      <section class="daily-clock-section">
        <h3 class="card-title">24時間タイムチャート</h3>
        <p class="muted">0時が上、12時が下。空白部分をタップすると追加、色の付いた部分をタップすると編集できるよ。</p>
        ${dailyRenderClock(entries, dailyRecordDate)}
        ${dailyRenderBreakdown(entries)}
      </section>
      <section class="daily-entry-editor-slot">
        ${dailyEntryFormState ? dailyRenderEntryForm(dailyEntryFormState.mode, entries.find(item => item.id === dailyEntryFormState.entryId), dailyEntryFormState.start || addStart) : ""}
      </section>
      <section class="daily-note-section">
        <form id="daily-note-form">
          <label for="daily-record-note">ひとこと</label>
          <textarea id="daily-record-note" rows="3" placeholder="今日の振り返りなど">${escapeHTML(record.note || "")}</textarea>
          <button type="submit" class="secondary-button">ひとことを保存</button>
        </form>
      </section>
      <section class="daily-entries-section">
        <div class="daily-section-heading"><h3 class="card-title">登録済みの予定</h3><span class="daily-entry-count">${entries.length}件</span></div>
        ${entries.length ? `<div class="daily-entry-list">${entries.map(entry => `<button type="button" class="daily-entry-list-item" data-action="edit-entry" data-entry-id="${escapeHTML(entry.id)}"><span class="daily-entry-color" style="background:${dailySafeColor(entry.tagColor)}"></span><span class="daily-entry-list-main"><strong>${escapeHTML(entry.tagName)}</strong><small>${dailyEntryDateRange(entry.start, entry.end, dailyRecordDate)}</small></span><span class="daily-entry-duration">${dailyFormatDuration(dailyEntryDuration(entry))}</span><span class="daily-entry-chevron">›</span></button>`).join("")}</div>` : `<p class="muted daily-empty-message">まだ予定がありません。円グラフの空白部分からも追加できるよ。</p>`}
        <button type="button" class="primary-button daily-add-entry-button" data-action="open-add-entry">＋ 予定を追加</button>
      </section>
      <button type="button" class="secondary-button daily-past-data-button" data-action="open-daily-history">過去のデータ</button>
      <button type="button" class="secondary-button daily-settings-button" data-action="open-daily-settings">設定</button>
    </div>`;

  const templateSelect = document.getElementById("daily-template-select");
  if (templateSelect) templateSelect.addEventListener("change", event => { dailySelectedTemplateId = event.target.value; });
  document.getElementById("daily-record-date").addEventListener("change", event => {
    if (!event.target.value) return;
    dailyRecordDate = event.target.value; dailyEntryFormState = null; renderDailyRecord(content);
  });

  content.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "toggle-template-panel") { dailyTemplatePanelOpen = !dailyTemplatePanelOpen; renderDailyRecord(content); return; }
    if (action === "open-daily-settings") { dailyRecordView = "settings"; dailyTemplateDraft = null; renderDailyRecord(content); return; }
    if (action === "open-daily-history") { dailyRecordView = "history"; renderDailyRecord(content); return; }
    if (action === "back-to-today") { dailyRecordDate = todayString(); dailyEntryFormState = null; renderDailyRecord(content); return; }
    if (action === "apply-template") {
      const id = dailySelectedTemplateId || document.getElementById("daily-template-select")?.value;
      const template = appData.dailyTemplates.find(item => item.id === id);
      if (!template) return alert("テンプレートを選択してな。");
      const target = dailyGetRecord();
      if (target.entries.length && !confirm("この日の既存の予定をすべて削除して、テンプレートの内容に置き換える？")) return;
      target.entries = (template.entries || []).map(item => ({ ...item, id: dailyMakeId("activity") }));
      dailyEntryFormState = null; saveData(); renderDailyRecord(content); return;
    }
    if (action === "open-add-entry") {
      const start = dailyMinutesToTime(Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 5) * 5);
      dailyEntryFormState = { mode: "add", start }; renderDailyRecord(content);
      document.getElementById("daily-entry-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
    }
    if (action === "edit-entry") {
      const entry = entries.find(item => item.id === button.dataset.entryId);
      if (!entry) return;
      dailyEntryFormState = { mode: "edit", entryId: entry.id, start: dailyMinutesToTime(entry.start) };
      renderDailyRecord(content); document.getElementById("daily-entry-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
    }
    if (action === "close-entry-form") { dailyEntryFormState = null; renderDailyRecord(content); return; }
    if (action === "delete-current-entry") {
      if (!dailyEntryFormState?.entryId || !confirm("この予定を削除する？")) return;
      const target = dailyGetRecord(); target.entries = target.entries.filter(item => item.id !== dailyEntryFormState.entryId);
      dailyEntryFormState = null; saveData(); renderDailyRecord(content); return;
    }
  }));

  const clock = content.querySelector(".daily-clock");
  if (clock) clock.addEventListener("click", event => {
    const rect = clock.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const radius = Math.sqrt(dx * dx + dy * dy);
    const normalizedRadius = radius / (Math.min(rect.width, rect.height) / 2);
    if (normalizedRadius < 0.30 || normalizedRadius > 1.02) return;
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
    const minute = Math.floor(angle / 360 * 1440);
    const occupied = entries.flatMap(entry => dailyEntrySegments(entry)).sort((a, b) => a.start - b.start);
    const hitSegment = occupied.find(segment => minute >= segment.start && minute < segment.end);
    if (hitSegment) {
      const hit = hitSegment.entry;
      dailyEntryFormState = { mode: "edit", entryId: hit.id, start: dailyMinutesToTime(hit.start), end: dailyMinutesToTime(hit.end) };
    } else {
      let gapStart = 0, gapEnd = 1440;
      if (occupied.length) {
        const previous = [...occupied].reverse().find(segment => segment.end <= minute);
        const next = occupied.find(segment => segment.start > minute);
        if (previous && next) { gapStart = previous.end; gapEnd = next.start; }
        else { gapStart = occupied[occupied.length - 1].end; gapEnd = occupied[0].start; }
      }
      dailyEntryFormState = { mode: "add", start: dailyMinutesToTime(gapStart), end: dailyMinutesToTime(gapEnd) };
    }
    renderDailyRecord(content);
    document.getElementById("daily-entry-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  const entryForm = document.getElementById("daily-entry-form");
  if (entryForm) {
    const updateEntryDateRange = () => {
      const start = dailyTimeToMinutes(document.getElementById("daily-entry-start").value);
      const end = dailyTimeToMinutes(document.getElementById("daily-entry-end").value, true);
      const label = document.getElementById("daily-entry-date-range");
      if (label && Number.isFinite(start) && Number.isFinite(end)) {
        label.textContent = dailyEntryDateRange(start, end, dailyRecordDate);
      }
    };
    document.getElementById("daily-entry-start").addEventListener("change", updateEntryDateRange);
    document.getElementById("daily-entry-end").addEventListener("change", updateEntryDateRange);
    entryForm.addEventListener("submit", event => {
    event.preventDefault();
    const start = dailyTimeToMinutes(document.getElementById("daily-entry-start").value);
    let end = dailyTimeToMinutes(document.getElementById("daily-entry-end").value, true);
    if (start === 0 && end === 0) end = 1440;
    const tagId = document.getElementById("daily-entry-tag").value;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end === start) return alert("時刻を選択してな。終了が開始より早い場合は翌日扱いになるで。");
    const candidate = { start, end };
    if (entries.some(item => item.id !== dailyEntryFormState?.entryId && dailyEntriesOverlap(candidate, item))) return alert("ほかの予定と時間が重なってるで。時間を調整してな。");
    if (!appData.dailyTags.some(tag => tag.id === tagId)) return alert("タグを選択してな。");
    const snapshot = dailyTagSnapshot(tagId);
    const target = dailyGetRecord();
    const startDate = end < start ? dailyDateOffset(dailyRecordDate, -1) : dailyRecordDate;
    const endDate = dailyRecordDate;
    if (dailyEntryFormState?.mode === "edit") {
      target.entries = target.entries.map(item => item.id === dailyEntryFormState.entryId
        ? { id: item.id, start, end, startDate, endDate, ...snapshot }
        : item);
    } else {
      target.entries.push({ id: dailyMakeId("activity"), start, end, startDate, endDate, ...snapshot });
    }
    target.entries.sort((a, b) => a.start - b.start);
    dailyEntryFormState = null; saveData(); renderDailyRecord(content);
    });
  }

  const noteForm = document.getElementById("daily-note-form");
  noteForm.addEventListener("submit", event => {
    event.preventDefault();
    const target = dailyGetRecord();
    target.note = document.getElementById("daily-record-note").value.trim();
    saveData();
    const saveButton = noteForm.querySelector("button[type='submit']");
    saveButton.textContent = "保存しました";
    setTimeout(() => { if (saveButton.isConnected) saveButton.textContent = "ひとことを保存"; }, 1400);
  });
}
function clearDailyRecord() {
  if (!appData.dailyRecords || !appData.dailyRecords[dailyRecordDate]) return;
  if (!confirm(`${formatDate(parseDate(dailyRecordDate))}の記録を削除しますか？`)) return;
  delete appData.dailyRecords[dailyRecordDate];
  dailyEntryFormState = null; saveData(); renderDailyRecord(document.getElementById("page-content"));
}
