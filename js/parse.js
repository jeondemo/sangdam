/* 엑셀 파싱 — 브라우저에서만 실행됩니다. 파일은 서버로 전송되지 않습니다. */

const NULLS = new Set(['', 'nan', 'null', 'undefined', '#N/A', '#VALUE!', '#REF!', '-', '–']);

export function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return NULLS.has(s) ? null : s;
}

export function num(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v * 1000) / 1000;
  if (typeof v === 'string') {
    const s = v.trim();
    if (NULLS.has(s)) return null;
    const n = Number(s);
    if (isFinite(n)) return Math.round(n * 1000) / 1000;
  }
  return null;
}

/* ── 계열 분류 ───────────────────────────────────────── */

const MED = ['의예', '치의', '한의', '약학', '수의', '간호', '의학', '제약', '임상병리', '물리치료',
  '작업치료', '방사선', '치위생', '응급구조', '보건', '재활', '안경광학', '치기공', '의료'];
const ART = ['체육', '음악', '미술', '디자인', '무용', '연극', '영화', '실용음악', '예술', '스포츠',
  '회화', '조소', '공예', '뷰티', '태권도', '골프', '댄스', '성악', '피아노', '관현악', '작곡',
  '연기', '모델', '만화', '애니', '사진', '도예', '조형', '국악'];
const NAT = ['공학', '공과', '전자', '전기', '기계', '컴퓨터', '소프트웨어', '정보', '통신', '화학',
  '생명', '물리', '수학', '통계', '건축', '토목', '환경', '신소재', '재료', '산업공', '에너지',
  '반도체', 'AI', '인공지능', '데이터', '바이오', '식품', '농', '원예', '산림', '조경', '해양',
  '항공', '자동차', '로봇', '나노', '우주', '지구', '천문', '시스템', '메카트로', '제어', '섬유',
  '고분자', '반려동물', '동물', '축산', '스마트팜', '보안', '게임', '클라우드', '빅데이터',
  '융합공', '자연'];

export const GYEYEOL = ['인문사회', '자연공학', '의약보건', '예체능', '미분류'];

export function gyeyeol(dept) {
  if (!dept) return 4;
  for (const k of MED) if (dept.includes(k)) return 2;
  for (const k of ART) if (dept.includes(k)) return 3;
  for (const k of NAT) if (dept.includes(k)) return 1;
  return 0;
}

/* ── 표기 정규화 ─────────────────────────────────────── */

function normResult(v) {
  const s = clean(v);
  if (!s) return null;
  if (s.startsWith('합')) return '합격';
  if (s.startsWith('추')) return '추합';
  if (s.startsWith('불')) return '불합';
  return null;
}

function normFirst(v) {
  const s = clean(v);
  if (!s) return null;
  const t = s.replace(/\s/g, '');
  if (t.startsWith('1차합')) return '1차합격';
  if (t.startsWith('1차불')) return '1차불합';
  if (t === '합') return '1차합격';
  if (t === '불' || t === '불합') return '1차불합';
  return null;
}

function normMin(v) {
  const s = clean(v);
  if (!s) return null;
  const c = s[0];
  if (c === '충') return '충족';
  if (c === '미' || c === '부' || c === '불') return '미충족';
  return null;
}

function normGroup(v) {
  const s = clean(v) || '';
  /* 「추가」의 '가'가 가군으로 읽히지 않도록 먼저 봅니다. */
  if (s.includes('추가')) return '추가';
  if (s.includes('정시1') || s.includes('정시2')) return '전문대';
  const m = s.match(/[가나다]/);
  if (m) return m[0] + '군';
  return null;
}

/* ── 헤더 조립 ───────────────────────────────────────── */

function forwardFill(row, width) {
  const out = [];
  let cur = null;
  for (let i = 0; i < width; i++) {
    const v = clean(row?.[i]);
    if (v) cur = v;
    out.push(cur);
  }
  return out;
}

function buildHeader(rows) {
  const width = Math.max(...rows.slice(0, 5).map(r => (r ? r.length : 0)));
  const g3 = forwardFill(rows[2], width);
  const g4 = forwardFill(rows[3], width);
  const r5 = rows[4] || [];
  const cols = [];
  for (let i = 0; i < width; i++) {
    /* 원본 머리글에 줄바꿈이 섞여 있습니다(예: "예비\n번호").
       공백을 모두 없애야 '예비번호'로 찾을 수 있습니다. */
    const base = (clean(r5[i]) || '').replace(/\s+/g, '');
    const top = g3[i];
    const mid = g4[i] || '';
    if (top === '내신') cols.push(`내신_${mid}_${base}`);
    else if (top === '수능') cols.push(`수능_${mid}_${base}`);
    else cols.push(base);
  }
  return cols;
}

/* ── 5개년 지원결과 ──────────────────────────────────── */

const G_ALL = '내신_전_교과';
const G1 = '내신_1_학년', G2 = '내신_2_학년', G3 = '내신_3_학년';
const G_MS = '내신_국수_영사', G_MN = '내신_국수_영과';

const CSAT_FIELDS = {
  k: '수능_등급_국', m: '수능_등급_수', e: '수능_등급_영',
  s1: '수능_등급_탐1', s2: '수능_등급_탐2', h: '수능_등급_한',
  pk: '수능_백분위_국', pm: '수능_백분위_수', ps1: '수능_백분위_탐1', ps2: '수능_백분위_탐2',
  sk: '수능_표준점수_국', sm: '수능_표준점수_수', ss1: '수능_표준점수_탐1', ss2: '수능_표준점수_탐2',
};

/* 사람 구분 — 이름이 없으므로 「학년도 + 1·2학년 내신」으로 같은 사람을 찾습니다.
   수시 시트는 소수 2자리(3.87), 정시 시트는 3자리(3.865)로 적혀 있어 반올림·절사 두 가지로 맞춰 봅니다.
   1·2학년이 같은 다른 학생은 수능 성적(없으면 전교과)으로 갈라 둡니다. */
const key2 = v => (v == null ? '' : v.toFixed(2));
const key2t = v => (v == null ? '' : (Math.floor(v * 100 + 1e-6) / 100).toFixed(2));
const sameNum = (a, b) => a == null || b == null || Math.abs(a - b) < 0.006;
function sameCsat(a, b) {
  for (const k of Object.keys(b)) if (a[k] != null && b[k] != null && a[k] !== b[k]) return false;
  return true;
}

