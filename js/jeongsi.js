/* 정시 환산 — 대학이 공개한 반영 방식으로 「우리 학생」과 「70%컷 학생」을 같은 식에 넣고 견줍니다.

   대학마다 실제 환산식에는 표준화 상수가 붙습니다. 그 상수까지 그대로 재현하려 들면
   틀리기 쉽습니다. 대신 이 파일은 두 사람을 같은 식으로 계산해 차이만 봅니다.
   식이 대학 원본과 조금 달라도, 양쪽에 똑같이 적용되므로 앞뒤 순서는 유지됩니다.
   과목별 컷(국·수·탐)은 자료에 모두 백분위로 들어 있어 이 방식이 성립합니다. */

/* 「국수영탐MAX」 같은 열 이름이 곧 규칙입니다 — 후보 과목과, 그중 몇 번째를 쓰는지. */
const PICK_RE = /^([가-힣]+?)(MAX|MID1|MID2|MID|MIN)$/;
const CAND = { '국': 'k', '수': 'm', '영': 'e', '탐': 's' };

function parsePick(name) {
  const m = PICK_RE.exec(name);
  if (!m) return null;
  const subs = [...m[1]].map(c => CAND[c]).filter(Boolean);
  if (subs.length < 2) return null;
  const rank = { MAX: 0, MID: 1, MID1: 1, MID2: 2, MIN: -1 }[m[2]];
  return { subs, rank, rankName: m[2] };
}

/* 영어·한국사 등급표는 대학마다 척도가 다릅니다 — 100점, 200점, 150점, 10점 가산, 0/−2/−4… 감점.
   국·수·탐은 0~100 백분위이므로, 표의 최댓값을 100으로 맞춰 같은 자리에 놓습니다.
   최댓값이 0인 감점표(0, −2, −4…)는 그대로 두고 아래 가·감점 항에서 따로 더합니다. */
function gradeTable(tbl) {
  if (!tbl) return null;
  const vals = tbl.filter(v => v != null);
  if (!vals.length) return null;
  const max = Math.max(...vals);
  return { raw: tbl, max, scaled: max > 0 ? tbl.map(v => (v == null ? null : 100 * v / max)) : null };
}
const clampG = g => Math.min(9, Math.max(1, Math.round(g))) - 1;

/* 학생 한 명의 과목별 값 — 국·수·탐은 백분위, 영·한은 등급표를 100점 자리로 맞춘 값 */
function valuesOf(pct, eng, his, rec) {
  const s1 = pct.s1, s2 = pct.s2;
  const both = [s1, s2].filter(v => v != null);
  const E = gradeTable(rec.eng), H = gradeTable(rec.his);
  return {
    k: pct.k, m: pct.m,
    e: eng != null && E?.scaled ? E.scaled[clampG(eng)] : null,
    /* 탐구 1과목 반영이면 잘한 쪽, 2과목이면 평균 */
    s1: both.length ? Math.max(...both) : null,
    s2: both.length ? both.reduce((a, b) => a + b, 0) / both.length : null,
    s: both.length ? Math.max(...both) : null,
    h: his != null && H?.scaled ? H.scaled[clampG(his)] : null,
  };
}

/* 반영 비율 총합. 100(퍼센트)일 수도, 만점 기준 배점일 수도, 1:1.2:0.8 같은 비일 수도 있습니다.
   어느 쪽이든 총합으로 나누면 같은 자리에 놓입니다. 한국사는 대부분 가산이라 총합에 넣지 않습니다. */
function totalW(rec) {
  const w = rec.w;
  return (w.k || 0) + (w.m || 0) + (w.e || 0) + (w.s1 || 0) + (w.s2 || 0)
    + Object.values(rec.pick || {}).reduce((a, b) => a + b, 0);
}

/* 국·수·탐 중 하나라도 반영하는지 — 영어·한국사만 있는 줄은 판정하지 않습니다. */
function hasMain(rec) {
  const w = rec.w, pk = Object.keys(rec.pick || {});
  return !!(w.k || w.m || w.s1 || w.s2) || pk.some(n => /[국수탐]/.test(n));
}

const PICK_NEED = { MAX: 1, MID: 2, MID1: 2, MID2: 3, MIN: 0 };   // 0 = 후보 전부

/* 영어·한국사를 반영 비율이 아니라 가·감점으로 두는 대학 — 총점 자리에서 100점 자리로 옮겨 더합니다.
   만점(rec.full)이 있으면 그것으로, 없으면 배점형 총합(300 이상)으로 나눕니다. 어느 쪽도 없으면 넣지 않습니다. */
function adjScale(rec) {
  if (rec.full && rec.full >= 100) return rec.full;
  const T = totalW(rec);
  return T >= 300 ? T : null;
}
function adjOf(rec, eng, his, opts) {
  let adj = 0;
  const S = adjScale(rec);
  if (!S) return 0;
  if (!rec.w.e && rec.eng && eng != null && !opts.dropE) {
    const E = gradeTable(rec.eng);
    if (E) adj += 100 * ((E.raw[clampG(eng)] ?? E.max) - E.max) / S;   // 1등급을 0으로 두고 아래로 깎습니다
  }
  if (!rec.w.h && rec.his && his != null && !opts.dropH) {
    const H = gradeTable(rec.his);
    if (H) adj += 100 * ((H.raw[clampG(his)] ?? H.max) - H.max) / S;
  }
  return adj;
}

/* 0~100 자리의 환산점수. 재료가 모자라면 null 을 돌려줍니다.
   opts.dropH — 한국사를 빼고 계산합니다. 학생에게 한국사 등급이 없으면 컷 쪽도 빼서 같은 식이 되게 합니다. */
