/* 畫面與互動 */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (t) => new Date(t).toLocaleDateString('zh-TW');
// 第 13 項「晚子」= 23:00–24:00，排盤時視為次日的子時
const HOURS = ['早子 00–01', '丑 01–03', '寅 03–05', '卯 05–07', '辰 07–09', '巳 09–11', '午 11–13', '未 13–15', '申 15–17', '酉 17–19', '戌 19–21', '亥 21–23', '晚子 23–24'];
const hourLabel = (s) => (s.late ? '晚子' : HOURS[s.h].split(' ')[0]);
const hourOption = (s) => (s.late ? 12 : s.h);
// 地支 index → [row, col]
const POS = { 5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4], 9: [2, 4], 10: [3, 4], 11: [4, 4], 0: [4, 3], 1: [4, 2], 2: [4, 1], 3: [3, 1], 4: [2, 1] };
const SHA = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'];

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------- 分頁 ---------- */
const loaders = {};
function showTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.panel').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
  if (loaders[name]) Promise.resolve(loaders[name]()).catch((e) => toast(e.message));
  location.hash = name;
}
$('#tabs').addEventListener('click', (e) => e.target.dataset.tab && showTab(e.target.dataset.tab));

/* ---------- 排盤 ---------- */
const cur = { chart: null, caseId: null };
const form = $('#chart-form');
form.hour.innerHTML = HOURS.map((h, i) => `<option value="${i}">${h}</option>`).join('');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const [y, m, d] = form.date.value.split('-').map(Number);
  const hv = Number(form.hour.value);
  try {
    cur.chart = Ziwei.buildChart({
      name: form.name.value.trim(), gender: form.gender.value, y, m, d,
      hourBranch: hv === 12 ? 0 : hv, lateZi: hv === 12, leapRule: form.leap.value,
    });
  } catch (err) {
    return toast(err.message);
  }
  cur.caseId = null;
  $('#case-verdict').value = '未驗證';
  $('#case-note').value = '';
  $('#case-status').textContent = '';
  renderChart();
});

function starHtml(s, borrowed) {
  const main = Ziwei.MAIN_STARS.includes(s.n);
  const cls = (main ? 'star' : 'star minor' + (SHA.includes(s.n) ? ' sha' : '')) + (borrowed ? ' borrow' : '');
  const hua = s.h ? `<span class="hua hua-${s.h}">${s.h}</span>` : '';
  return `<span class="${cls}" data-star="${esc(s.n)}">${esc(s.n)}${hua}</span>`;
}

function renderChart() {
  const c = cur.chart;
  $('#chart-wrap').hidden = false;
  const l = c.lunar;
  const lunarText = `${l.year}年${l.leap ? '閏' : ''}${l.month}月${l.day}日`;
  const ming = c.palaces.find((p) => p.name === '命宮');
  $('#chart-summary').innerHTML =
    `<span><b>${esc(c.name || '（未命名）')}</b> ${c.gender === 'M' ? '男' : '女'}</span>` +
    `<span>國曆 ${c.solar.y}-${c.solar.m}-${c.solar.d} ${hourLabel(c.solar)}時${c.solar.late ? '（視為次日）' : ''}</span>` +
    `<span>農曆 ${lunarText}</span><span>${c.yearGanzhi}年</span>`;

  const cells = c.palaces.map((p, b) => {
    const [r, col] = POS[b];
    // 空宮（沒有主星）：整套借對宮的星，本宮原有的星仍保留
    const empty = !p.stars.some((s) => Ziwei.MAIN_STARS.includes(s.n));
    const borrowed = empty ? c.palaces[(b + 6) % 12].stars : [];
    const borrowHtml = borrowed.length ? `<span class="borrow-tag">借對宮</span>${borrowed.map((s) => starHtml(s, true)).join('')}` : '';
    return `<div class="cell${p.name === '命宮' ? ' ming' : ''}" data-b="${b}" style="grid-row:${r};grid-column:${col}">
      ${p.note ? '<i class="note-dot" title="有備註"></i>' : ''}
      <div class="stars">${p.stars.map((s) => starHtml(s)).join('')}${borrowHtml}</div>
      <div class="foot"><div class="pn"><span class="pname">${p.name}${p.isShen ? '·身' : ''}</span><span class="gz">${p.stem}${p.branch}</span></div><div class="dx">${p.daxian[0]}–${p.daxian[1]}</div></div>
    </div>`;
  });
  const center = `<div class="center" style="grid-row:2/4;grid-column:2/4">
    <div class="big">${esc(c.name || '命盤')}</div>
    <div>${c.gender === 'M' ? '男' : '女'}　${c.juName}</div>
    <div class="muted">命主 ${c.mingZhu}　身主 ${c.shenZhu}</div>
    <div class="sihua">${c.sihua.map((x) => `<span class="hua hua-${x.slice(-1)}">${x}</span>`).join('')}</div>
  </div>`;
  $('#chart-grid').innerHTML = cells.join('') + center;
}