export function parseHistory(workbook, XLSX) {
  const persons = new Map();
  const prim = new Map();      // 학년도/1학년|2학년 → 후보 사람들
  let seq = 0;
  const apps = [];
  const mincond = {};
  const sheetInfo = [];

  for (const name of workbook.SheetNames) {
    const ym = name.match(/(\d{4})/);
    if (!ym) continue;
    const isSusi = name.includes('수시');
    const isJeongsi = name.includes('정시');
    if (!isSusi && !isJeongsi) continue;

    const year = Number(ym[1]);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1, raw: true, defval: null, blankrows: true,
    });
    if (rows.length < 6) continue;

    const cols = buildHeader(rows);
    const at = (row, colName) => {
      const i = cols.indexOf(colName);
      return i < 0 ? null : row[i];
    };
    const condCol = cols.findIndex(c => c && c.includes('최저조건'));

    let n = 0;
    for (let r = 5; r < rows.length; r++) {
      const row = rows[r] || [];
      const univ = clean(at(row, '지원대학'));
      if (!univ) continue;

      const g = [num(at(row, G1)), num(at(row, G2)), num(at(row, G3)),
        num(at(row, G_ALL)), num(at(row, G_MS)), num(at(row, G_MN))];

      /* 수능 — 등급·백분위·표준점수는 0이 나올 수 없으므로 0은 미응시(빈칸)로 봅니다. */
      const csat = {};
      let hasCsat = false;
      for (const [k, colName] of Object.entries(CSAT_FIELDS)) {
        let v = num(at(row, colName));
        if (v === 0) v = null;
        csat[k] = v;
        if (v != null) hasCsat = true;
      }

      const prims = [...new Set([
        `${year}/${key2(g[0])}|${key2(g[1])}`, `${year}/${key2t(g[0])}|${key2(g[1])}`,
        `${year}/${key2(g[0])}|${key2t(g[1])}`, `${year}/${key2t(g[0])}|${key2t(g[1])}`,
      ])];
      /* 같은 시트(수시끼리·정시끼리)에서는 전교과까지 같아야 같은 사람입니다.
         수시 시트와 정시 시트는 3학년 반영 범위가 달라 전교과가 다를 수 있으므로 서로 비교하지 않습니다. */
      let p = null;
      for (const k of prims) {
        for (const cand of prim.get(k) || []) {
          if (hasCsat && cand.csat && !sameCsat(cand.csat, csat)) continue;
          const same = isSusi ? cand.gs : cand.gj;
          if (same && !sameNum(same[3], g[3])) continue;
          p = cand; break;
        }
        if (p) break;
      }
      if (!p) {
        p = { pk: `${prims[0]}#${seq++}`, y: year, g: null, gj: null, gs: null, csat: null };
        persons.set(p.pk, p);
        for (const k of prims) { if (!prim.has(k)) prim.set(k, []); prim.get(k).push(p); }
      }
      const pk = p.pk;
      if (isSusi) { if (!p.gs) p.gs = g; if (!p.g) p.g = g; }
      if (isJeongsi) { if (!p.gj) p.gj = g; if (!p.g) p.g = g; }

      if (hasCsat) {
        if (!p.csat) p.csat = csat;
        else for (const k of Object.keys(csat)) if (p.csat[k] == null && csat[k] != null) p.csat[k] = csat[k];
      }

      const dept = clean(at(row, '지원학과명'));
      const type = clean(at(row, '전형구분'));

      if (isSusi) {
        apps.push({
          pk, y: year, ph: 0,
          cat: (clean(at(row, '구분')) || '일반').startsWith('일') ? 0 : 1,
          track: clean(at(row, '전형방법')),
          type, univ, dept, gy: gyeyeol(dept),
          first: normFirst(at(row, '1차')),
          wait: clean(at(row, '예비번호')),
          res: normResult(at(row, '최종')),
          min: normMin(at(row, '최저')),
          grp: null,
        });
        if (condCol >= 0) {
          const cond = clean(row[condCol]);
          if (cond) mincond[`${univ}|${type}|${dept}`] = cond;
        }
      } else {
        const when = clean(at(row, '모집시기')) || type;
        apps.push({
          pk, y: year, ph: 1,
          cat: (clean(at(row, '구분')) || '일반').startsWith('일') ? 0 : 1,
          track: '정시', type: when, univ, dept, gy: gyeyeol(dept),
          first: null, wait: clean(at(row, '예비번호')),
          res: normResult(at(row, '최종')),
          min: null, grp: normGroup(when),
        });
      }
      n++;
    }
    sheetInfo.push({ name, year, phase: isSusi ? '수시' : '정시', rows: n });
  }

  const years = [...new Set(sheetInfo.map(s => s.year))].sort();
  return {
    persons: [...persons.values()],
    apps,
    mincond,
    meta: { years, sheets: sheetInfo, nApps: apps.length, nPersons: persons.size, loadedAt: Date.now() },
  };
}

/* ── 현 3학년 학생부성적표 ───────────────────────────── */

/* 성적표는 과목마다 5등급 / 9등급 두 칸이 있으나 학년별·전교과의 5등급 칸은 비어 있습니다.
   9등급 칸만 사용합니다. 열 위치는 헤더에서 찾고, 못 찾으면 고정 위치로 넘어갑니다. */
const ROSTER_FALLBACK = { g1: 5, g2: 7, g3: 9, all: 11, ko: 13, ma: 15, en: 17, so: 19, sc: 21 };

/* 성적표 맨 뒤의 묶음 교과 — 김영일 컨설팅에서 받을 때 고른 조합만 채워져 옵니다.
   비어 있는 파일도 많아, 있으면 쓰고 없으면 교과별 등급을 그대로 보여 줍니다. */
const ROSTER_COMBO = ['국수영사과', '국수영사', '국수영과', '국수영', '수과'];

