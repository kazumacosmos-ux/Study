// Study 通知設定・Web Push登録
// 通知設定は既存のStudyデータと一緒にFirebase Realtime Databaseへ同期する。
const STUDY_VAPID_PUBLIC_KEY = "BI6VGiGSLRTdlFeNGkahyotG1WL9r_L9JUebgKMJkAmhBA_cgsmXDcoatInYbgLnqDUVAUnX0geYdMd6hm_UNqw";

function defaultNotificationSettings() {
  return {
    enabled: false,
    selectedTypes: ["timetable", "events", "tasks"],
    dailyTime: "06:00",
    daily: { timetable: true, events: true, tasks: true },
    taskReminderDays: [7, 6, 5, 4, 3, 2, 1, 0],
    messages: {
      timetable: { title: "今日の時間割", body: "今日の授業を確認しましょう。" },
      events: { title: "今日の予定", body: "今日の予定を確認しましょう。" },
      tasks: { title: "今日提出の課題", body: "今日が提出期限の課題があります。" },
      taskReminder: { title: "課題の提出リマインド", body: "提出期限が近づいている課題があります。" }
    }
  };
}

function normalizeNotificationSettings(value) {
  const defaults = defaultNotificationSettings();
  const source = value && typeof value === "object" ? value : {};
  return {
    ...defaults,
    ...source,
    dailyTime: /^([01]\d|2[0-3]):00$/.test(source.dailyTime || "") ? source.dailyTime : defaults.dailyTime,
    daily: { ...defaults.daily, ...(source.daily || {}) },
    selectedTypes: Array.isArray(source.selectedTypes)
      ? [...new Set(source.selectedTypes.filter(key => ["timetable", "events", "tasks", "taskReminder"].includes(key)))]
      : ["timetable", "events", "tasks", ...(Array.isArray(source.taskReminderDays) && source.taskReminderDays.length ? ["taskReminder"] : [])],
    taskReminderDays: Array.isArray(source.taskReminderDays)
      ? source.taskReminderDays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 7)
      : defaults.taskReminderDays,
    messages: Object.fromEntries(Object.keys(defaults.messages).map(key => [
      key, { ...defaults.messages[key], ...((source.messages || {})[key] || {}) }
    ]))
  };
}

function renderNotifications(content) {
  const settings = normalizeNotificationSettings(appData.notificationSettings);
  appData.notificationSettings = settings;
  const days = [7, 6, 5, 4, 3, 2, 1, 0];
  const typeLabels = {
    timetable: "時間割",
    events: "今日の予定",
    tasks: "今日提出の課題",
    taskReminder: "今後提出の課題"
  };
  const messageFields = [
    ["timetable", "時間割"], ["events", "今日の予定"],
    ["tasks", "今日提出の課題"], ["taskReminder", "今後提出の課題"]
  ];
  const available = Object.keys(typeLabels).filter(key => !settings.selectedTypes.includes(key));
  content.innerHTML = `
    <div class="card notification-settings-card">
      <h2 class="card-title">通知設定</h2>
      <p class="muted">受け取りたい通知を選んで追加できます。設定はアカウントに同期されます。</p>
      <div class="notification-permission-row">
        <div><strong>この端末の通知</strong><div id="notification-device-status" class="muted">確認中…</div></div>
        <button type="button" class="primary-button" id="notification-enable-button">この端末で通知を有効にする</button>
      </div>
      <div class="notification-permission-row">
        <div><strong>通知設定全体</strong><div class="muted">全ての通知を一括で停止できます。</div></div>
        <label class="notification-switch"><input type="checkbox" id="notification-master" ${settings.enabled ? "checked" : ""}><span>ON</span></label>
      </div>
      <div class="notification-setting-block">
        <h3>受け取る通知</h3>
        <div id="notification-selected-list">
          ${settings.selectedTypes.map(key => `
            <div class="notification-selected-item">
              <label class="notification-check-row"><input type="checkbox" data-type-enabled="${key}" checked><span>${typeLabels[key]}</span></label>
              <button type="button" class="notification-remove-button" data-remove-type="${key}" aria-label="${typeLabels[key]}を一覧から削除">削除</button>
            </div>`).join("") || '<p class="muted">通知はまだ追加されていません。</p>'}
        </div>
        <div class="notification-add-row">
          <select id="notification-add-select" aria-label="追加する通知の種類">
            <option value="">追加する通知を選択</option>
            ${available.map(key => `<option value="${key}">${typeLabels[key]}</option>`).join("")}
          </select>
          <button type="button" class="secondary-button" id="notification-add-button" ${available.length ? "" : "disabled"}>＋ 通知を追加</button>
        </div>
      </div>
      <div class="notification-setting-block">
        <h3>通知時刻</h3>
        <label class="notification-time-label">毎日の通知時刻 <input type="time" id="notification-daily-time" value="${escapeHTML(settings.dailyTime)}" step="3600"></label>
        <p class="muted small-note">日本時間・1時間単位です。通常は設定時刻の約7分後に確認・配信します。</p>
      </div>
      <div class="notification-setting-block" id="notification-reminder-settings" ${settings.selectedTypes.includes("taskReminder") ? "" : "hidden"}>
        <h3>今後提出の課題の通知タイミング</h3>
        <p class="muted">提出期限の何日前に通知するか選べます。</p>
        <div class="notification-days-grid">
          ${days.map(day => `<label><input type="checkbox" data-reminder-day="${day}" ${settings.taskReminderDays.includes(day) ? "checked" : ""}><span>${day === 0 ? "当日" : `${day}日前`}</span></label>`).join("")}
        </div>
      </div>
      <div class="notification-setting-block">
        <h3>通知内容</h3>
        ${messageFields.filter(([key]) => settings.selectedTypes.includes(key)).map(([key, label]) => `
          <div class="notification-message-editor">
            <strong>${label}</strong>
            <label>タイトル<input type="text" maxlength="80" data-message-key="${key}" data-message-field="title" value="${escapeHTML(settings.messages[key].title)}"></label>
            <label>本文<input type="text" maxlength="180" data-message-key="${key}" data-message-field="body" value="${escapeHTML(settings.messages[key].body)}"></label>
          </div>`).join("")}
      </div>
      <div class="notification-save-row"><button type="button" class="primary-button" id="notification-save-button">通知設定を保存</button><span id="notification-save-status" class="muted" aria-live="polite"></span></div>
    </div>`;

  refreshNotificationDeviceStatus();
  document.getElementById("notification-enable-button").addEventListener("click", enableStudyNotifications);
  document.getElementById("notification-save-button").addEventListener("click", saveNotificationSettings);
  document.getElementById("notification-add-button").addEventListener("click", () => {
    const select = document.getElementById("notification-add-select");
    if (!select.value) return;
    const next = normalizeNotificationSettings(appData.notificationSettings);
    if (!next.selectedTypes.includes(select.value)) next.selectedTypes.push(select.value);
    appData.notificationSettings = next;
    renderNotifications(content);
  });
  document.querySelectorAll("[data-remove-type]").forEach(button => button.addEventListener("click", () => {
    const next = normalizeNotificationSettings(appData.notificationSettings);
    next.selectedTypes = next.selectedTypes.filter(key => key !== button.dataset.removeType);
    appData.notificationSettings = next;
    renderNotifications(content);
  }));
  document.querySelectorAll("[data-type-enabled]").forEach(input => input.addEventListener("change", () => {
    // 一覧のチェックは「この種類を受け取る」状態。保存時に反映する。
  }));
}
async function refreshNotificationDeviceStatus() {
  const status = document.getElementById("notification-device-status");
  if (!status) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    status.textContent = "このブラウザはWeb Pushに対応していません。";
    return;
  }
  if (Notification.permission === "denied") {
    status.textContent = "通知がブラウザ設定で拒否されています。端末の設定から許可してください。";
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    status.textContent = subscription ? "この端末は通知を受け取れる状態です。" : "この端末はまだ通知登録されていません。";
  } catch (error) {
    status.textContent = "通知状態を確認できませんでした。";
  }
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

