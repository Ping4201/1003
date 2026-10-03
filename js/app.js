const CATEGORIES = {
  asset: [
    { name: "現金", icon: "💵", color: "#e8895f" },
    { name: "銀行存款", icon: "🏦", color: "#e2b872" },
    { name: "股票基金", icon: "📈", color: "#8aa68a" },
    { name: "房地產", icon: "🏠", color: "#cc3300" },
    { name: "其他資產", icon: "🎁", color: "#a38a7a" }
  ],
  debt: [
    { name: "信用卡", icon: "💳", color: "#cc3300" },
    { name: "貸款", icon: "🧾", color: "#e8895f" },
    { name: "其他負債", icon: "📌", color: "#a38a7a" }
  ]
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => "$" + Math.round(n).toLocaleString("zh-TW");
// 用本機日期（台灣時間）而不是 UTC，避免早上 8 點前記成前一天
const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => dateStr(new Date());
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const catInfo = (kind, name) => CATEGORIES[kind].find((c) => c.name === name) || CATEGORIES[kind][0];

let state = { items: [], history: [] };
let filter = "all";
let editingId = null;

async function init() {
  state = await Storage.load();
  bindEvents();
  render();
}

function bindEvents() {
  $("addBtn").onclick = () => openDialog();
  $("cancelBtn").onclick = () => $("dlg").close();
  $("kind").onchange = () => fillCategories($("kind").value);
  $("form").onsubmit = onSubmit;
  $("sampleBtn").onclick = loadSample;
  $("exportBtn").onclick = exportBackup;
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = importBackup;
  $("tabs").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.filter;
    [...$("tabs").children].forEach((x) => x.classList.toggle("on", x === b));
    renderList();
  };
  $("list").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === "edit") openDialog(id);
    if (b.dataset.act === "del") removeItem(id);
  };
}

function fillCategories(kind, selected) {
  $("category").innerHTML = CATEGORIES[kind]
    .map((c) => `<option ${c.name === selected ? "selected" : ""}>${c.name}</option>`)
    .join("");
}

function openDialog(id) {
  editingId = id || null;
  const f = $("form");
  const item = state.items.find((i) => i.id === id);
  $("dlgTitle").textContent = item ? "編輯項目" : "新增項目";
  f.kind.value = item ? item.kind : "asset";
  fillCategories(f.kind.value, item && item.category);
  f.name.value = item ? item.name : "";
  f.amount.value = item ? item.amount : "";
  f.note.value = item ? item.note : "";
  $("dlg").showModal();
}

async function onSubmit(e) {
  e.preventDefault();
  const f = $("form");
  const amount = Math.round(Number(f.amount.value));
  if (!Number.isFinite(amount) || amount < 0 || amount > Storage.MAX_AMOUNT) {
    alert("金額請輸入 0 到 " + Storage.MAX_AMOUNT.toLocaleString("zh-TW") + " 之間的數字。");
    return;
  }
  const data = {
    kind: f.kind.value,
    name: f.name.value.trim(),
    category: f.category.value,
    amount,
    note: f.note.value.trim()
  };
  if (!data.name) return;
  if (editingId) {
    Object.assign(state.items.find((i) => i.id === editingId), data);
  } else {
    state.items.push({ id: crypto.randomUUID(), ...data });
  }
  $("dlg").close();
  await commit();
}

async function removeItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item || !confirm(`確定要刪除「${item.name}」嗎？`)) return;
  state.items = state.items.filter((i) => i.id !== id);
  await commit();
}