function findRosterCols(rows) {
  const width = Math.max(...rows.slice(0, 5).map(r => (r ? r.length : 0)));
  const g3 = forwardFill(rows[2], width);
  const g4 = forwardFill(rows[3], width);
  const r5 = rows[4] || [];
  /* 성적표는 과목마다 5등급·9등급 두 칸입니다. 어느 쪽 칸인지 지정해 찾습니다. */
  const pick = (group, sub, scale = '9등급') => {
    for (let i = 0; i < width; i++) {
      if (clean(r5[i]) !== scale) continue;
      if (sub ? g4[i] === sub : true) {
        if (g3[i] === group) return i;
      }
    }
    return -1;
  };
  const c = {
    g1: pick('기준교과(전교과)', '1학년'),
    g2: pick('기준교과(전교과)', '2학년'),
    g3: pick('기준교과(전교과)', '3학년'),
    all: pick('전교과', null),
    all5: pick('전교과', null, '5등급'),
    /* 1·2학년 성적표(5등급 세대)는 학년별 5등급 칸도 채워져 옵니다 — 화면에서 5등급을 앞세우고 9등급을 괄호로 붙입니다. */
    g15: pick('기준교과(전교과)', '1학년', '5등급'),
    g25: pick('기준교과(전교과)', '2학년', '5등급'),
    g35: pick('기준교과(전교과)', '3학년', '5등급'),
    ko: pick('국', null), ma: pick('수', null),
    en: pick('영', null), so: pick('사', null), sc: pick('과', null),
  };
  for (const k of Object.keys(c)) if (c[k] < 0 && ROSTER_FALLBACK[k] != null) c[k] = ROSTER_FALLBACK[k];
  c.ko5 = pick('국', null, '5등급');
  c.combo = {};
  for (const n of ROSTER_COMBO) {
    const i9 = pick(n, null, '9등급'), i5 = pick(n, null, '5등급');
    if (i9 >= 0 || i5 >= 0) c.combo[n] = { g9: i9, g5: i5 };
  }
  return c;
}

/* 3학년(9등급 세대) 성적표는 머리글만 2학년과 같은 「5등급/9등급」 쌍 템플릿이고,
   실제 내용은 국·수·영·사·과·수과·국수영·국수영사·국수영과·국수영사과 9등급 열 열 개가
   「국 5등급」 자리부터 차례로 들어 있습니다. 머리글을 믿으면 국 자리에 수학이 들어가므로
   내용을 보고 판별합니다: 「5등급」 칸에 5보다 큰 값이 있거나, 5등급 전교과·묶음 교과가 전부 비었으면 이 배치입니다. */
function detectSingle9(rows, c) {
  if (c.ko5 < 0) return false;
  let ko5Has = false, over5 = false, any5 = false, anyCombo = false;
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] || [];
    const v = num(row[c.ko5]);
    if (v != null) { ko5Has = true; if (v > 5.01) over5 = true; }
    if (c.all5 >= 0 && num(row[c.all5]) != null) any5 = true;
    for (const ix of Object.values(c.combo)) if ((ix.g9 >= 0 && num(row[ix.g9]) != null) || (ix.g5 >= 0 && num(row[ix.g5]) != null)) anyCombo = true;
  }
  return over5 || (ko5Has && !any5 && !anyCombo);
}

function applySingle9(c) {
  const s = c.ko5;
  const out = { ...c, ko: s, ma: s + 1, en: s + 2, so: s + 3, sc: s + 4, all5: -1, g15: -1, g25: -1, g35: -1, single9: true, combo: {} };
  [['수과', 5], ['국수영', 6], ['국수영사', 7], ['국수영과', 8], ['국수영사과', 9]]
    .forEach(([n, k]) => { out.combo[n] = { g9: s + k, g5: -1 }; });
  return out;
}

/* 명단 읽기 방식의 판. 이 컴퓨터에 남아 있던 명단이 예전 판으로 읽힌 것이면 화면이 새 항목(5등급 등)을 못 보여 주므로,
   판이 다르면 「다시 올려 주세요」라고 알립니다. 읽는 내용이 바뀔 때마다 올립니다. */
export const ROSTER_PV = 3;

export function parseRoster(workbook, XLSX) {
  const name = workbook.SheetNames.includes('analysis') ? 'analysis' : workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1, raw: true, defval: null, blankrows: true,
  });
  let c = findRosterCols(rows);
  if (detectSingle9(rows, c)) c = applySingle9(c);
  const out = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] || [];
    const nm = clean(row[3]);
    const all = num(row[c.all]);
    if (!nm || all == null) continue;
    out.push({
      r: num(row[0]), c: num(row[1]), no: num(row[2]), nm,
      g: [num(row[c.g1]), num(row[c.g2]), num(row[c.g3]), all],
      a5: c.all5 >= 0 ? num(row[c.all5]) : null,
      g5: [c.g15 >= 0 ? num(row[c.g15]) : null, c.g25 >= 0 ? num(row[c.g25]) : null, c.g35 >= 0 ? num(row[c.g35]) : null,
        c.all5 >= 0 ? num(row[c.all5]) : null],
      s: [num(row[c.ko]), num(row[c.ma]), num(row[c.en]), num(row[c.so]), num(row[c.sc])],
      cb: Object.fromEntries(Object.entries(c.combo).map(([n, ix]) => [n, {
        g5: ix.g5 >= 0 ? num(row[ix.g5]) : null,
        g9: ix.g9 >= 0 ? num(row[ix.g9]) : null,
      }]).filter(([, v]) => v.g5 != null || v.g9 != null)),
    });
  }
  out.sort((a, b) => (a.c - b.c) || (a.no - b.no));
  /* 묶음 교과는 전원이 비어 있는 경우가 흔합니다. 실제로 값이 있는 것만 남깁니다. */
  const combos = ROSTER_COMBO.filter(n => out.some(s2 => s2.cb[n]));
  /* 5등급 값이 하나라도 있으면 5등급 세대(1·2학년) 성적표입니다. 화면 라벨에 씁니다. */
  const has5 = out.some(s2 => s2.a5 != null);
  return { students: out, meta: { n: out.length, combos, has5, layout: c.single9 ? 'single9' : 'pair', pv: ROSTER_PV, loadedAt: Date.now() } };
}

/* ── 학년별 반영 비중 역산 ───────────────────────────── */

/* 전교과는 이수단위 가중평균이라 학년별 단순평균과 다릅니다.
   명단 전체로 최소제곱 회귀해 실제 비중을 구합니다. */
export function gradeWeights(students) {
  const rows = students.filter(s => s.g.every(v => v != null));
  if (rows.length < 10) return null;
  const A = rows.map(s => [s.g[0] - s.g[2], s.g[1] - s.g[2]]);
  const b = rows.map(s => s.g[3] - s.g[2]);
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < A.length; i++) {
    a11 += A[i][0] * A[i][0]; a12 += A[i][0] * A[i][1]; a22 += A[i][1] * A[i][1];
    b1 += A[i][0] * b[i]; b2 += A[i][1] * b[i];
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-9) return null;
  const w1 = (b1 * a22 - b2 * a12) / det;
  const w2 = (a11 * b2 - a12 * b1) / det;
  const w3 = 1 - w1 - w2;
  let err = 0;
  for (const s of rows) err += Math.abs(w1 * s.g[0] + w2 * s.g[1] + w3 * s.g[2] - s.g[3]);
  return { w: [w1, w2, w3], mae: err / rows.length, n: rows.length };
}

