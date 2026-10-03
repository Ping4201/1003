// 儲存層：app.js 只透過 load／save／normalize 存取資料。
// 目前存在瀏覽器 localStorage；之後串雲端（Firebase／Supabase）時，
// 只要把 load／save 改成呼叫雲端 API，其他程式都不用動。
const Storage = {
  KEY: "piggy-assets-v1",
  MAX_AMOUNT: 1e12, // 單筆金額上限：一兆

  // 把任何來源的資料整理成安全格式（補齊欄位、丟掉壞項目、限制金額）
  normalize(data) {
    const items = data && Array.isArray(data.items) ? data.items : [];
    const history = data && Array.isArray(data.history) ? data.history : [];
    return {
      items: items
        .filter((i) => i && typeof i.name === "string" && Number.isFinite(Number(i.amount)))
        .map((i) => ({
          id: typeof i.id === "string" && i.id ? i.id : crypto.randomUUID(),
          kind: i.kind === "debt" ? "debt" : "asset",
          name: i.name.slice(0, 30),
          category: typeof i.category === "string" ? i.category : "",
          amount: Math.min(this.MAX_AMOUNT, Math.max(0, Math.round(Number(i.amount)))),
          note: typeof i.note === "string" ? i.note.slice(0, 60) : ""
        })),
      history: history
        .filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && Number.isFinite(Number(h.net)))
        .map((h) => ({ date: h.date, net: Number(h.net) }))
    };
  },

  async load() {
    let raw = null;
    try {
      raw = localStorage.getItem(this.KEY);
      if (raw) return this.normalize(JSON.parse(raw));
    } catch (e) {
      // 資料損毀：先把原始內容另存一份，避免之後被新資料覆蓋而無法搶救
      try { localStorage.setItem(this.KEY + "-corrupt-backup", raw); } catch (_) {}
      alert("偵測到本機資料損毀，已為你保留一份原始備份並重新開始。");
    }
    return { items: [], history: [] };
  },

  async save(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {
      alert("儲存失敗，瀏覽器可能封鎖了本機儲存。");
    }
  }
};
