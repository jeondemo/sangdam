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
  const m = s.match(/[가나다]/);
  if (m) return m[0] + '군';
  if (s.includes('추가')) return '추가';
  if (s.includes('정시1') || s.includes('정시2')) return '전문대';
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

const key3 = v => (v == null ? '' : v.toFixed(3));

export function parseHistory(workbook, XLSX) {
  const persons = new Map();
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
      const pk = `${year}/${key3(g[0])}|${key3(g[1])}`;

      let p = persons.get(pk);
      if (!p) {
        p = { pk, y: year, g: null, gj: null, csat: null };
        persons.set(pk, p);
      }
      if (isSusi && !p.g) p.g = g;
      if (isJeongsi) { if (!p.gj) p.gj = g; if (!p.g) p.g = g; }

      const csat = {};
      let hasCsat = false;
      for (const [k, colName] of Object.entries(CSAT_FIELDS)) {
        const v = num(at(row, colName));
        csat[k] = v;
        if (v != null) hasCsat = true;
      }
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

function findRosterCols(rows) {
  const width = Math.max(...rows.slice(0, 5).map(r => (r ? r.length : 0)));
  const g3 = forwardFill(rows[2], width);
  const g4 = forwardFill(rows[3], width);
  const r5 = rows[4] || [];
  const pick = (group, sub) => {
    for (let i = 0; i < width; i++) {
      if (clean(r5[i]) !== '9등급') continue;
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
    ko: pick('국', null), ma: pick('수', null),
    en: pick('영', null), so: pick('사', null), sc: pick('과', null),
  };
  for (const k of Object.keys(c)) if (c[k] < 0) c[k] = ROSTER_FALLBACK[k];
  return c;
}

export function parseRoster(workbook, XLSX) {
  const name = workbook.SheetNames.includes('analysis') ? 'analysis' : workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1, raw: true, defval: null, blankrows: true,
  });
  const c = findRosterCols(rows);
  const out = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] || [];
    const nm = clean(row[3]);
    const all = num(row[c.all]);
    if (!nm || all == null) continue;
    out.push({
      r: num(row[0]), c: num(row[1]), no: num(row[2]), nm,
      g: [num(row[c.g1]), num(row[c.g2]), num(row[c.g3]), all],
      s: [num(row[c.ko]), num(row[c.ma]), num(row[c.en]), num(row[c.so]), num(row[c.sc])],
    });
  }
  out.sort((a, b) => (a.c - b.c) || (a.no - b.no));
  return { students: out, meta: { n: out.length, loadedAt: Date.now() } };
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
      if (!row.metric) row.metric = row.pct70 != null ? 'pct70' : row.pct50 != null ? 'pctAvg' : row.gradeAvg != null ? 'grade' : row.conv70 != null ? 'conv' : 'none';
      row.gy = gyeyeol(dept);
      rows.push(row);
    }
  }
  const univs = [...new Set(rows.map(r => r.univ))];
  const years = [...new Set(rows.map(r => r.year).filter(Boolean))].sort();
  return { rows, meta: { n: rows.length, nUniv: univs.length, univs, years, loadedAt: Date.now() } };
}