/* ── 2학년 모의고사 성적표 (교육청 영역별 기준) ─────────── */

/* 확장자는 .xls 이지만 실제로는 EUC-KR HTML 표입니다.
   한 파일에 한 반이 들어오는 경우가 많아 여러 파일을 합쳐 쓸 수 있게 합니다.
   열 순서(31칸):
   순위 학급 번호 이름 | 국어(과목 원 표 백 등) | 수학(과목 원 표 백 등) | 영어(원 등) | 한국사(원 등)
   | 탐1(과목 원 표 백 등) | 탐2(과목 원 표 백 등) | 제2외국어(과목 원 등) */
export function parseMockExam(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return { students: [], meta: { n: 0 } };

  const headText = [...table.querySelectorAll('th')].map(th => th.textContent.trim()).join(' ');
  if (!/국어/.test(headText) || !/탐구/.test(headText)) return { students: [], meta: { n: 0 } };

  const out = [];
  for (const tr of table.querySelectorAll('tr')) {
    const td = [...tr.querySelectorAll('td')].map(x => x.textContent.replace(/ /g, ' ').trim());
    if (td.length < 28) continue;
    const nm = clean(td[3]);
    const c = num(td[1]), no = num(td[2]);
    if (!nm || c == null || no == null) continue;
    const g = (i) => { const v = num(td[i]); return v != null && v > 0 ? v : null; };
    out.push({
      r: num(td[0]), c, no, nm,
      grade: { k: g(8), m: g(13), e: g(15), h: g(17), s1: g(22), s2: g(27) },
      pct:   { k: g(7), m: g(12), s1: g(21), s2: g(26) },
      std:   { k: g(6), m: g(11), s1: g(20), s2: g(25) },
      raw:   { k: g(5), m: g(10), e: g(14), h: g(16), s1: g(19), s2: g(24) },
      subj:  { s1: clean(td[18]), s2: clean(td[23]) },
    });
  }
  out.sort((a, b) => (a.c - b.c) || (a.no - b.no));
  return { students: out, meta: { n: out.length, loadedAt: Date.now() } };
}

/* 여러 반 파일을 하나로 합칩니다. 같은 학급·번호는 나중 것으로 덮습니다. */
export function mergeMockExam(a, b) {
  const map = new Map();
  for (const s of [...(a?.students || []), ...(b?.students || [])]) map.set(`${s.c}-${s.no}`, s);
  const students = [...map.values()].sort((x, y) => (x.c - y.c) || (x.no - y.no));
  return { students, meta: { n: students.length, loadedAt: Date.now() } };
}

export function pctAvg(p) {
  if (!p) return null;
  const v = [p.k, p.m, p.s1, p.s2].filter(x => x != null);
  return v.length >= 3 ? v.reduce((s, x) => s + x, 0) / v.length : null;
}


/* ── 파일 이름·학급에서 학년과 시험 이름을 알아냅니다 ─────
   예) "2026년 6월 교육청 영역별 기준 수능성적표 2027학년도 과천여자고등학교 2학년.xls"
       → { grade: 2, label: '2학년 6월 교육청' }
   학년은 학급 번호(301 → 3학년)를 우선으로 하고, 없으면 파일 이름에서 찾습니다. */
export function examInfo(filename, students) {
  const name = String(filename || '');
  let grade = null;
  const counts = {};
  for (const s of students || []) {
    const c = Number(s.c);
    if (c >= 100 && c < 1000) { const g = Math.floor(c / 100); counts[g] = (counts[g] || 0) + 1; }
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top) grade = Number(top[0]);
  if (grade == null) { const m = name.match(/([1-3])\s*학년/); if (m) grade = Number(m[1]); }

  const month = (name.match(/(\d{1,2})\s*월/) || [])[1] || null;
  const org = /평가원/.test(name) ? '평가원' : /교육청/.test(name) ? '교육청' : /수능/.test(name) && !/모의/.test(name) && !month ? '수능' : null;
  const year = (name.match(/(20\d{2})\s*학년도/) || [])[1] || null;

  const parts = [];
  if (grade) parts.push(`${grade}학년`);
  if (month) parts.push(`${month}월`);
  if (org) parts.push(org);
  return { grade, month, org, year, label: parts.join(' ') || null };
}


/* ── 정시 배치기준표 (관리자가 올리는 대학별 입시결과 엑셀) ─────
   열 이름으로 찾습니다. 순서는 상관없고, 없는 열은 비워 둡니다.
   필수: 대학, 모집단위. 지표: 백분위70 / 백분위50 / 등급평균 중 하나 이상. */
const CUT_COLS = {
  univ: ['대학', '대학명'], campus: ['캠퍼스'], year: ['학년도', '연도'], group: ['군', '모집군'],
  track: ['전형', '전형명'], dept: ['모집단위', '학과', '학과명'], quota: ['모집인원', '모집'],
  ratio: ['경쟁률'], wait: ['충원', '충원순위', '예비순위', '충원인원'],
  conv50: ['환산50', '환산점수50', '환산50%컷'], conv70: ['환산70', '환산점수70', '환산70%컷'], convMax: ['환산만점', '만점'],
  pct50: ['백분위50', '백분위 50%', '백분위평균', '평균백분위'], pct70: ['백분위70', '백분위 70%', '70%컷'],
  pctKo: ['국어'], pctMa: ['수학'], pctInq: ['탐구'], gradeAvg: ['등급평균', '등급'],
  metric: ['지표'], note: ['비고', '메모'], src: ['출처'],
};

