const admin = require('firebase-admin');
const webpush = require('web-push');
const crypto = require('crypto');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!serviceAccount.project_id || !serviceAccount.private_key) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT secret is missing or invalid.');
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://study-ecd4a-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:study-notifications@example.com';
if (!publicKey || !privateKey) throw new Error('VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secret is missing.');
webpush.setVapidDetails(subject, publicKey, privateKey);

const TZ = 'Asia/Tokyo';
function partsInJapan(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
function dateKey(date = new Date()) {
  const p = partsInJapan(date);
  return `${p.year}-${p.month}-${p.day}`;
}
function localWeekday(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}
function cleanText(value, fallback) {
  const text = String(value || '').trim();
  return text.slice(0, 180) || fallback;
}
function safeKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}
function isWithinSendWindow(now, hhmm) {
  if (!/^([01]\d|2[0-3]):00$/.test(hhmm || '')) return false;
  const p = partsInJapan(now);
  const current = Number(p.hour) * 60 + Number(p.minute);
  const [h, m] = hhmm.split(':').map(Number);
  const target = h * 60 + m;
  // 毎時07分に実行。設定時刻の時間帯で一度だけ配信し、GitHub側の遅延にも備える。
  return current >= target && current < target + 60;
}
function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}
function eventIsToday(event, today) {
  const start = event.startDate || event.date || today;
  const end = event.endDate || event.startDate || event.date || today;
  return start <= today && end >= today;
}
function timetableForToday(timetable, today) {
  if (!timetable || timetable.enabled === false) return [];
  const day = localWeekday(today);
  const special = Array.isArray(timetable.specialDays) ? timetable.specialDays.find(x => x.date === today) : null;
  const periods = special
    ? (Array.isArray(special.periods) ? special.periods : [])
    : ((timetable.weekly || {})[day] || []);
  return Array.from({ length: 7 }, (_, i) => {
    const change = special ? null : (Array.isArray(timetable.changes) ? timetable.changes.find(x => x.date === today && Number(x.period) === i + 1) : null);
    return change ? (change.subject || '') : (periods[i] || '');
  }).map((subject, i) => subject ? `${i + 1}限 ${subject}` : '').filter(Boolean);
}
async function sendToUser(uid, subscriptions, dedupeKey, title, body, today) {
  if (!subscriptions || !Object.keys(subscriptions).length) return;
  const payload = JSON.stringify({ title, body, url: '/', tag: dedupeKey });
  for (const [subscriptionId, subscription] of Object.entries(subscriptions)) {
    if (!subscription || !subscription.endpoint || !subscription.keys) continue;
    const sentRef = db.ref(`studyPushSent/${uid}/${today}/${dedupeKey}/${subscriptionId}`);
    const alreadySent = await sentRef.once('value');
    if (alreadySent.exists()) continue;
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60 * 60, urgency: 'high' });
      await sentRef.set({ sentAt: admin.database.ServerValue.TIMESTAMP });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.ref(`studyPushSubscriptions/${uid}/${subscriptionId}`).remove();
      } else {
        console.error(`Push failed for ${uid}/${subscriptionId}:`, error.statusCode || error.message);
      }
    }
  }
}

async function main() {
  const now = new Date();
  const today = dateKey(now);
  const usersSnap = await db.ref('study').once('value');
  const users = usersSnap.val() || {};
  const subscriptionsSnap = await db.ref('studyPushSubscriptions').once('value');
  const allSubscriptions = subscriptionsSnap.val() || {};
  let sentCount = 0;

  for (const [uid, data] of Object.entries(users)) {
    const settings = data && data.notificationSettings;
    if (!settings || settings.enabled !== true || !isWithinSendWindow(now, settings.dailyTime || '06:00')) continue;
    const subscriptions = allSubscriptions[uid] || {};
    if (!Object.keys(subscriptions).length) continue;
    const messages = settings.messages || {};
    const daily = settings.daily || {};
    const makeMessage = (key, defaultTitle, defaultBody) => ({
      title: cleanText(messages[key] && messages[key].title, defaultTitle),
      body: cleanText(messages[key] && messages[key].body, defaultBody)
    });

    if (daily.timetable) {
      const subjects = timetableForToday(data.timetable, today);
      const msg = makeMessage('timetable', '今日の時間割', '今日の授業を確認しましょう。');
      const body = subjects.length ? `${msg.body}\n${subjects.join('・')}` : `${msg.body}\n登録されている授業はありません。`;
      await sendToUser(uid, subscriptions, 'daily_timetable', msg.title, body, today); sentCount++;
    }
    if (daily.events) {
      const events = (Array.isArray(data.events) ? data.events : []).filter(event => eventIsToday(event, today));
      const msg = makeMessage('events', '今日の予定', '今日の予定を確認しましょう。');
      const details = events.map(e => `${e.title || '予定'}${e.allDay ? '' : (e.startTime ? ` ${e.startTime}` : '')}`);
      await sendToUser(uid, subscriptions, 'daily_events', msg.title, details.length ? `${msg.body}\n${details.join('・')}` : `${msg.body}\n登録されている予定はありません。`, today); sentCount++;
    }
    const tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(t => t.status !== 'completed' && t.dueDate);
    if (daily.tasks) {
      const due = tasks.filter(t => t.dueDate === today);
      const msg = makeMessage('tasks', '今日提出の課題', '今日が提出期限の課題があります。');
      const details = due.map(t => `${t.subject || ''} ${t.title || t.range || '課題'}`.trim());
      await sendToUser(uid, subscriptions, 'daily_tasks', msg.title, details.length ? `${msg.body}\n${details.join('・')}` : `${msg.body}\n今日提出の課題はありません。`, today); sentCount++;
    }
    const reminderDays = Array.isArray(settings.taskReminderDays) ? settings.taskReminderDays.map(Number) : [7,6,5,4,3,2,1,0];
    if (reminderDays.length) {
      for (const task of tasks) {
        const remaining = daysBetween(today, task.dueDate);
        if (!reminderDays.includes(remaining) || remaining < 0 || remaining > 7) continue;
        const taskName = task.title || task.range || '課題';
        const msg = makeMessage('taskReminder', '課題の提出リマインド', '提出期限が近づいている課題があります。');
        const dayLabel = remaining === 0 ? '今日が提出期限です。' : `提出期限まであと${remaining}日です。`;
        const body = `${msg.body}\n${task.subject || ''} ${taskName}\n${dayLabel}`.trim();
        const taskKey = safeKey(task.id || `${task.subject}-${taskName}-${task.dueDate}`);
        await sendToUser(uid, subscriptions, `task_${taskKey}_d${remaining}`, msg.title, body, today); sentCount++;
      }
    }
  }
  console.log(`Study notification check completed for ${today}. Processed ${sentCount} notification candidates.`);
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