$('#chart-grid').addEventListener('click', (e) => {
  const star = e.target.closest('[data-star]');
  if (star) return showStarInfo(star.dataset.star);
  const cell = e.target.closest('.cell');
  if (cell) editPalace(Number(cell.dataset.b));
});

async function lookupTerm(name) {
  return (await getAllTerms()).find((t) => t.name === name);
}
async function showStarInfo(name) {
  const t = await lookupTerm(name);
  const box = $('#star-info');
  box.hidden = false;
  box.innerHTML = t
    ? `<h3>${esc(t.name)} <span class="tag">${esc(t.cat)}</span></h3><div class="muted">${esc(t.brief)}</div><p>${esc(t.body)}</p>`
    : `<h3>${esc(name)}</h3><p class="muted">速查裡還沒有這個術語，可到「速查」頁新增。</p>`;
}

const dlgPalace = $('#dlg-palace');
function starsToText(stars) {
  return stars.map((s) => s.n + (s.h ? '化' + s.h : '')).join('、');
}
function textToStars(text) {
  return text.split(/[,，、\s]+/).filter(Boolean).map((t) => {
    const m = t.match(/^(.+?)化([祿權科忌])$/);
    return m ? { n: m[1], h: m[2] } : { n: t, h: '' };
  });
}
function editPalace(b) {
  const p = cur.chart.palaces[b];
  $('#palace-title').textContent = `${p.name}（${p.stem}${p.branch}）`;
  const f = $('#palace-form');
  f.stars.value = starsToText(p.stars);
  f.note.value = p.note || '';
  dlgPalace.returnValue = '';
  dlgPalace.onclose = () => {
    if (dlgPalace.returnValue !== 'ok') return;
    p.stars = textToStars(f.stars.value);
    p.note = f.note.value.trim();
    renderChart();
  };
  dlgPalace.showModal();
}