export function parseCutTable(workbook, XLSX) {
  const rows = [];
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    let hi = -1, col = null;
    for (let i = 0; i < Math.min(arr.length, 10); i++) {
      const hdr = arr[i].map(v => (clean(v) || '').replace(/\s+/g, ''));
      const found = {};
      for (const [k, names] of Object.entries(CUT_COLS)) {
        const j = hdr.findIndex(h => names.some(n => h === n.replace(/\s+/g, '') || (n.length > 2 && h.startsWith(n))));
        if (j >= 0) found[k] = j;
      }
      if (found.univ != null && found.dept != null) { hi = i; col = found; break; }
    }
    if (hi < 0) continue;
    for (let i = hi + 1; i < arr.length; i++) {
      const r = arr[i];
      const g = k => (col[k] == null ? null : r[col[k]]);
      const univ = clean(g('univ')), dept = clean(g('dept'));
      if (!univ || !dept) continue;
      const row = {
        univ, dept, campus: clean(g('campus')) || '', year: num(g('year')), group: (clean(g('group')) || '').replace('군', ''),
        track: clean(g('track')) || '', quota: num(g('quota')), ratio: num(g('ratio')), wait: clean(g('wait')),
        conv50: num(g('conv50')), conv70: num(g('conv70')), convMax: num(g('convMax')),
        pct50: num(g('pct50')), pct70: num(g('pct70')), pctKo: num(g('pctKo')), pctMa: num(g('pctMa')), pctInq: num(g('pctInq')),
        gradeAvg: num(g('gradeAvg')), metric: clean(g('metric')) || '', note: clean(g('note')) || '', src: clean(g('src')) || '',
      };
      /* 지표 칸에 한글로 적어도 알아듣게 — 「등급」「평균」「70%컷」「우리 학교」. 모르는 값은 비운 것과 같이 다룹니다. */
      const M = { '등급': 'grade', '평균': 'pctAvg', '70%컷': 'pct70', '70%': 'pct70', '우리학교': 'school', '우리 학교': 'school', '환산': 'conv' };
      if (row.metric && M[row.metric.replace(/\s+/g, '')]) row.metric = M[row.metric.replace(/\s+/g, '')];
      if (!['pct70', 'pctAvg', 'minmax', 'grade', 'school', 'conv', 'none'].includes(row.metric)) row.metric = '';
      if (!row.metric) row.metric = row.pct70 != null ? 'pct70' : row.pct50 != null ? 'pctAvg' : row.gradeAvg != null ? 'grade' : row.conv70 != null ? 'conv' : 'none';
      row.gy = gyeyeol(dept);
      rows.push(row);
    }
  }
  const univs = [...new Set(rows.map(r => r.univ))];
  const years = [...new Set(rows.map(r => r.year).filter(Boolean))].sort();
  return { rows, meta: { n: rows.length, nUniv: univs.length, univs, years, loadedAt: Date.now() } };
}

/* ── 선택과목 자료 ─────────────────────────────────────
   관리자가 올리는 「선택과목.xlsx」를 읽습니다. 시트 이름으로 찾고,
   열은 머리글 문구로 찾아서 열 순서가 바뀌어도 견딥니다. */

const SEL_SHEETS = {
  field: ['학문분야', '학문 분야'],
  rec: ['권장과목'],
  cond: ['분야별조건', '분야별 조건'],
  cur: ['우리학교과목', '우리 학교 과목'],
  miss: ['미개설과목', '미개설 과목'],
  unit: ['대학별원문', '대학별 원문'],
  guide: ['분야안내', '분야 안내'],
  gcommon: ['공통안내', '공통 안내'],
};

function sheetRows(wb, XLSX, names) {
  const nm = wb.SheetNames.find(s => names.some(n => s.replace(/\s+/g, '') === n.replace(/\s+/g, '')));
  if (!nm) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, blankrows: false, defval: null });
}

/* 머리글 행을 찾아 {열이름:인덱스} 를 만듭니다. */
function headMap(arr, need) {
  for (let i = 0; i < Math.min(arr.length, 8); i++) {
    const hdr = (arr[i] || []).map(v => (clean(v) || '').replace(/\s+/g, ''));
    const col = {};
    for (const [k, names] of Object.entries(need)) {
      const j = hdr.findIndex(h => names.some(n => h === n.replace(/\s+/g, '') || h.startsWith(n.replace(/\s+/g, ''))));
      if (j >= 0) col[k] = j;
    }
    if (Object.keys(col).length >= Math.ceil(Object.keys(need).length * 0.6)) return { hi: i, col };
  }
  return null;
}

