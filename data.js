// Study 初期データ

const studyData = {
  // 予定
  events: [],

  // 課題
  tasks: [],

  // 教材
  materials: [],

  // 学習記録
  records: [],

  // テスト・成績
  grades: []
};

// データの保存・読み込み
const StudyStorage = {
  load() {
    try {
      const saved = localStorage.getItem("studyData");
      if (saved) {
        const parsed = JSON.parse(saved);

        return {
          events: parsed.events || [],
          tasks: parsed.tasks || [],
          materials: parsed.materials || [],
          records: parsed.records || [],
          grades: parsed.grades || []
        };
      }
    } catch (error) {
      console.error("データの読み込みに失敗しました", error);
    }

    return studyData;
  },

  save(data) {
    try {
      localStorage.setItem("studyData", JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("データの保存に失敗しました", error);
      return false;
    }
  }
};