/* ---------- 比對文墨天機盤 ---------- */
let cmp = null; // { parsed, result }
const starsHtml = (arr) => (arr.length ? arr.map((s) => `<span class="cs">${esc(s)}</span>`).join('') : '<span class="muted">（無）</span>');
function renderCompare() {
  const box = $('#cmp-result');
  const { result } = cmp;
  const diffs = result.rows.filter((r) => r.differs);
  let html = '';
  if (!result.rows.length) {
    html = '<p class="err">看不到任何宮位。請每行以地支（子丑寅…）或宮名（命宮、兄弟…）開頭。</p>';
  } else {
    html += `<p class="cmp-sum ${diffs.length || result.juDiff ? 'bad' : 'good'}">比對了 ${result.rows.length} 個宮位：` +
      (diffs.length || result.juDiff ? `<b>${diffs.length} 個宮位不同</b>` : '<b>全部吻合 ✓</b>') + '</p>';
    if (result.juDiff) {
      html += `<p class="err">五行局不同：系統 ${esc(result.juDiff.system)}／文墨 ${esc(result.juDiff.wenmo)}。這代表命宮、生日或時辰的判定不同，請先確認出生時間、晚子時、閏月設定，再比對星曜。</p>`;
    }
    html += diffs.map((r) => `
      <label class="cmp-row"><input type="checkbox" data-idx="${r.idx}" checked>
        <div><div class="cmp-h">${esc(r.branch)}宮（${esc(r.palace)}）</div>
          <div class="cmp-line"><b>系統</b>${starsHtml(r.system)}</div>
          <div class="cmp-line"><b>文墨</b>${starsHtml(r.wenmo)}</div>
          <div class="cmp-note">${[r.onlyWm.length ? '文墨多：' + r.onlyWm.join('、') : '', r.onlySys.length ? '系統多：' + r.onlySys.join('、') : '', ...r.huaDiff].filter(Boolean).map(esc).join('｜')}</div>
        </div></label>`).join('');
    html += '<div class="actions mt">' +
      (diffs.length ? '<button type="button" id="btn-cmp-apply" class="primary">套用勾選的宮位</button>' : '') +
      '<button type="button" id="btn-cmp-copy" class="ghost">複製差異報告</button></div>';
  }
  box.innerHTML = html;
}
$('#btn-cmp').addEventListener('click', () => {
  if (!cur.chart) return toast('請先排盤');
  const parsed = Compare.parse($('#cmp-text').value);
  cmp = { parsed, result: Compare.diff(cur.chart, parsed) };
  renderCompare();
});
$('#btn-cmp-clear').addEventListener('click', () => { $('#cmp-text').value = ''; $('#cmp-result').innerHTML = ''; cmp = null; });
$('#cmp-result').addEventListener('click', async (e) => {
  if (!cmp) return;
  if (e.target.id === 'btn-cmp-apply') {
    const picked = new Set($$('#cmp-result input[type=checkbox]:checked').map((c) => Number(c.dataset.idx)));
    let n = 0;
    cmp.result.rows.filter((r) => picked.has(r.idx)).forEach((r) => { Compare.apply(cur.chart, r, cmp.parsed); n++; });
    if (!n) return toast('沒有勾選任何宮位');
    renderChart();
    cmp.result = Compare.diff(cur.chart, cmp.parsed);
    renderCompare();
    toast(`已套用 ${n} 個宮位，記得按「儲存為案例」`);
  }
  if (e.target.id === 'btn-cmp-copy') {
    const text = Compare.report(cur.chart, cmp.result);
    try { await navigator.clipboard.writeText(text); toast('已複製，可貼給 Claude'); }
    catch { prompt('請複製這段文字：', text); }
  }
});

$('#btn-save-case').addEventListener('click', async () => {
  if (!cur.chart) return;
  const item = {
    id: cur.caseId || undefined,
    chart: cur.chart,
    verdict: $('#case-verdict').value,
    note: $('#case-note').value,
  };
  const saved = await Store.save('cases', item);
  cur.caseId = saved.id;
  $('#case-status').textContent = '已儲存 ' + new Date().toLocaleTimeString('zh-TW');
  toast('案例已儲存');
});

