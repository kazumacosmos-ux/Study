// Study 初期データ

const studyData = {
  events: [],
  tasks: [],
  todos: [],
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
      // 教材管理・学習記録・成績分析の旧データは保存対象から除外
      const cleanData = {
        events: data.events || [],
        tasks: data.tasks || [],
        todos: data.todos || [],
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
