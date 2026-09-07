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
  return { subs, rank };
}

/* 학생 한 명의 과목별 값 — 국·수·탐은 백분위, 영·한은 등급별 부여 점수 */
function valuesOf(pct, eng, his, rec) {
  const s1 = pct.s1, s2 = pct.s2;
  const both = [s1, s2].filter(v => v != null);
  return {
    k: pct.k, m: pct.m,
    e: eng != null && rec.eng ? rec.eng[Math.min(9, Math.max(1, Math.round(eng))) - 1] : null,
    /* 탐구 1과목 반영이면 잘한 쪽, 2과목이면 평균 */
    s1: both.length ? Math.max(...both) : null,
    s2: both.length ? both.reduce((a, b) => a + b, 0) / both.length : null,
    s: both.length ? Math.max(...both) : null,
    h: his != null && rec.his ? rec.his[Math.min(9, Math.max(1, Math.round(his))) - 1] : null,
  };
}

/* 반영 비율 총합. 100(퍼센트)일 수도, 만점 기준 배점일 수도, 1:1.2:0.8 같은 비일 수도 있습니다.
   어느 쪽이든 총합으로 나누면 같은 자리에 놓입니다. */
function totalW(rec) {
  const w = rec.w;
  return (w.k || 0) + (w.m || 0) + (w.e || 0) + (w.s1 || 0) + (w.s2 || 0)
    + Object.values(rec.pick || {}).reduce((a, b) => a + b, 0);
}

/* 0~100 자리의 환산점수. 재료가 모자라면 null 을 돌려줍니다. */
export function scoreOf(rec, pct, eng, his) {
  const T = totalW(rec);
  if (!T) return null;
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
    const vals = p.subs.map(s => v[s]);
    if (vals.some(x => x == null)) return null;
    const sorted = vals.slice().sort((a, b) => b - a);
    const idx = p.rank < 0 ? sorted.length - 1 : Math.min(p.rank, sorted.length - 1);
    sum += w * sorted[idx]; used += w;
  }

  /* 한국사는 대부분 가산 형태라 비율에 넣지 않고 따로 더합니다. */
  if (rec.w.h && v.h != null) { sum += rec.w.h * v.h; used += rec.w.h; }

  if (!used) return null;
  return sum / used;
}

/* 과목별 컷이 성한지 봅니다. 국·수·탐은 백분위, 영·한은 등급이어야 합니다.
   일부 모집단위는 이 칸이 비었거나 다른 단위로 들어 있어 그대로 쓰면 컷이 터무니없이 낮아집니다.
   그런 줄은 판정하지 않고 「자료 부족」으로 남깁니다. */
const pctOK = v => v != null && v >= 20 && v <= 100;
const grdOK = v => v != null && v >= 1 && v <= 9 && Math.abs(v - Math.round(v)) < 0.01;

export function cutUsable(rec, which = 'p70') {
  const c = rec[which], w = rec.w, pk = rec.pick || {};
  if (!c) return false;
  const usesE = !!w.e || Object.keys(pk).some(n => n.includes('영'));
  const usesS = !!w.s1 || !!w.s2 || Object.keys(pk).some(n => n.includes('탐'));
  const usesK = !!w.k || Object.keys(pk).some(n => n.includes('국'));
  const usesM = !!w.m || Object.keys(pk).some(n => n.includes('수'));
  if (usesK && !pctOK(c.k)) return false;
  if (usesM && !pctOK(c.m)) return false;
  if (usesS && !(pctOK(c.s1) || pctOK(c.s2))) return false;
  if (usesE && !grdOK(c.e)) return false;
  if (w.h && !grdOK(c.h)) return false;
  return true;
}

/* 70%컷 학생 — 자료에 적힌 과목별 컷을 그대로 한 사람처럼 넣습니다. */
export function cutScore(rec, which = 'p70') {
  const c = rec[which];
  if (!c || !cutUsable(rec, which)) return null;
  const s1 = pctOK(c.s1) ? c.s1 : null, s2 = pctOK(c.s2) ? c.s2 : null;
  return scoreOf(rec, { k: c.k, m: c.m, s1, s2 }, c.e, c.h);
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
  for (const rec of units) {
    if (year && rec.y !== year) continue;
    const mine = scoreOf(rec, pct, eng, his);
    const cut = cutScore(rec, 'p70');
    const cut50 = cutScore(rec, 'p50');
    if (mine == null || cut == null) { out.push({ rec, mine, cut, diff: null }); continue; }
    out.push({ rec, mine, cut, cut50, diff: mine - cut, judge: judgeOf(mine - cut) });
  }
  return out;
}
