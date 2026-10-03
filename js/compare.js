/* 比對文墨天機盤：解析貼上的星曜文字，與系統排盤逐宮比對。純邏輯，不碰畫面。 */
(function (root) {
  const STARS = [
    '紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍',
    '左輔', '右弼', '文昌', '文曲', '天魁', '天鉞', '祿存', '擎羊', '陀羅', '火星', '鈴星', '地空', '地劫',
    '天馬', '紅鸞', '天喜', '天姚', '天刑', '咸池',
  ];
  const ALIAS = { 陀螺: '陀羅' }; // 課程群組裡常打成「陀螺」
  const HUA = '祿權科忌';
  const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  const PALACES = ['命', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '交友', '僕役', '官祿', '田宅', '福德', '父母'];
  const JU = ['木三局', '金四局', '水二局', '火六局', '土五局'];

  const allNames = STARS.concat(Object.keys(ALIAS));

  /** 把一段文字切成星曜清單，例如「貪狼化祿 太陰權右弼」→ [{n:'貪狼',h:'祿'},…] */
  function tokenize(text) {
    const out = [];
    let i = 0;
    while (i < text.length) {
      const two = text.slice(i, i + 2);
      if (allNames.includes(two)) {
        const n = ALIAS[two] || two;
        i += 2;
        let h = '';
        if (text[i] === '化' && HUA.includes(text[i + 1] || '#')) { h = text[i + 1]; i += 2; }
        else if (HUA.includes(text[i] || '#') && !allNames.includes(text.slice(i, i + 2))) { h = text[i]; i += 1; }
        out.push({ n, h });
      } else i += 1;
    }
    return out;
  }

  /** 解析整份貼上的文字。回傳 { palaces:[{key,kind,stars}], ju, hasHua } */
  function parse(text) {
    const result = { palaces: [], ju: (text.match(new RegExp(JU.join('|'))) || [])[0] || '', hasHua: /化[祿權科忌]|[星曜門機陽曲同貞府陰狼相梁殺軍][祿權科忌]/.test(text) };
    let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/^[\s\-•·*]+/, '').trim();
      if (!line) continue;
      let key = null, kind = null, rest = line;
      const pal = PALACES.find((p) => line.startsWith(p));
      if (pal) {
        key = pal === '僕役' ? '交友' : pal; kind = 'name';
        rest = line.slice(pal.length).replace(/^宮/, '');
      } else if (BRANCHES.includes(line[0]) && !allNames.includes(line.slice(0, 2))) {
        key = line[0]; kind = 'branch';
        rest = line.slice(1).replace(/^宮/, '');
      }
      if (key) {
        cur = result.palaces.find((p) => p.key === key && p.kind === kind);
        if (!cur) { cur = { key, kind, stars: [] }; result.palaces.push(cur); }
      }
      if (cur) cur.stars.push(...tokenize(rest));
    }
    return result;
  }

  const label = (s) => s.n + (s.h ? '化' + s.h : '');

  /** 與系統命盤逐宮比對。 */
  function diff(chart, parsed) {
    const rows = [];
    for (const p of parsed.palaces) {
      const idx = p.kind === 'branch'
        ? BRANCHES.indexOf(p.key)
        : chart.palaces.findIndex((x) => x.name === (p.key === '命' ? '命宮' : p.key));
      if (idx < 0) continue;
      const sys = chart.palaces[idx];
      const wm = dedupe(p.stars);
      const sysKnown = sys.stars.filter((s) => STARS.includes(s.n));
      const sysNames = new Set(sysKnown.map((s) => s.n));
      const wmNames = new Set(wm.map((s) => s.n));
      const onlyWm = wm.filter((s) => !sysNames.has(s.n)).map(label);
      const onlySys = sysKnown.filter((s) => !wmNames.has(s.n)).map(label);
      const huaDiff = [];
      if (parsed.hasHua) {
        for (const s of wm) {
          const m = sysKnown.find((x) => x.n === s.n);
          if (m && (m.h || '') !== (s.h || '')) huaDiff.push(`${s.n}：系統${m.h ? '化' + m.h : '無四化'}／文墨${s.h ? '化' + s.h : '無四化'}`);
        }
      }
      rows.push({
        idx, palace: sys.name, branch: sys.branch,
        system: sysKnown.map(label), wenmo: wm.map(label),
        onlyWm, onlySys, huaDiff,
        differs: !!(onlyWm.length || onlySys.length || huaDiff.length),
        stars: wm,
      });
    }
    const juDiff = parsed.ju && parsed.ju !== chart.juName ? { system: chart.juName, wenmo: parsed.ju } : null;
    return { rows, juDiff };
  }

  function dedupe(stars) {
    const seen = new Map();
    for (const s of stars) {
      if (!seen.has(s.n)) seen.set(s.n, { ...s });
      else if (s.h && !seen.get(s.n).h) seen.get(s.n).h = s.h;
    }
    return [...seen.values()];
  }

  /** 套用：用文墨的星曜覆蓋該宮。文字裡完全沒寫四化時，保留系統原本的四化。 */
  function apply(chart, row, parsed) {
    const sys = chart.palaces[row.idx];
    sys.stars = row.stars.map((s) => {
      if (parsed.hasHua) return { n: s.n, h: s.h || '' };
      const m = sys.stars.find((x) => x.n === s.n);
      return { n: s.n, h: m ? m.h : '' };
    });
  }

  /** 產生可貼給我的差異報告 */
  function report(chart, result) {
    const s = chart.solar;
    const lines = [
      `排盤差異報告｜${chart.gender === 'M' ? '男' : '女'} ${s.y}-${s.m}-${s.d} 時辰index=${s.h}${s.late ? '(晚子)' : ''}｜農曆 ${chart.lunar.year}/${chart.lunar.leap ? '閏' : ''}${chart.lunar.month}/${chart.lunar.day}｜${chart.yearGanzhi}｜系統${chart.juName}`,
    ];
    if (result.juDiff) lines.push(`五行局不同：系統${result.juDiff.system}／文墨${result.juDiff.wenmo}`);
    for (const r of result.rows.filter((x) => x.differs)) {
      lines.push(`${r.branch}（${r.palace}）系統：${r.system.join(' ') || '無'}｜文墨：${r.wenmo.join(' ') || '無'}`);
    }
    if (lines.length === 1) lines.push('全部吻合');
    return lines.join('\n');
  }

  const api = { STARS, parse, diff, apply, report, tokenize };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Compare = api;
})(typeof window !== 'undefined' ? window : globalThis);