/* ---------- 案例 ---------- */
async function renderCases() {
  const q = $('#case-search').value.trim().toLowerCase();
  const all = (await Store.list('cases')).filter((c) =>
    !q || (c.chart.name + c.note + c.verdict).toLowerCase().includes(q));
  $('#case-list').innerHTML = all.length ? all.map((c) => {
    const ch = c.chart;
    const mp = ch.palaces.find((p) => p.name === '命宮');
    const main = mp.stars.filter((s) => Ziwei.MAIN_STARS.includes(s.n)).map((s) => s.n).join('') || '命無主星';
    return `<div class="item" data-id="${c.id}">
      <div><div class="t">${esc(ch.name || '（未命名）')} <span class="tag">${esc(c.verdict)}</span></div>
      <div class="s">${ch.solar.y}-${ch.solar.m}-${ch.solar.d}｜${ch.juName}｜命宮 ${esc(main)}｜${fmtDate(c.updated)}</div>
      <div class="s">${esc((c.note || '').slice(0, 60))}</div></div>
      <button class="danger" data-del="${c.id}">刪除</button></div>`;
  }).join('') : '<p class="muted">還沒有案例。到「排盤」排好盤後按「儲存為案例」。</p>';
}
loaders.cases = renderCases;
$('#case-search').addEventListener('input', renderCases);
$('#case-list').addEventListener('click', async (e) => {
  const del = e.target.dataset.del;
  if (del) {
    if (confirm('確定刪除這個案例？')) { await Store.remove('cases', del); renderCases(); }
    return;
  }
  const item = e.target.closest('.item');
  if (!item) return;
  const c = await Store.get('cases', item.dataset.id);
  cur.chart = c.chart; cur.caseId = c.id;
  form.name.value = c.chart.name; form.gender.value = c.chart.gender;
  form.date.value = `${c.chart.solar.y}-${String(c.chart.solar.m).padStart(2, '0')}-${String(c.chart.solar.d).padStart(2, '0')}`;
  form.hour.value = hourOption(c.chart.solar);
  $('#case-verdict').value = c.verdict; $('#case-note').value = c.note || '';
  $('#case-status').textContent = '';
  showTab('chart');
  renderChart();
});

/* ---------- 筆記 ---------- */
const noteForm = $('#note-form');
let noteId = null;
async function renderNotes() {
  const q = $('#note-search').value.trim().toLowerCase();
  const all = (await Store.list('notes')).filter((n) => !q || (n.title + n.tags + n.body).toLowerCase().includes(q));
  $('#note-list').innerHTML = all.length ? all.map((n) => `
    <div class="item${n.id === noteId ? ' on' : ''}" data-id="${n.id}"><div>
      <div class="t">${esc(n.title)}</div>
      <div class="s">${(n.tags || '').split(/[,，]/).filter(Boolean).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join('')}${fmtDate(n.updated)}</div>
    </div></div>`).join('') : '<p class="muted">沒有符合的筆記。</p>';
}
loaders.notes = renderNotes;
$('#note-search').addEventListener('input', renderNotes);
function openNote(n) {
  noteId = n ? n.id : null;
  noteForm.hidden = false;
  noteForm.title.value = n ? n.title : '';
  noteForm.tags.value = n ? n.tags : '';
  noteForm.body.value = n ? n.body : '';
  renderNotes();
}
$('#btn-new-note').addEventListener('click', () => openNote(null));
$('#note-list').addEventListener('click', async (e) => {
  const item = e.target.closest('.item');
  if (item) openNote(await Store.get('notes', item.dataset.id));
});
noteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saved = await Store.save('notes', { id: noteId || undefined, title: noteForm.title.value.trim(), tags: noteForm.tags.value.trim(), body: noteForm.body.value });
  noteId = saved.id;
  renderNotes();
  toast('筆記已儲存');
});
$('#btn-del-note').addEventListener('click', async () => {
  if (!noteId || !confirm('確定刪除這篇筆記？')) return;
  await Store.remove('notes', noteId);
  noteId = null; noteForm.hidden = true; renderNotes();
});

