// Study 初期データ

const studyData = {
  events: [],
  tasks: [],
  todos: [],
  dailyRecords: {},
  dailyTags: [
    { id: "sleep", name: "睡眠", color: "#8295e5" },
    { id: "study", name: "勉強", color: "#d58dad" },
    { id: "school", name: "学校", color: "#58a68b" },
    { id: "club", name: "部活", color: "#e5b65b" },
    { id: "commute", name: "通学・移動", color: "#70a9c9" },
    { id: "meal", name: "食事", color: "#d58b68" },
    { id: "bath", name: "入浴", color: "#8bb9b4" },
    { id: "free", name: "自由時間", color: "#a78bd4" },
    { id: "other", name: "その他", color: "#9aa1ad" }
  ],
  dailyTemplates: [],
  timetable: {
    weekly: {
      1: ["", "", "", "", "", "", ""],
      2: ["", "", "", "", "", "", ""],
      3: ["", "", "", "", "", "", ""],
      4: ["", "", "", "", "", "", ""],
      5: ["", "", "", "", "", "", ""],
      6: ["", "", "", "", "", "", ""],
      0: ["", "", "", "", "", "", ""]
    },
    changes: [],
    specialDays: [],
    enabled: true
  }
};

// データの保存・読み込み
const StudyStorage = {
  load() {
    try {
      const saved = localStorage.getItem("studyData");
      if (saved) {
        const parsed = JSON.parse(saved);
        const weeklyDefaults = JSON.parse(JSON.stringify(studyData.timetable.weekly));
        const savedTimetable = parsed.timetable || {};

        return {
          events: Array.isArray(parsed.events) ? parsed.events : [],
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          todos: Array.isArray(parsed.todos) ? parsed.todos : [],
          dailyRecords: parsed.dailyRecords && typeof parsed.dailyRecords === "object" ? parsed.dailyRecords : {},
          dailyTags: Array.isArray(parsed.dailyTags) ? parsed.dailyTags : JSON.parse(JSON.stringify(studyData.dailyTags)),
          dailyTemplates: Array.isArray(parsed.dailyTemplates) ? parsed.dailyTemplates : [],
          timetable: {
            weekly: { ...weeklyDefaults, ...(savedTimetable.weekly || {}) },
            changes: Array.isArray(savedTimetable.changes) ? savedTimetable.changes : [],
            specialDays: Array.isArray(savedTimetable.specialDays) ? savedTimetable.specialDays : [],
            enabled: savedTimetable.enabled !== false
          }
        };
      }
    } catch (error) {
      console.error("データの読み込みに失敗しました", error);
    }

    return JSON.parse(JSON.stringify(studyData));
  },

  save(data) {
    try {
      // 旧機能のデータは除外し、現在使用する記録データを保存
      const cleanData = {
        events: data.events || [],
        tasks: data.tasks || [],
        todos: data.todos || [],
        dailyRecords: data.dailyRecords || {},
        dailyTags: data.dailyTags || [],
        dailyTemplates: data.dailyTemplates || [],
        timetable: data.timetable || studyData.timetable
      };
      localStorage.setItem("studyData", JSON.stringify(cleanData));
      return true;
    } catch (error) {
      console.error("データの保存に失敗しました", error);
      return false;
    }
  }
};
