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