export function scoreOf(rec, pct, eng, his, opts = {}) {
  const T = totalW(rec);
  if (!T || !hasMain(rec)) return null;
  const v = valuesOf(pct, eng, his, rec);
  let sum = 0, used = 0;

  for (const [k, key] of [['k', 'k'], ['m', 'm'], ['e', 'e'], ['s1', 's1'], ['s2', 's2']]) {
    const w = rec.w[k];
    if (!w) continue;
    if (v[key] == null) return null;
    sum += w * v[key]; used += w;
  }

  for (const [name, w] of Object.entries(rec.pick || {})) {
    const p = parsePick(name);
    if (!p) continue;
    /* 후보 중 값이 있는 것만 씁니다 — 컷 자료에 탐구 컷이 없어도 국·수로 채운 정상 행이 있습니다. */
    const vals = p.subs.map(s => v[s]).filter(x => x != null);
    const need = PICK_NEED[p.rankName] ?? 1;
    if (vals.length < (need || p.subs.length)) return null;
    const sorted = vals.slice().sort((a, b) => b - a);
    const idx = p.rank < 0 ? sorted.length - 1 : Math.min(p.rank, sorted.length - 1);
    sum += w * sorted[idx]; used += w;
  }

  /* 한국사 비율이 있는 대학 — 학생·컷 양쪽에 똑같이 넣거나 똑같이 뺍니다. */
  if (rec.w.h && v.h != null && !opts.dropH) { sum += rec.w.h * v.h; used += rec.w.h; }

  if (!used) return null;
  return sum / used + adjOf(rec, eng, his, opts);
}

/* 과목별 컷이 성한지 봅니다. 국·수·탐은 백분위, 영·한은 등급이어야 합니다.
   일부 모집단위는 이 칸이 비었거나 다른 단위로 들어 있어 그대로 쓰면 컷이 터무니없이 낮아집니다.
   그런 줄은 판정하지 않고 「자료 부족」으로 남깁니다. */
const pctOK = v => v != null && v >= 20 && v <= 100;
const grdOK = v => v != null && v >= 1 && v <= 9 && Math.abs(v - Math.round(v)) < 0.01;

export function cutUsable(rec, which = 'p70', opts = {}) {
  const c = rec[which], w = rec.w, pk = Object.keys(rec.pick || {});
  if (!c || !hasMain(rec)) return false;
  if (w.k && !pctOK(c.k)) return false;
  if (w.m && !pctOK(c.m)) return false;
  if ((w.s1 || w.s2) && !(pctOK(c.s1) || pctOK(c.s2))) return false;
  if (w.e && !grdOK(c.e)) return false;
  if (w.h && !grdOK(c.h)) return false;
  /* 선택 반영은 후보 중 쓰이는 개수만큼만 성하면 됩니다 (MAX 1개, MID 2개, MID2 3개, MIN 전부). */
  for (const name of pk) {
    const p = parsePick(name);
    if (!p) continue;
    const ok = { k: pctOK(c.k), m: pctOK(c.m), s: pctOK(c.s1) || pctOK(c.s2), e: grdOK(c.e) && !!rec.eng };
    const n = p.subs.filter(sname => ok[sname]).length;
    const need = PICK_NEED[p.rankName] ?? 1;
    if (n < (need || p.subs.length)) return false;
  }
  /* 영어·한국사가 가·감점이면 컷 쪽 등급도 있어야 같은 식이 됩니다. */
  if (!w.e && rec.eng && adjScale(rec) && !grdOK(c.e) && !opts.dropE) return false;
  return true;
}

/* 70%컷 학생 — 자료에 적힌 과목별 컷을 그대로 한 사람처럼 넣습니다. */
export function cutScore(rec, which = 'p70', opts = {}) {
  const c = rec[which];
  if (!c || !cutUsable(rec, which, opts)) return null;
  const P = v => (pctOK(v) ? v : null);
  return scoreOf(rec, { k: P(c.k), m: P(c.m), s1: P(c.s1), s2: P(c.s2) }, grdOK(c.e) ? c.e : null, grdOK(c.h) ? c.h : null, opts);
}

/* 응시과목 지정 — 미적분·기하·과탐을 요구하는 모집단위인지 */
export function needsOf(rec) {
  const t = rec.need || '';
  return {
    math: /미적분|기하/.test(t) ? '미적분·기하' : null,
    sci: /과탐|과학탐구/.test(t) ? '과탐' : null,
    raw: t,
  };
}

export const JUDGE_JG = [
  { k: '안정', min: 3 }, { k: '적정', min: 0 }, { k: '소신', min: -2 },
  { k: '상향', min: -5 }, { k: '도전', min: -Infinity },
];

export const judgeOf = d => JUDGE_JG.find(j => d >= j.min).k;

/* 학생 한 명 → 모집단위별 결과 */
export function placementJG(units, { pct, eng, his, year }) {
  const out = [];
  /* 학생에게 영어·한국사 등급이 없으면 컷 쪽에서도 빼서 같은 식으로 견줍니다. */
  const opts = { dropH: his == null, dropE: eng == null };
  for (const rec of units) {
    if (year && rec.y !== year) continue;
    const mine = scoreOf(rec, pct, eng, his, opts);
    const cut = cutScore(rec, 'p70', opts);
    const cut50 = cutScore(rec, 'p50', opts);
    if (mine == null || cut == null) { out.push({ rec, mine, cut, diff: null }); continue; }
    /* 경계에서 부동소수 찌꺼기(2.9999…)가 판정을 한 단계 내리지 않도록 소수 둘째 자리로 맞춥니다. */
    const diff = Math.round((mine - cut) * 100) / 100;
    out.push({ rec, mine, cut, cut50, diff, judge: judgeOf(diff) });
  }
  return out;
}