/* ---------- 速查 ---------- */
let termCat = '全部';
/** 內建條目 + 你的修改（override）+ 自訂條目。修改只存在你的私人資料庫，不會進 GitHub。 */
async function getAllTerms() {
  const saved = await Store.list('terms');
  const ov = new Map(saved.filter((t) => t.override).map((t) => [t.name, t]));
  const builtin = BUILTIN_TERMS.map((t) => {
    const o = ov.get(t.name);
    return o ? { ...t, cat: o.cat, brief: o.brief, body: o.body, edited: true, ovId: o.id, builtin: true } : { ...t, builtin: true };
  });
  const custom = saved.filter((t) => !t.override).map((t) => ({ ...t, custom: true }));
  return builtin.concat(custom);
}
async function renderTerms() {
  const all = await getAllTerms();
  const cats = ['全部', ...new Set(all.map((t) => t.cat))];
  $('#term-cats').innerHTML = cats.map((c) => `<button class="chip${c === termCat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  const q = $('#term-search').value.trim().toLowerCase();
  const rows = all.filter((t) => (termCat === '全部' || t.cat === termCat) && (!q || (t.name + t.brief + t.body).toLowerCase().includes(q)));
  $('#term-list').innerHTML = rows.map((t) => {
    const key = esc(t.custom ? t.id : t.name);
    const btns = `<button class="ghost" data-edit="${key}">編輯</button>` +
      (t.custom ? `<button class="ghost" data-del="${key}">刪除</button>` : '') +
      (t.edited ? `<button class="ghost" data-reset="${key}">還原內建</button>` : '');
    return `<div class="term"><h3>${esc(t.name)} <span class="tag">${esc(t.cat)}</span>${t.edited ? '<span class="tag mine">我改過</span>' : ''}</h3>
      <div class="b">${esc(t.brief)}</div><p>${esc(t.body)}</p>
      <div class="actions mt">${btns}</div></div>`;
  }).join('') || '<p class="muted">找不到，試試新增自訂術語。</p>';
}
loaders.terms = renderTerms;
$('#term-search').addEventListener('input', renderTerms);
$('#term-cats').addEventListener('click', (e) => { if (e.target.dataset.cat) { termCat = e.target.dataset.cat; renderTerms(); } });
const dlgTerm = $('#dlg-term');
function editTerm(t) {
  const f = $('#term-form');
  f.name.value = t?.name || ''; f.name.readOnly = !!t?.builtin;
  const cat = t?.cat || '自訂';
  if (![...f.cat.options].some((o) => o.value === cat)) f.cat.add(new Option(cat, cat)); // 舊資料裡的其他分類也能選到
  f.cat.value = cat; f.brief.value = t?.brief || ''; f.body.value = t?.body || '';
  dlgTerm.returnValue = '';
  dlgTerm.onclose = async () => {
    if (dlgTerm.returnValue !== 'ok') return;
    const item = { name: f.name.value.trim(), cat: f.cat.value.trim() || '自訂', brief: f.brief.value.trim(), body: f.body.value.trim() };
    if (t?.builtin) Object.assign(item, { id: t.ovId || 'ov-' + item.name, override: true });
    else item.id = t?.id;
    await Store.save('terms', item);
    renderTerms(); toast('已儲存');
  };
  dlgTerm.showModal();
}
$('#btn-new-term').addEventListener('click', () => editTerm(null));
$('#term-list').addEventListener('click', async (e) => {
  const { edit, del, reset } = e.target.dataset;
  if (!edit && !del && !reset) return;
  const all = await getAllTerms();
  const byKey = (k) => all.find((t) => (t.custom ? t.id : t.name) === k);
  if (edit) editTerm(byKey(edit));
  if (del && confirm('確定刪除這個術語？')) { await Store.remove('terms', del); renderTerms(); }
  if (reset && confirm('還原成內建內容？你的修改會被刪除。')) { await Store.remove('terms', byKey(reset).ovId); renderTerms(); }
});

/* ---------- 匯入 LINE 文字檔 ---------- */
const DATE_LINE = /^(?:[一二三四五六日週]+[,，]?\s*)?(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}.*)$/;
const MSG_LINE = /^(?:上午|下午)?\s*(\d{1,2}:\d{2})\t([^\t]*)\t(.*)$/;
/** 解析 LINE 匯出的聊天記錄。keep 為空陣列時保留所有發言者。 */
function parseLine(text, keep, clean) {
  const out = [];
  let date = '', lastDate = '', on = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^"|"$/g, '');
    const m = raw.match(MSG_LINE);
    if (m) {
      const who = m[2].trim();
      on = !!who && (!keep.length || keep.some((k) => who.includes(k)));
      if (!on) continue;
      if (date && date !== lastDate) { out.push('', '## ' + date); lastDate = date; }
      out.push(clean ? m[3].replace(/^"/, '') : `[${m[1]}] ${who}：${m[3]}`);
    } else if (DATE_LINE.test(raw.trim()) && raw.trim().length < 30) {
      date = raw.trim(); on = false;
    } else if (on && line.trim()) {
      out.push(line);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
$('#file-line').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const keep = $('#line-who').value.split(/[,，、\s]+/).filter(Boolean);
  const clean = $('#line-clean').checked;
  const result = $('#line-result');
  result.textContent = '';
  try {
    const existing = await Store.list('notes');
    for (const f of files) {
      const body = parseLine(await f.text(), keep, clean);
      if (!body) { result.textContent += `「${f.name}」沒有符合條件的發言（請檢查發言者名稱）\n`; continue; }
      const title = f.name.replace(/\.(txt|md)$/i, '');
      const old = existing.find((n) => n.title === title && /LINE匯入/.test(n.tags || ''));
      await Store.save('notes', old ? { ...old, body } : { title, tags: 'LINE匯入', body });
      result.textContent += `${old ? '已更新' : '已匯入'}「${title}」：${body.split('\n').length} 行\n`;
    }
    toast('完成');
  } catch (err) { result.textContent += '失敗：' + err.message; }
  e.target.value = '';
});

/* ---------- 備份 ---------- */
$('#btn-export').addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify(await Store.exportAll(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ziwei-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('備份已下載（不含 PDF 檔案）');
});
$('#file-import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const n = await Store.importAll(JSON.parse(await f.text()));
    toast(`已匯入 ${n} 筆`);
    showTab(location.hash.slice(1) || 'chart');
  } catch (err) { toast(err.message); }
  e.target.value = '';
});

/* ---------- 快速筆記（上課用） ---------- */
const dlgQuick = $('#dlg-quick');
const quickForm = $('#quick-form');
const pad = (n) => String(n).padStart(2, '0');
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式等情況略過 */ } };

/* 章節目錄存在私人資料庫（meta / chapters），下拉選單才會對應到課程單元；
   讀不到時只剩「其他」可手動輸入。 */
const OTHER = '__other';
let chapterGroups = null; // [{ch, title, units:[{no,name}]}]
async function loadChapters() {
  if (chapterGroups) return chapterGroups;
  const item = await Store.get('meta', 'chapters').catch(() => null);
  chapterGroups = (item && item.list) || [];
  return chapterGroups;
}
const unitValue = (g, u) => `${g.ch}-${u.no.split('-')[1]} ${u.name}`; // 例：Ch 03-02 紫微星
function buildChapterSelect(selected) {
  const sel = quickForm.chapterSel;
  const groups = chapterGroups || [];
  sel.innerHTML = '<option value="">（請選擇章節）</option>' +
    groups.map((g) => `<optgroup label="${esc(g.ch + ' ' + g.title)}">` +
      g.units.map((u) => { const v = unitValue(g, u); return `<option value="${esc(v)}" data-group="${esc(g.ch + ' ' + g.title)}">${esc(u.no + ' ' + u.name)}</option>`; }).join('') +
      '</optgroup>').join('') +
    `<option value="${OTHER}">其他／自行輸入…</option>`;
  const known = [...sel.options].some((o) => o.value === selected && o.value);
  if (known) { sel.value = selected; quickForm.chapter.hidden = true; quickForm.chapter.value = ''; }
  else if (selected || !groups.length) { sel.value = OTHER; quickForm.chapter.hidden = false; quickForm.chapter.value = selected || ''; }
  else { sel.value = ''; quickForm.chapter.hidden = true; }
}
quickForm.chapterSel.addEventListener('change', () => {
  const other = quickForm.chapterSel.value === OTHER;
  quickForm.chapter.hidden = !other;
  if (other) quickForm.chapter.focus();
});
const currentChapter = () => (quickForm.chapterSel.value === OTHER ? quickForm.chapter.value.trim() : quickForm.chapterSel.value);

async function openQuick() {
  await loadChapters();
  const recent = lsGet('zw-chapters', []);
  const last = (await Store.get('meta', 'progress').catch(() => null))?.chapter || recent[0] || '';
  buildChapterSelect(last);
  quickForm.text.value = lsGet('zw-draft', '');
  dlgQuick.returnValue = '';
  dlgQuick.showModal();
  quickForm.text.focus();
}
dlgQuick.addEventListener('input', () => lsSet('zw-draft', quickForm.text.value)); // 草稿自動保留，不怕誤關
// 按下儲存的當下就先把欄位內容取走（不等視窗關閉事件），避免連續記錄時內容被下一次覆蓋
quickForm.addEventListener('submit', async (e) => {
  if (!e.submitter || e.submitter.value !== 'ok') return;
  const text = quickForm.text.value.trim();
  const chapter = currentChapter() || '未分類';
  const group = quickForm.chapterSel.selectedOptions[0]?.dataset.group;
  if (!text) return;
  const now = new Date();
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const title = `${chapter}｜${day}`;
  const line = `[${pad(now.getHours())}:${pad(now.getMinutes())}] ${text}`;
  try {
    const exist = (await Store.list('notes')).find((n) => n.title === title);
    await Store.save('notes', exist
      ? { ...exist, body: exist.body + '\n\n' + line }
      : { title, tags: ['上課', group, chapter].filter(Boolean).join(', '), body: line });
    await Store.save('meta', { id: 'progress', chapter });
    lsSet('zw-chapters', [chapter, ...lsGet('zw-chapters', []).filter((c) => c !== chapter)].slice(0, 20));
    lsSet('zw-draft', '');
    toast('已記下');
    if (!$('#tab-notes').hidden) renderNotes();
  } catch (err) { toast('儲存失敗，草稿仍保留：' + err.message); }
});
$('#fab').addEventListener('click', openQuick);
$('#nav-note').addEventListener('click', openQuick);

/* ---------- 登入／啟動 ---------- */
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || '發生錯誤'));
const loginEl = $('#login');
function showLogin(msg) {
  $('main').hidden = true; $('#fab').hidden = true; $('#tabs').hidden = true; $('.menu').hidden = true;
  loginEl.hidden = false;
  $('#login-msg').textContent = msg || '';
}
function startApp() {
  loginEl.hidden = true;
  $('main').hidden = false; $('#fab').hidden = false; $('#tabs').hidden = false; $('.menu').hidden = false;
  const h = location.hash.slice(1);
  showTab(['chart', 'cases', 'notes', 'terms', 'import'].includes(h) ? h : 'chart');
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#login-msg').textContent = '登入中…';
  try { await Store.signIn(f.email.value.trim(), f.password.value); f.password.value = ''; startApp(); }
  catch (err) { $('#login-msg').textContent = err.message; }
});
const dlgPassword = $('#dlg-password');
const passwordForm = $('#password-form');
$('#btn-password').addEventListener('click', () => {
  $('.menu').open = false;
  passwordForm.reset();
  $('#password-msg').textContent = '';
  dlgPassword.showModal();
});
$('#btn-password-cancel').addEventListener('click', () => dlgPassword.close());
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = passwordForm;
  const msg = $('#password-msg');
  if (f.next.value !== f.again.value) { msg.textContent = '兩次輸入的新密碼不一致'; return; }
  if (f.next.value === f.current.value) { msg.textContent = '新密碼不能與目前的密碼相同'; return; }
  msg.textContent = '更新中…';
  try {
    await Store.changePassword(f.current.value, f.next.value);
    f.reset();
    dlgPassword.close();
    toast('密碼已更新');
  } catch (err) { msg.textContent = err.message; }
});
$('#btn-logout').addEventListener('click', async () => { await Store.signOut(); cur.chart = null; location.hash = ''; location.reload(); });

(async () => {
  try {
    if (await Store.session()) startApp(); else showLogin();
    Store.onAuth((s) => { if (!s) showLogin(); });
  } catch (err) { showLogin(err.message); }
})();