export function parseSubjectTable(workbook, XLSX) {
  const get = (arr, col, k) => (col[k] == null ? null : clean(arr[col[k]]));
  const out = { fields: {}, order: [], school: { common: [], groups: [], extra: [] }, missing: [] };

  /* 1) 학문분야 */
  let a = sheetRows(workbook, XLSX, SEL_SHEETS.field);
  if (!a) throw new Error('「학문분야」 시트를 찾지 못했습니다.');
  let h = headMap(a, { gy: ['계열'], name: ['학문분야'], nOwn: ['근거대학수'], nGen: ['계열단위근거'], snu: ['서울대유형'], pref: ['서울대우선'], memo: ['학교메모'] });
  if (!h) throw new Error('「학문분야」 시트의 머리글을 읽지 못했습니다.');
  for (let i = h.hi + 1; i < a.length; i++) {
    const name = get(a[i], h.col, 'name');
    if (!name) continue;
    out.fields[name] = {
      name, gy: get(a[i], h.col, 'gy') || '', nOwn: num(a[i][h.col.nOwn]) || 0, nGen: num(a[i][h.col.nGen]) || 0,
      snu: get(a[i], h.col, 'snu') === '해당 없음' ? '' : (get(a[i], h.col, 'snu') || ''),
      pref: get(a[i], h.col, 'pref') || '', memo: get(a[i], h.col, 'memo') || '', subs: {},
      notes: [],
    };
    out.order.push(name);
  }

  /* 2) 권장과목 */
  a = sheetRows(workbook, XLSX, SEL_SHEETS.rec);
  if (!a) throw new Error('「권장과목」 시트를 찾지 못했습니다.');
  /* 대학 수는 등급 칸마다 따로 있습니다 — 그 과목이 받은 등급의 칸을 씁니다. */
  h = headMap(a, { name: ['학문분야'], sub: ['과목'], tier: ['최종등급'], u: ['근거대학'], open: ['우리학교개설'],
    core: ['핵심(학과)'], rec: ['권장(학과)'], gen: ['계열공통'], genrec: ['계열권장'] });
  const TIER = { '핵심': 'core', '권장': 'rec', '계열 공통': 'gen', '계열공통': 'gen', '계열 권장': 'genrec', '계열권장': 'genrec' };
  let nRec = 0;
  for (let i = h.hi + 1; i < a.length; i++) {
    const f = out.fields[get(a[i], h.col, 'name')], sub = get(a[i], h.col, 'sub');
    if (!f || !sub) continue;
    const t = TIER[(get(a[i], h.col, 'tier') || '').replace(/\s+/g, '')] || TIER[get(a[i], h.col, 'tier')];
    if (!t) continue;
    const nOf = k => (h.col[k] == null ? 0 : num(a[i][h.col[k]]) || 0);
    f.subs[sub] = { t, n: nOf(t) || Math.max(nOf('core'), nOf('rec'), nOf('gen'), nOf('genrec')), u: (get(a[i], h.col, 'u') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 5), area: get(a[i], h.col, 'open') === '교과군' };
    nRec++;
  }

  /* 3) 분야별 조건 */
  a = sheetRows(workbook, XLSX, SEL_SHEETS.cond);
  if (a) {
    h = headMap(a, { name: ['학문분야'], univ: ['대학'], txt: ['조건'] });
    if (h) for (let i = h.hi + 1; i < a.length; i++) {
      const f = out.fields[get(a[i], h.col, 'name')], txt = get(a[i], h.col, 'txt');
      if (!f || !txt || txt.length < 8) continue;
      if (f.notes.length < 8 && !f.notes.some(x => x.t === txt)) f.notes.push({ u: get(a[i], h.col, 'univ') || '', t: txt });
    }
  }

  /* 4) 우리 학교 과목 */
  a = sheetRows(workbook, XLSX, SEL_SHEETS.cur);
  if (!a) throw new Error('「우리학교과목」 시트를 찾지 못했습니다.');
  h = headMap(a, { sub: ['과목'], area: ['교과'], kind: ['과목구분'], sem: ['학기'], grp: ['묶음'], pick: ['택N', '택'], target: ['대상'], note: ['비고'] });
  const gmap = new Map();
  for (let i = h.hi + 1; i < a.length; i++) {
    const sub = get(a[i], h.col, 'sub');
    if (!sub) continue;
    const sem = get(a[i], h.col, 'sem') || '', grp = get(a[i], h.col, 'grp') || '';
    const rec = { s: sub, area: get(a[i], h.col, 'area') || '', kind: get(a[i], h.col, 'kind') || '', target: get(a[i], h.col, 'target') || '' };
    if (grp === '공통') { out.school.common.push({ ...rec, sem }); continue; }
    if (grp === '공동교육과정') { out.school.extra.push({ ...rec, sem, note: get(a[i], h.col, 'note') || '' }); continue; }
    const key = sem + '|' + grp;
    if (!gmap.has(key)) gmap.set(key, { sem, g: grp, pick: num(a[i][h.col.pick]) || 1, subs: [], only2: [] });
    const G = gmap.get(key);
    (rec.target === '현2학년만' ? G.only2 : G.subs).push(sub);
  }
  out.school.groups = [...gmap.values()];
  out.school.kind = {}; out.school.area = {};
  for (const r of [...out.school.common, ...out.school.extra]) { out.school.kind[r.s] = r.kind; out.school.area[r.s] = r.area; }
  for (let i = h.hi + 1; i < a.length; i++) {
    const sub = get(a[i], h.col, 'sub');
    if (sub) { out.school.kind[sub] = get(a[i], h.col, 'kind') || ''; out.school.area[sub] = get(a[i], h.col, 'area') || ''; }
  }

  /* 5) 미개설 */
  a = sheetRows(workbook, XLSX, SEL_SHEETS.miss);
  if (a) {
    h = headMap(a, { sub: ['과목'], f: ['이과목을권장한분야', '권장한분야'], tier: ['최고등급', '등급'], n: ['근거대학수'], alt: ['대안'] });
    if (h) for (let i = h.hi + 1; i < a.length; i++) {
      const sub = get(a[i], h.col, 'sub');
      if (!sub) continue;
      out.missing.push({ s: sub, r: get(a[i], h.col, 'tier') || '', n: num(a[i][h.col.n]) || 0,
        f: (get(a[i], h.col, 'f') || '').split(',').map(x => x.trim()).filter(Boolean),
        alt: h.col.alt != null ? (get(a[i], h.col, 'alt') || '') : '' });
    }
  }

  /* 6) 대학별 원문 — 「이 조합으로 대학 보기」가 쓰는 표입니다.
        같은 대학·모집단위가 학문분야마다 되풀이되므로 요구 과목이 같으면 한 줄로 묶습니다. */
  out.units = [];
  a = sheetRows(workbook, XLSX, SEL_SHEETS.unit);
  if (a) {
    h = headMap(a, { u: ['대학'], d: ['모집단위'], f: ['학문분야'], core: ['핵심과목'], rec: ['권장과목'], note: ['비고'] });
    if (h) {
      const seen = new Map();
      for (let i = h.hi + 1; i < a.length; i++) {
        const u = get(a[i], h.col, 'u'), d = get(a[i], h.col, 'd');
        if (!u || !d) continue;
        const core = get(a[i], h.col, 'core') || '', rec = get(a[i], h.col, 'rec') || '';
        const key = `${u}|${d}|${core}|${rec}`;
        const f = get(a[i], h.col, 'f') || '';
        if (seen.has(key)) { const r = seen.get(key); if (f && !r.f.includes(f)) r.f.push(f); continue; }
        const row = { u, d, core, rec, note: get(a[i], h.col, 'note') || '', f: f ? [f] : [] };
        seen.set(key, row); out.units.push(row);
      }
    }
  }

  /* 7) 분야 안내·공통 안내 — 없어도 되는 시트입니다. 한 칸에 여러 줄이면 줄마다 문장 하나입니다.
        줄 앞 ●◐○◆ 는 화면에서 꼬리표(대학 원문·대학 안내서·강의 정리·학교 편제)가 됩니다. */
  const lines = v => String(v ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 12);
  let nGuide = 0;
  a = sheetRows(workbook, XLSX, SEL_SHEETS.guide);
  if (a) {
    h = headMap(a, { name: ['학문분야'], see: ['대학이보는것'], miss: ['흔한실수'], src: ['출처'] });
    if (h) for (let i = h.hi + 1; i < a.length; i++) {
      const f = out.fields[get(a[i], h.col, 'name')];
      if (!f) continue;
      const see = lines(h.col.see != null ? a[i][h.col.see] : ''), miss = lines(h.col.miss != null ? a[i][h.col.miss] : '');
      if (!see.length && !miss.length) continue;
      f.guide = { see, miss, src: get(a[i], h.col, 'src') || '' };
      nGuide++;
    }
  }
  out.guideCommon = [];
  a = sheetRows(workbook, XLSX, SEL_SHEETS.gcommon);
  if (a) {
    h = headMap(a, { t: ['제목'], body: ['내용'] });
    if (h) for (let i = h.hi + 1; i < a.length; i++) {
      const t = get(a[i], h.col, 't'), body = lines(h.col.body != null ? a[i][h.col.body] : '');
      if (t && body.length && out.guideCommon.length < 8) out.guideCommon.push({ t, body });
    }
  }

  const nF = out.order.length;
  if (!nF || !nRec) throw new Error('선택과목 자료를 읽지 못했습니다. 시트 이름과 머리글을 확인해 주세요.');
  return { fields: out.fields, order: out.order, school: out.school, missing: out.missing, units: out.units,
    guideCommon: out.guideCommon,
    meta: { nField: nF, nRec, nGuide, nSub: Object.keys(out.school.kind).length,
      nUnit: out.units.length, nUniv: new Set(out.units.map(x => x.u)).size, loadedAt: Date.now() } };
}

