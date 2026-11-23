// Study 通知設定・Web Push登録
const STUDY_VAPID_PUBLIC_KEY = "BI6VGiGSLRTdlFeNGkahyotG1WL9r_L9JUebgKMJkAmhBA_cgsmXDcoatInYbgLnqDUVAUnX0geYdMd6hm_UNqw";
const STUDY_NOTIFICATION_TYPES = {
  timetableToday: "今日の時間割",
  timetableTomorrow: "明日の時間割",
  eventsToday: "今日の予定",
  eventsTomorrow: "明日の予定",
  tasksToday: "今日提出の課題",
  upcomingTasks: "今後提出の課題"
};
function makeNotificationId() { return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function defaultNotificationSettings() {
  return { enabled:false, schedules:[], taskReminderDays:[7,6,5,4,3,2,1,0], messages:{
    timetableToday:{title:"今日の時間割",body:"今日の授業を確認しましょう。"},
    timetableTomorrow:{title:"明日の時間割",body:"明日の授業を確認しましょう。"},
    eventsToday:{title:"今日の予定",body:"今日の予定を確認しましょう。"},
    eventsTomorrow:{title:"明日の予定",body:"明日の予定を確認しましょう。"},
    tasksToday:{title:"今日提出の課題",body:"今日が提出期限の課題があります。"},
    upcomingTasks:{title:"今後提出の課題",body:"提出期限が近づいている課題があります。"}
  }};
}
function normalizeNotificationSettings(value) {
  const d=defaultNotificationSettings(), s=value&&typeof value==="object"?value:{};
  let schedules=Array.isArray(s.schedules)?s.schedules.filter(x=>x&&STUDY_NOTIFICATION_TYPES[x.type]).map(x=>({id:String(x.id||makeNotificationId()),type:x.type,time:/^([01]\d|2[0-3]):[0-5][0-9]$/.test(x.time||"")?x.time:"06:00",enabled:x.enabled!==false})) : null;
  if(!schedules){
    schedules=[]; const old=s.daily||{}; const time=/^([01]\d|2[0-3]):[0-5][0-9]$/.test(s.dailyTime||"")?s.dailyTime:"06:00";
    if(old.timetable!==false) schedules.push({id:makeNotificationId(),type:"timetableToday",time,enabled:true});
    if(old.events!==false) schedules.push({id:makeNotificationId(),type:"eventsToday",time,enabled:true});
    if(old.tasks!==false) schedules.push({id:makeNotificationId(),type:"tasksToday",time,enabled:true});
    // 旧設定の課題リマインドは毎日1回の通知として引き継ぐ
    if(Array.isArray(s.taskReminderDays)&&s.taskReminderDays.length) schedules.push({id:makeNotificationId(),type:"upcomingTasks",time,enabled:true});
  }
  const messages={}; for(const [k,v] of Object.entries(d.messages)) messages[k]={...v,...((s.messages||{})[k]||{})};
  return {...d,...s,schedules,taskReminderDays:Array.isArray(s.taskReminderDays)?s.taskReminderDays.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=7):d.taskReminderDays,messages};
}
function renderNotifications(content) {
  const settings=normalizeNotificationSettings(appData.notificationSettings); appData.notificationSettings=settings;
  const schedulesHTML=settings.schedules.map(item=>`<div class="notification-schedule-row" data-schedule-id="${escapeHTML(item.id)}" data-schedule-type="${item.type}">
    <div class="notification-schedule-head"><strong>${escapeHTML(STUDY_NOTIFICATION_TYPES[item.type])}</strong><label class="notification-switch"><input type="checkbox" data-schedule-enabled ${item.enabled?"checked":""}><span>ON</span></label></div>
    <div class="notification-schedule-controls"><label>通知時刻 <input type="time" data-schedule-time value="${escapeHTML(item.time)}" step="300"></label><button type="button" class="secondary-button" data-schedule-remove>削除</button></div>
  </div>`).join("");
  const days=[7,6,5,4,3,2,1,0];
  content.innerHTML=`<div class="card notification-settings-card"><h2 class="card-title">通知設定</h2>
    <p class="muted">通知の種類ごとに、受け取る時刻を複数登録できます。設定はアカウントに同期されます。</p>
    <div class="notification-permission-row"><div><strong>この端末の通知</strong><div id="notification-device-status" class="muted">確認中…</div></div><button type="button" class="primary-button" id="notification-enable-button">この端末で通知を有効にする</button></div>
    <div class="notification-permission-row"><div><strong>通知設定全体</strong><div class="muted">全ての通知を一括で停止できます。</div></div><label class="notification-switch"><input type="checkbox" id="notification-master" ${settings.enabled?"checked":""}><span>ON</span></label></div>
    <div class="notification-setting-block"><h3>通知スケジュール</h3><div id="notification-schedule-list">${schedulesHTML||'<p class="muted">通知はまだ登録されていません。「通知を追加」から登録してください。</p>'}</div>
      <div class="notification-add-row"><select id="notification-add-type" aria-label="追加する通知の種類">${Object.entries(STUDY_NOTIFICATION_TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select><button type="button" class="secondary-button" id="notification-add-button">＋ 通知を追加</button></div>
      <p class="muted small-note">時刻は5分刻みで設定できます。GitHub Actionsは5分ごとに確認するため、実際の配信は数分遅れる場合があります。</p>
    </div>
    <div class="notification-setting-block"><h3>今後提出の課題</h3><p class="muted">提出期限の何日前に通知するか、日ごとに設定できます。</p><div class="notification-days-grid">${days.map(day=>`<label><input type="checkbox" data-reminder-day="${day}" ${settings.taskReminderDays.includes(day)?"checked":""}><span>${day===0?"当日":`${day}日前`}</span></label>`).join("")}</div></div>
    <div class="notification-setting-block"><h3>通知内容</h3>${Object.entries(STUDY_NOTIFICATION_TYPES).map(([key,label])=>`<div class="notification-message-editor"><strong>${label}</strong><label>タイトル<input type="text" maxlength="80" data-message-key="${key}" data-message-field="title" value="${escapeHTML(settings.messages[key].title)}"></label><label>本文<input type="text" maxlength="180" data-message-key="${key}" data-message-field="body" value="${escapeHTML(settings.messages[key].body)}"></label></div>`).join("")}</div>
    <div class="notification-save-row"><button type="button" class="primary-button" id="notification-save-button">通知設定を保存</button><span id="notification-save-status" class="muted" aria-live="polite"></span></div></div>`;
  refreshNotificationDeviceStatus();
  document.getElementById("notification-enable-button").addEventListener("click",enableStudyNotifications);
  document.getElementById("notification-add-button").addEventListener("click",()=>{const type=document.getElementById("notification-add-type").value;const list=document.getElementById("notification-schedule-list");const empty=list.querySelector("p");if(empty)empty.remove();const row=document.createElement("div");row.className="notification-schedule-row";row.dataset.scheduleId=makeNotificationId();row.dataset.scheduleType=type;row.innerHTML=`<div class="notification-schedule-head"><strong>${escapeHTML(STUDY_NOTIFICATION_TYPES[type])}</strong><label class="notification-switch"><input type="checkbox" data-schedule-enabled checked><span>ON</span></label></div><div class="notification-schedule-controls"><label>通知時刻 <input type="time" data-schedule-time value="06:00" step="300"></label><button type="button" class="secondary-button" data-schedule-remove>削除</button></div>`;list.appendChild(row);});
  document.getElementById("notification-schedule-list").addEventListener("click",e=>{const b=e.target.closest("[data-schedule-remove]");if(b)b.closest("[data-schedule-id]").remove();});
  document.getElementById("notification-save-button").addEventListener("click",saveNotificationSettings);
}
async function refreshNotificationDeviceStatus(){const status=document.getElementById("notification-device-status");if(!status)return;if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window)){status.textContent="このブラウザはWeb Pushに対応していません。";return;}if(Notification.permission==="denied"){status.textContent="通知がブラウザ設定で拒否されています。端末の設定から許可してください。";return;}try{const reg=await navigator.serviceWorker.ready;status.textContent=await reg.pushManager.getSubscription()?"この端末は通知を受け取れる状態です。":"この端末はまだ通知登録されていません。";}catch(_){status.textContent="通知状態を確認できませんでした。";}}
function urlBase64ToUint8Array(value){const padding="=".repeat((4-value.length%4)%4);const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}
async function studySubscriptionKey(endpoint){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(endpoint));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");}
async function enableStudyNotifications(){if(!cloudUser||!firebaseDatabase){alert("ログイン状態を確認できません。再読み込みしてからお試しください。");return;}if(location.protocol!=="https:"&&location.hostname!=="localhost"){alert("通知にはHTTPS接続が必要です。");return;}if(window.matchMedia&&!window.matchMedia("(display-mode: standalone)").matches&&!window.navigator.standalone){alert("iPhone・iPadでは、Studyをホーム画面に追加して、ホーム画面のアイコンから起動してから通知を有効にしてください。");return;}if(!("PushManager"in window)||!("Notification"in window)){alert("このブラウザはWeb Pushに対応していません。");return;}try{const permission=await Notification.requestPermission();if(permission!=="granted"){alert("通知が許可されませんでした。端末の設定を確認してください。");return;}const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(STUDY_VAPID_PUBLIC_KEY)});const key=await studySubscriptionKey(sub.endpoint);await firebaseDatabase.ref(`studyPushSubscriptions/${cloudUser.uid}/${key}`).set(sub.toJSON());await refreshNotificationDeviceStatus();alert("この端末の通知登録が完了しました！");}catch(error){console.error("通知登録エラー:",error&&{name:error.name,code:error.code,message:error.message});const detail=error&&error.code==="PERMISSION_DENIED"?"Firebaseのデータベースルールで通知登録先への書き込みが許可されていません。":error&&error.name==="NotAllowedError"?"端末またはブラウザで通知が許可されていません。":error&&error.name==="InvalidAccessError"?"通知用の公開鍵が無効です。":"通信状態、ログイン状態、Firebaseの設定を確認してください。";alert(`通知登録に失敗しました。\n${detail}`);}}
function saveNotificationSettings(){const settings=normalizeNotificationSettings(appData.notificationSettings);settings.enabled=document.getElementById("notification-master").checked;settings.schedules=Array.from(document.querySelectorAll("#notification-schedule-list [data-schedule-id]")).map(row=>({id:row.dataset.scheduleId,type:row.dataset.scheduleType,time:row.querySelector("[data-schedule-time]").value,enabled:row.querySelector("[data-schedule-enabled]").checked})).filter(x=>x.type&&/^([01]\d|2[0-3]):([0-5][05])$/.test(x.time));
  settings.taskReminderDays=Array.from(document.querySelectorAll("[data-reminder-day]:checked")).map(x=>Number(x.dataset.reminderDay)).sort((a,b)=>b-a);
  document.querySelectorAll("[data-message-key]").forEach(input=>{settings.messages[input.dataset.messageKey][input.dataset.messageField]=input.value.trim();});
  appData.notificationSettings=settings;saveData();const status=document.getElementById("notification-save-status");if(status)status.textContent="保存しました。";
}
