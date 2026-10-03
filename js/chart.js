/* 紫微斗數排盤（三合派基本盤）— 純計算，不碰畫面 */
(function (root) {
  const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const PALACE_NAMES = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '交友', '官祿', '田宅', '福德', '父母'];
  const MAIN_STARS = ['紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍'];
  const JU = { 1: ['木三局', 3], 2: ['金四局', 4], 3: ['水二局', 2], 4: ['火六局', 6], 5: ['土五局', 5] };
  const MONTH_NAMES = { 正: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 臘: 12, 十二: 12 };

  // 四化：[祿, 權, 科, 忌]
  const SIHUA = {
    甲: ['廉貞', '破軍', '武曲', '太陽'],
    乙: ['天機', '天梁', '紫微', '太陰'],
    丙: ['天同', '天機', '文昌', '廉貞'],
    丁: ['太陰', '天同', '天機', '巨門'],
    戊: ['貪狼', '太陰', '右弼', '天機'],
    己: ['武曲', '貪狼', '天梁', '文曲'],
    庚: ['太陽', '武曲', '太陰', '天同'],
    辛: ['巨門', '太陽', '文曲', '文昌'],
    壬: ['天梁', '紫微', '左輔', '武曲'],
    癸: ['破軍', '巨門', '太陰', '貪狼'],
  };
  const HUA = ['祿', '權', '科', '忌'];
  const LUCUN = { 甲: 2, 乙: 3, 丙: 5, 丁: 6, 戊: 5, 己: 6, 庚: 8, 辛: 9, 壬: 11, 癸: 0 };

  const mod = (n, m) => ((n % m) + m) % m;

  /** 國曆 → 農曆（用瀏覽器內建 Intl 中國曆，免維護對照表） */
  function solarToLunar(y, m, d) {
    const fmt = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { year: 'numeric', month: 'numeric', day: 'numeric' });
    const parts = fmt.formatToParts(new Date(y, m - 1, d, 12));
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    let mn = get('month') || '';
    const leap = mn.startsWith('閏');
    mn = mn.replace('閏', '').replace('月', '');
    const month = MONTH_NAMES[mn] || parseInt(mn, 10);
    if (!month) throw new Error('此瀏覽器無法轉換農曆，請改用新版 Chrome / Edge / Safari');
    return { year: parseInt(get('relatedYear'), 10), month, day: parseInt(get('day'), 10), leap };
  }

  /**
   * input: { name, gender:'M'|'F', y, m, d, hourBranch(0-11, 子=0), leapRule:'mid'|'this'|'next' }
   */
  function buildChart(input) {
    // 晚子時（23:00–24:00）視為次日，與課程設定一致
    const lunar = solarToLunar(input.y, input.m, input.d + (input.lateZi ? 1 : 0));
    let month = lunar.month;
    if (lunar.leap) {
      const rule = input.leapRule || 'mid';
      if (rule === 'next' || (rule === 'mid' && lunar.day > 15)) month = month === 12 ? 1 : month + 1;
    }
    const day = lunar.day;
    const h = input.hourBranch;
    const yStem = mod(lunar.year - 4, 10);
    const yBranch = mod(lunar.year - 4, 12);
    const yStemName = STEMS[yStem];

    // 命宮、身宮（地支 index，子=0）
    const ming = mod(2 + (month - 1) - h, 12);
    const shen = mod(2 + (month - 1) + h, 12);

    // 宮干：五虎遁，寅宮起
    const yinStem = [2, 4, 6, 8, 0][yStem % 5];
    const stemOf = (b) => (yinStem + mod(b - 2, 12)) % 10;

    // 五行局
    const mStem = stemOf(ming);
    const a = Math.floor(mStem / 2) + 1;
    const bMap = [1, 1, 2, 2, 3, 3, 1, 1, 2, 2, 3, 3];
    let s = a + bMap[ming];
    if (s > 5) s -= 5;
    const [juName, ju] = JU[s];

    // 紫微星位置
    let x = 0;
    while ((day + x) % ju !== 0) x++;
    const q = (day + x) / ju;
    const ziwei = mod(2 + (q - 1) + (x % 2 === 0 ? x : -x), 12);
    const tianfu = mod(4 - ziwei, 12);

    const at = Array.from({ length: 12 }, () => []);
    const put = (name, pos) => at[mod(pos, 12)].push(name);
    [['紫微', 0], ['天機', -1], ['太陽', -3], ['武曲', -4], ['天同', -5], ['廉貞', -8]].forEach(([n, o]) => put(n, ziwei + o));
    [['天府', 0], ['太陰', 1], ['貪狼', 2], ['巨門', 3], ['天相', 4], ['天梁', 5], ['七殺', 6], ['破軍', 10]].forEach(([n, o]) => put(n, tianfu + o));

    // 輔佐星
    const minorAt = Array.from({ length: 12 }, () => []);
    const putM = (name, pos) => minorAt[mod(pos, 12)].push(name);
    putM('左輔', 4 + (month - 1));
    putM('右弼', 10 - (month - 1));
    putM('文昌', 10 - h);
    putM('文曲', 4 + h);
    const lc = LUCUN[yStemName];
    putM('祿存', lc);
    putM('擎羊', lc + 1);
    putM('陀羅', lc - 1);
    // 天魁、天鉞（依年干）
    const kuiYue = { 甲: [1, 7], 戊: [1, 7], 庚: [1, 7], 乙: [0, 8], 己: [0, 8], 丙: [11, 9], 丁: [11, 9], 壬: [3, 5], 癸: [3, 5], 辛: [2, 6] }[yStemName];
    putM('天魁', kuiYue[0]);
    putM('天鉞', kuiYue[1]);
    // 地劫（亥起子時順數）、地空（亥起子時逆數）
    putM('地劫', 11 + h);
    putM('地空', 11 - h);
    // 火星、鈴星（依年支三合局起點，再順數時辰）
    const fireStart = { 申子辰: [2, 10], 寅午戌: [1, 3], 巳酉丑: [3, 10], 亥卯未: [9, 10] };
    const grp = ['申子辰', '寅午戌', '巳酉丑', '亥卯未'].find((k) => k.includes(BRANCHES[yBranch]));
    putM('火星', fireStart[grp][0] + h);
    putM('鈴星', fireStart[grp][1] + h);
    // 天馬（年支三合局的驛馬）
    putM('天馬', { 申子辰: 2, 寅午戌: 8, 巳酉丑: 11, 亥卯未: 5 }[grp]);
    // 紅鸞（卯起子年逆數）、天喜（對宮）
    const hong = mod(3 - yBranch, 12);
    putM('紅鸞', hong);
    putM('天喜', hong + 6);
    // 天姚（丑起正月順數）、天刑（酉起正月順數）、咸池（年支三合局）
    putM('天姚', 1 + (month - 1));
    putM('天刑', 9 + (month - 1));
    putM('咸池', { 申子辰: 9, 寅午戌: 3, 巳酉丑: 6, 亥卯未: 0 }[grp]);

    // 四化
    const sihua = SIHUA[yStemName];
    const huaOf = (n) => {
      const i = sihua.indexOf(n);
      return i < 0 ? '' : HUA[i];
    };

    // 大限：陽男陰女順行，陰男陽女逆行
    const forward = (yStem % 2 === 0) === (input.gender === 'M');

    const palaces = Array.from({ length: 12 }, (_, b) => {
      const rel = mod(ming - b, 12); // 命宮往逆時針數
      const k = forward ? mod(b - ming, 12) : mod(ming - b, 12);
      return {
        branch: BRANCHES[b],
        stem: STEMS[stemOf(b)],
        name: PALACE_NAMES[rel],
        isShen: b === shen,
        stars: at[b].concat(minorAt[b]).map((n) => ({ n, h: huaOf(n) })),
        daxian: [ju + k * 10, ju + k * 10 + 9],
        note: '',
      };
    });

    return {
      name: input.name || '',
      gender: input.gender,
      solar: { y: input.y, m: input.m, d: input.d, h, late: !!input.lateZi },
      lunar: { year: lunar.year, month: lunar.month, day: lunar.day, leap: lunar.leap, usedMonth: month },
      yearGanzhi: yStemName + BRANCHES[yBranch],
      juName,
      ju,
      mingZhu: ['貪狼', '巨門', '祿存', '文曲', '廉貞', '武曲', '破軍', '武曲', '廉貞', '文曲', '祿存', '巨門'][ming],
      shenZhu: ['火星', '天相', '天梁', '天同', '文昌', '天機', '火星', '天相', '天梁', '天同', '文昌', '天機'][yBranch],
      sihua: sihua.map((n, i) => n + '化' + HUA[i]),
      palaces,
      note: '',
    };
  }

  const api = { STEMS, BRANCHES, PALACE_NAMES, MAIN_STARS, SIHUA, solarToLunar, buildChart };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Ziwei = api;
})(typeof window !== 'undefined' ? window : globalThis);