/* ── 학생 선택 결과 (학교 파일) ───────────────────────
   이름이 들어 있는 파일입니다. 브라우저 안에서만 읽고 서버로 보내지 않습니다. */

export function parseSubjectChoice(workbook, XLSX, filename) {
  const out = [];
  for (const nm of workbook.SheetNames) {
    const arr = XLSX.utils.sheet_to_json(workbook.Sheets[nm], { header: 1, blankrows: false, defval: null });
    if (!arr.length) continue;
    const txt = nm + ' ' + (filename || '');
    const mg = /([1-3])\s*학년/.exec(txt), ms = /([12])\s*학기/.exec(txt);
    /* 학년도 — 파일·시트 이름의 「2026년」. 없으면 올해(3월 이후) 또는 작년(1·2월)으로 봅니다. */
    const my = /(20\d{2})\s*(년|학년도)/.exec(txt);
    const now = new Date();
    const year = my ? Number(my[1]) : (now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1);
    let hi = -1, col = {};
    for (let i = 0; i < Math.min(arr.length, 8); i++) {
      const hdr = (arr[i] || []).map(v => (clean(v) || '').replace(/\s+/g, ''));
      const j = hdr.findIndex(h => h === '이름' || h === '성명');
      if (j < 0) continue;
      hi = i;
      /* 학급·번호 열 — 「반/번」 또는 「신반/신번」(올해 반·번호). 「구학번」(10401 = 작년 1학년 4반 1번)은
         올해 반·번호가 없을 때만 학번으로 씁니다. 학번·반·번호 열은 과목으로 세지 않습니다. */
      const find = re => hdr.findIndex(h => re.test(h));
      col = {
        nm: j,
        cls: find(/^(신)?반$/), no: find(/^(신)?(번|번호)$/),
        sid: find(/^(신)?학번$/) >= 0 ? find(/^(신)?학번$/) : find(/학번$/),
      };
      col.subs = [];
      const NOT = /^(신학번|구학번|학번|신반|신번|반|번|번호|순번|연번|No\.?|비고|합계|계|성별|학년)$/i;
      for (let k = 0; k < hdr.length; k++) {
        if (k === j || k === col.cls || k === col.no || k === col.sid) continue;
        if (hdr[k] && !NOT.test(hdr[k]) && !/학번$/.test(hdr[k])) col.subs.push([k, (clean(arr[i][k]) || '').replace(/\s+/g, ' ').trim()]);
      }
      break;
    }
    if (hi < 0 || !col.subs.length) continue;
    const students = [];
    for (let i = hi + 1; i < arr.length; i++) {
      const r = arr[i];
      const name = clean(r[col.nm]);
      if (!name || /합계|타임|과목$/.test(name)) continue;
      const sid = col.sid >= 0 ? clean(r[col.sid]) : null;
      const cls = col.cls >= 0 ? num(r[col.cls]) : (sid && sid.length >= 5 ? +sid.slice(1, 3) : null);
      const no = col.no >= 0 ? num(r[col.no]) : (sid && sid.length >= 5 ? +sid.slice(3) : null);
      if (cls == null || no == null) continue;
      const picks = {};
      for (const [k, s] of col.subs) {
        const v = clean(r[k]);
        if (v) picks[s] = String(v).trim();
      }
      if (Object.keys(picks).length) students.push({ cls, no, nm: name, picks });
    }
    if (students.length) out.push({
      sem: `${mg ? mg[1] : '2'}-${ms ? ms[1] : '1'}`, year,
      sheet: nm, n: students.length, students,
    });
  }
  if (!out.length) throw new Error('선택 결과를 읽지 못했습니다. 「이름」 열이 있는 시트인지 확인해 주세요.');
  return out;
}

/* 서버로 보내기 전에 이름을 지웁니다. 학급·번호·과목만 남습니다.
   이름은 각 선생님 컴퓨터의 학생부 명단에서 학급·번호로 다시 붙입니다. */
export function stripChoiceNames(parts) {
  return parts.map(p => ({
    sem: p.sem, year: p.year, sheet: p.sheet, n: p.n,
    students: p.students.map(st => ({ cls: st.cls, no: st.no, picks: st.picks })),
  }));
}

/* 여러 학기 파일을 하나로 — 타임·인원 집계와 학생별 이수 목록.
   과목명은 편제표 표기에 맞춰 고칩니다(띄어쓰기·로마숫자 차이 흡수). */
const ROMAN = { '1': 'Ⅰ', '2': 'Ⅱ', 'I': 'Ⅰ', 'II': 'Ⅱ', 'i': 'Ⅰ', 'ii': 'Ⅱ' };
const squash = s => String(s || '').replace(/\s+/g, '').replace(/[·・]/g, '')
  .replace(/(Ⅰ|Ⅱ|I{1,2}|1|2)$/, m => ROMAN[m] || m);