async function loadSample() {
  const mk = (kind, name, category, amount, note = "") => ({ id: crypto.randomUUID(), kind, name, category, amount, note });
  state.items = [
    mk("asset", "皮夾現金", "現金", 8000),
    mk("asset", "郵局活存", "銀行存款", 120000, "緊急預備金"),
    mk("asset", "0050 ETF", "股票基金", 260000),
    mk("asset", "自住房", "房地產", 6000000, "市值估算"),
    mk("debt", "房貸", "貸款", 3500000),
    mk("debt", "信用卡待繳", "信用卡", 12000)
  ];
  // 為了讓趨勢圖有東西看，補上過去幾天的假紀錄
  const net = totals().net;
  state.history = [-4, -3, -2, -1].map((d, i) => {
    const t = new Date(); t.setDate(t.getDate() + d);
    return { date: dateStr(t), net: Math.round(net * (0.94 + i * 0.015)) };
  });
  await commit();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `暖暖家計簿備份-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importBackup(e) {
  const file = e.target.files[0];
  e.target.value = ""; // 讓同一個檔案可以再選一次
  if (!file) return;
  try {
    const data = Storage.normalize(JSON.parse(await file.text()));
    if (!confirm(`備份檔內有 ${data.items.length} 個項目。匯入會取代目前所有資料，確定嗎？`)) return;
    state = data;
    await Storage.save(state);
    render();
  } catch (err) {
    alert("這不是有效的備份檔，資料沒有被更動。");
  }
}

function totals() {
  let asset = 0, debt = 0;
  state.items.forEach((i) => (i.kind === "asset" ? (asset += i.amount) : (debt += i.amount)));
  return { asset, debt, net: asset - debt };
}

async function commit() {
  const { net } = totals();
  const today = todayStr();
  const last = state.history[state.history.length - 1];
  if (last && last.date === today) last.net = net;
  else state.history.push({ date: today, net });
  await Storage.save(state);
  render();
}

function render() {
  const t = totals();
  $("totalAsset").textContent = fmt(t.asset);
  $("totalDebt").textContent = fmt(t.debt);
  $("netWorth").textContent = (t.net < 0 ? "-" : "") + fmt(Math.abs(t.net));
  renderList();
  renderDonut();
  renderTrend();
}

function renderList() {
  const rows = state.items.filter((i) => filter === "all" || i.kind === filter);
  $("empty").hidden = state.items.length > 0;
  $("list").innerHTML = rows
    .map((i) => {
      const c = catInfo(i.kind, i.category);
      return `<li class="item">
        <div class="dot" style="background:${c.color}33">${c.icon}</div>
        <div class="info"><b>${esc(i.name)}</b><small>${esc(i.category)}${i.note ? "・" + esc(i.note) : ""}</small></div>
        <span class="amt ${i.kind}">${i.kind === "debt" ? "-" : ""}${fmt(i.amount)}</span>
        <button class="icon-btn" data-act="edit" data-id="${i.id}" title="編輯">✏️</button>
        <button class="icon-btn" data-act="del" data-id="${i.id}" title="刪除">🗑️</button>
      </li>`;
    })
    .join("");
}

function renderDonut() {
  const sums = CATEGORIES.asset
    .map((c) => ({ ...c, value: state.items.filter((i) => i.kind === "asset" && i.category === c.name).reduce((s, i) => s + i.amount, 0) }))
    .filter((c) => c.value > 0);
  const total = sums.reduce((s, c) => s + c.value, 0);
  if (!total) {
    $("donut").innerHTML = '<div class="hint">新增資產後會出現圖表 🍩</div>';
    $("legend").innerHTML = "";
    return;
  }
  const r = 70, C = 2 * Math.PI * r;
  let offset = 0;
  const arcs = sums
    .map((c) => {
      const len = (c.value / total) * C;
      const s = `<circle r="${r}" cx="100" cy="100" fill="none" stroke="${c.color}" stroke-width="34"
        stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"/>`;
      offset += len;
      return s;
    })
    .join("");
  $("donut").innerHTML = `<svg viewBox="0 0 200 200" style="max-width:240px;margin:0 auto" role="img" aria-label="資產分布圖">
    ${arcs}<text x="100" y="96" text-anchor="middle" font-size="11" fill="#8a7f78">總資產</text>
    <text x="100" y="116" text-anchor="middle" font-size="15" font-weight="700" fill="#222222">${fmt(total)}</text></svg>`;
  $("legend").innerHTML = sums
    .map((c) => `<li><i style="background:${c.color}"></i>${c.icon} ${c.name}<em>${Math.round((c.value / total) * 100)}%・${fmt(c.value)}</em></li>`)
    .join("");
}

function renderTrend() {
  const h = state.history.slice(-30);
  if (h.length < 2) {
    $("trend").innerHTML = '<div class="hint">記錄超過一天後，這裡會畫出淨資產走勢 📈</div>';
    return;
  }
  const W = 320, H = 200, P = 28;
  const vals = h.map((p) => p.net);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => P + (i / (h.length - 1)) * (W - P * 2);
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - P * 2);
  const pts = h.map((p, i) => `${x(i)},${y(p.net)}`).join(" ");
  const dots = h.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.net)}" r="3.5" fill="#cc3300"><title>${p.date}：${fmt(p.net)}</title></circle>`).join("");
  $("trend").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="淨資產趨勢圖">
    <polyline points="${pts}" fill="none" stroke="#cc3300" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${P}" y="${H - 8}" font-size="10" fill="#8a7f78">${h[0].date.slice(5)}</text>
    <text x="${W - P}" y="${H - 8}" font-size="10" fill="#8a7f78" text-anchor="end">${h[h.length - 1].date.slice(5)}</text>
    <text x="${P}" y="14" font-size="10" fill="#8a7f78">${fmt(max)}</text>
  </svg>`;
}

init();