async function studySubscriptionKey(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function enableStudyNotifications() {
  if (!cloudUser || !firebaseDatabase) {
    alert("ログイン状態を確認できません。再読み込みしてからお試しください。");
    return;
  }
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    alert("通知にはHTTPS接続が必要です。");
    return;
  }
  if (window.matchMedia && !window.matchMedia("(display-mode: standalone)").matches && !window.navigator.standalone) {
    alert("iPhone・iPadでは、Studyをホーム画面に追加して、ホーム画面のアイコンから起動してから通知を有効にしてください。");
    return;
  }
  if (!("PushManager" in window) || !("Notification" in window)) {
    alert("このブラウザはWeb Pushに対応していません。");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("通知が許可されませんでした。端末の設定を確認してください。");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(STUDY_VAPID_PUBLIC_KEY)
      });
    }
    const key = await studySubscriptionKey(subscription.endpoint);
    await firebaseDatabase.ref(`studyPushSubscriptions/${cloudUser.uid}/${key}`).set(subscription.toJSON());
    await refreshNotificationDeviceStatus();
    alert("この端末の通知登録が完了しました！");
  } catch (error) {
    console.error("通知登録エラー:", error && { name: error.name, code: error.code, message: error.message });
    const detail = error && error.code === "PERMISSION_DENIED"
      ? "Firebaseのデータベースルールで、このユーザーの通知登録先への書き込みが許可されていません。"
      : error && error.name === "NotAllowedError"
        ? "端末またはブラウザで通知が許可されていません。"
        : error && error.name === "InvalidAccessError"
          ? "通知用の公開鍵が無効です。最新版のStudyファイルが公開されているか確認してください。"
          : error && error.message
            ? `エラー詳細：${error.message}`
            : "通信状態、ログイン状態、Firebaseの設定を確認してください。";
    alert(`通知登録に失敗しました。\n${detail}`);
  }
}

function saveNotificationSettings() {
  const settings = normalizeNotificationSettings(appData.notificationSettings);
  settings.enabled = document.getElementById("notification-master").checked;
  settings.dailyTime = document.getElementById("notification-daily-time").value || "06:00";
  if (!/^([01]\d|2[0-3]):00$/.test(settings.dailyTime)) { alert("通知時刻は1時間単位で設定してください。"); return; }
  settings.selectedTypes = Array.from(document.querySelectorAll("[data-type-enabled]:checked")).map(input => input.dataset.typeEnabled);
  settings.daily.timetable = settings.selectedTypes.includes("timetable");
  settings.daily.events = settings.selectedTypes.includes("events");
  settings.daily.tasks = settings.selectedTypes.includes("tasks");
  settings.taskReminderDays = Array.from(document.querySelectorAll("[data-reminder-day]:checked"))
    .map(input => Number(input.dataset.reminderDay)).sort((a, b) => b - a);
  document.querySelectorAll("[data-message-key]").forEach(input => {
    settings.messages[input.dataset.messageKey][input.dataset.messageField] = input.value.trim();
  });
  appData.notificationSettings = settings;
  saveData();
  const status = document.getElementById("notification-save-status");
  if (status) status.textContent = "保存しました。";
}