export function mergeChoice(list, sel) {
  const index = {};
  const groupOf = {};
  if (sel) {
    for (const g of sel.school.groups)
      for (const s of g.subs.concat(g.only2 || [])) { index[squash(s)] = s; groupOf[g.sem + '|' + s] = g.g; }
    for (const c of sel.school.common) { index[squash(c.s)] = c.s; groupOf[c.sem + '|' + c.s] = '공통'; }
    for (const e of sel.school.extra) index[squash(e.s)] = e.s;
  }
  const fix = s => index[squash(s)] || String(s).replace(/\s+/g, ' ').trim();

  const sem = {}, byStu = new Map();
  for (const part of list) {
    const S = sem[part.sem] = sem[part.sem] || { time: {}, count: {}, n: 0, _g: {} };
    S.n = Math.max(S.n, part.n);
    for (const st of part.students) {
      const key = `${st.cls}-${st.no}`;
      if (!byStu.has(key)) byStu.set(key, { cls: st.cls, no: st.no, nm: st.nm || '', by: {} });
      const rec = byStu.get(key);
      const names = [];
      for (const [raw, v] of Object.entries(st.picks)) {
        const s = fix(raw);
        names.push(s);
        S.count[s] = (S.count[s] || 0) + 1;
        if (/^[A-E]$/.test(v)) {
          const g = groupOf[part.sem + '|' + s] || '?';
          const G = S._g[g] = S._g[g] || {};
          (G[v] = G[v] || {})[s] = (G[v][s] || 0) + 1;
        }
      }
      rec.by[part.sem] = names;
    }
  }
  /* 교시는 묶음마다 따로입니다. 한 묶음 안에서 학생 수만큼 들어찬 표기만 진짜 교시로 봅니다. */
  for (const S of Object.values(sem)) {
    for (const [g, G] of Object.entries(S._g)) {
      if (g === '?' || g === '공통') continue;
      for (const [t, m] of Object.entries(G)) {
        const tot = Object.values(m).reduce((a, b) => a + b, 0);
        if (!S.n || tot !== S.n) continue;
        (S.time[g] = S.time[g] || {})[t] = m;
      }
    }
    delete S._g;
  }
  const students = [...byStu.values()].sort((a, b) => a.cls - b.cls || a.no - b.no);
  for (const s of students) s.taken = [...new Set(Object.values(s.by).flat())];
  const years = [...new Set(list.map(p => p.year).filter(Boolean))].sort();
  const grades = [...new Set(list.map(p => Number(String(p.sem)[0])).filter(Boolean))].sort();
  return { sem, students, meta: { n: students.length, sems: Object.keys(sem).sort(), year: years[years.length - 1] || null, grades, loadedAt: Date.now() } };
}

/* ── 정시 지원가능 자료 (.xlsb) ─────────────────────
   대학이 공개한 정시 결과와 반영 방식을 담은 파일입니다.
   계산에 쓰는 칸만 뽑고, 원본을 그대로 옮기지 않습니다. */

const JG_PICK = ['국수MAX', '국수MIN', '국수탐MAX', '국수탐MID', '국수탐MIN',
  '국수영탐MAX', '국수영탐MID1', '국수영탐MID2', '국수영탐MIN', '수탐MAX', '국탐MAX', '국탐MIN',
  '국영탐MAX', '국영탐MID', '수영탐MAX', '수영탐MID', '수영MAX', '국영MAX',
  '국영수MAX', '국영수MID', '국영수MIN'];

const JG_SHEETS = [['26정시', 2026], ['25정시', 2025], ['24정시', 2024]];

function jgRows(wb, XLSX, name) {
  const sh = wb.SheetNames.find(s => s.replace(/\s+/g, '') === name);
  if (!sh) return null;
  const a = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1, blankrows: false, defval: null });
  if (!a.length) return null;
  const h = a[0].map(v => clean(v) || '');
  const I = n => h.indexOf(n);
  const out = [];
  for (const r of a.slice(1)) {
    if (!r[1] || !r[4]) continue;
    const g = n => { const i = I(n); return i < 0 ? null : num(r[i]); };
    const rec = {
      u: clean(r[1]), g: clean(r[2]) || '', t: clean(r[3]) || '', d: clean(r[4]),
      n: g('모집인원'), comp: g('경쟁률'), wait: g('충원합격'),
      cut70: g('수능(70% cut)'), full: g('만점'),
      metric: clean(r[I('백분위/표준점수/변환표준점수/등급')]) || '',
      p50: { k: g('국(50%cut)'), m: g('수(50%cut)'), s1: g('탐1(50%cut)'), s2: g('탐2(50%cut)'), e: g('영(50%cut)'), h: g('한(50%cut)') },
      p70: { k: g('국(70%cut)'), m: g('수(70%cut)'), s1: g('탐1(70%cut)'), s2: g('탐2(70%cut)'), e: g('영(70%cut)'), h: g('한(70%cut)') },
      w: { k: g('국어'), m: g('수학'), e: g('영어'), s1: g('탐1'), s2: g('탐2'), h: g('한국사') },
      pick: {},
      eng: Array.from({ length: 9 }, (_, i) => g(`영${i + 1}`)),
      his: Array.from({ length: 9 }, (_, i) => g(`한${i + 1}`)),
      need: clean(r[I('응시과목지정')]) || '',
      bonus: clean(r[I('가산점')]) || '',
    };
    for (const c of JG_PICK) { const v = g(c); if (v != null) rec.pick[c] = v; }
    if (rec.eng.every(v => v == null)) rec.eng = null;
    if (rec.his.every(v => v == null)) rec.his = null;
    out.push(rec);
  }
  return out;
}

export function parseJeongsiFile(workbook, XLSX) {
  const years = {};
  for (const [name, y] of JG_SHEETS) {
    const rows = jgRows(workbook, XLSX, name);
    if (rows && rows.length) years[y] = rows;
  }
  const ys = Object.keys(years).map(Number).sort((a, b) => b - a);
  if (!ys.length) throw new Error('「26정시」 같은 학년도 시트를 찾지 못했습니다. 정시 지원가능 파일이 맞는지 확인해 주세요.');

  const latest = ys[0];
  const units = years[latest];
  units.forEach(r => { r.y = latest; });
  /* 지난 학년도는 컷 추이만 남깁니다 — 판정에는 최신 학년도를 씁니다.
     같은 대학·군·학과에 전형이 여럿(일반·지역균형·농어촌…)이라 전형까지 맞춰야 다른 전형의 컷이 섞이지 않습니다.
     전형명이 해마다 바뀌는 경우를 위해, 그 해에 전형이 하나뿐인 학과는 전형 없는 키로도 넣어 둡니다. */
  const key4 = r => `${r.u}|${r.g}|${r.t}|${r.d}`;
  const key3 = r => `${r.u}|${r.g}|${r.d}`;
  const trend = {};
  for (const y of ys.slice(1)) {
    const nT = {};
    for (const r of years[y]) { const k = key3(r); (nT[k] = nT[k] || new Set()).add(r.t); }
    for (const r of years[y]) {
      const v = { c: r.cut70, f: r.full, n: r.n, r: r.comp, w: r.wait };
      (trend[key4(r)] = trend[key4(r)] || {})[y] = v;
      if (nT[key3(r)].size === 1) (trend[key3(r)] = trend[key3(r)] || {})[y] = v;
    }
  }
  return {
    units, trend, year: latest, years: ys,
    meta: {
      year: latest, years: ys, n: units.length,
      nUniv: new Set(units.map(r => r.u)).size,
      loadedAt: Date.now(),
    },
  };
}
