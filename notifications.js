// Study 通知設定・Web Push登録
// 通知設定は既存のStudyデータと一緒にFirebase Realtime Databaseへ同期する。
const STUDY_VAPID_PUBLIC_KEY = "BCY7pLNdRm0hz8FeBorOGe9cwYs5K2s6ZLIz6lsLkotj4Zztm7yNu9ybjUeEg-JXvST-oUe-Wo0iEZ4W35h-jLw";

function defaultNotificationSettings() {
  return {
    enabled: false,
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
  const dailyLabels = { timetable: "今日の時間割", events: "今日の予定", tasks: "今日提出の課題" };
  const messageFields = [
    ["timetable", "今日の時間割"], ["events", "今日の予定"],
    ["tasks", "今日提出の課題"], ["taskReminder", "これからの課題"]
  ];
  content.innerHTML = `
    <div class="card notification-settings-card">
      <h2 class="card-title">通知設定</h2>
      <p class="muted">通知を受け取る端末ごとに、ホーム画面へ追加したStudyで通知を許可してください。設定はアカウントに同期されます。</p>
      <div class="notification-permission-row">
        <div><strong>この端末の通知</strong><div id="notification-device-status" class="muted">確認中…</div></div>
        <button type="button" class="primary-button" id="notification-enable-button">この端末で通知を有効にする</button>
      </div>
      <div class="notification-permission-row">
        <div><strong>通知設定全体</strong><div class="muted">全ての通知を一括で停止できます。</div></div>
        <label class="notification-switch"><input type="checkbox" id="notification-master" ${settings.enabled ? "checked" : ""}><span>ON</span></label>
      </div>
      <div class="notification-setting-block">
        <h3>毎日の通知</h3>
        <label class="notification-time-label">通知時刻 <input type="time" id="notification-daily-time" value="${escapeHTML(settings.dailyTime)}" step="3600"></label>
        <p class="muted small-note">時刻は日本時間・1時間単位です。通常は設定した時刻の約7分後に確認・配信します。GitHub側の実行遅延により、さらに遅れる場合があります。</p>
        ${Object.entries(dailyLabels).map(([key, label]) => `
          <label class="notification-check-row"><input type="checkbox" data-daily-key="${key}" ${settings.daily[key] ? "checked" : ""}><span>${label}</span></label>
        `).join("")}
      </div>
      <div class="notification-setting-block">
        <h3>これからの課題</h3>
        <p class="muted">提出期限の何日前に通知するか、日ごとに設定できます。</p>
        <div class="notification-days-grid">
          ${days.map(day => `<label><input type="checkbox" data-reminder-day="${day}" ${settings.taskReminderDays.includes(day) ? "checked" : ""}><span>${day === 0 ? "当日" : `${day}日前`}</span></label>`).join("")}
        </div>
      </div>
      <div class="notification-setting-block">
        <h3>通知内容</h3>
        ${messageFields.map(([key, label]) => `
          <div class="notification-message-editor">
            <strong>${label}</strong>
            <label>タイトル<input type="text" maxlength="80" data-message-key="${key}" data-message-field="title" value="${escapeHTML(settings.messages[key].title)}"></label>
            <label>本文<input type="text" maxlength="180" data-message-key="${key}" data-message-field="body" value="${escapeHTML(settings.messages[key].body)}"></label>
          </div>
        `).join("")}
      </div>
      <div class="notification-save-row"><button type="button" class="primary-button" id="notification-save-button">通知設定を保存</button><span id="notification-save-status" class="muted" aria-live="polite"></span></div>
    </div>`;

  refreshNotificationDeviceStatus();
  document.getElementById("notification-enable-button").addEventListener("click", enableStudyNotifications);
  document.getElementById("notification-save-button").addEventListener("click", saveNotificationSettings);
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
    console.error("通知登録エラー", error);
    alert("通知登録に失敗しました。通信状態とFirebaseのデータベースルールを確認してください。");
  }
}

function saveNotificationSettings() {
  const settings = normalizeNotificationSettings(appData.notificationSettings);
  settings.enabled = document.getElementById("notification-master").checked;
  settings.dailyTime = document.getElementById("notification-daily-time").value || "06:00";
  if (!/^([01]\d|2[0-3]):00$/.test(settings.dailyTime)) { alert("通知時刻は1時間単位で設定してください。"); return; }
  document.querySelectorAll("[data-daily-key]").forEach(input => {
    settings.daily[input.dataset.dailyKey] = input.checked;
  });
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
