/* 유사 학생 탐색과 집계 — 순수 계산만 담당합니다. */

export function csatAvg(c) {
  if (!c) return null;
  const v = [c.k, c.m, c.e, c.s1, c.s2].filter(x => x != null && x > 0);
  return v.length >= 3 ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/* 수능 정보가 없는 과거 학생에게 주는 거리 가산치.
   0.45는 대략 등급 0.64 차이에 해당합니다(가중치 0.7 기준). */
const NO_CSAT_PENALTY = 0.45;
const CSAT_WEIGHT = 0.7;

export function buildIndex(history) {
  const byPerson = new Map();
  history.apps.forEach((a, i) => {
    if (!byPerson.has(a.pk)) byPerson.set(a.pk, []);
    byPerson.get(a.pk).push(i);
  });
  const persons = history.persons.map(p => ({ ...p, csatAvg: csatAvg(p.csat) }));
  return { byPerson, persons, apps: history.apps };
}

export function findSimilar(index, opts) {
  const { gpa, myCsatAvg, topN, minYear, gy, includeVocational } = opts;
  const cand = [];
  for (const p of index.persons) {
    if (p.y < minYear) continue;
    const g = p.g?.[3];
    if (g == null) continue;
    const idxs = index.byPerson.get(p.pk) || [];
    if (gy >= 0 && !idxs.some(i => index.apps[i].gy === gy)) continue;
    let d = Math.abs(g - gpa);
    if (myCsatAvg != null) {
      d += p.csatAvg != null ? CSAT_WEIGHT * Math.abs(p.csatAvg - myCsatAvg) : NO_CSAT_PENALTY;
    }
    cand.push({ p, d, g });
  }
  cand.sort((a, b) => a.d - b.d);
  const sel = cand.slice(0, topN);

  const rows = [];
  for (const s of sel) {
    for (const i of index.byPerson.get(s.p.pk) || []) {
      const a = index.apps[i];
      if (!includeVocational && a.cat === 1) continue;
      if (gy >= 0 && a.gy !== gy) continue;
      rows.push({ a, s });
    }
  }
  return { sel, rows };
}

export const isPass = r => r.a.res === '합격' || r.a.res === '추합';
const decided = r => r.a.res != null;

export function summarize(sel, rows) {
  const su = rows.filter(r => r.a.ph === 0 && decided(r));
  const jg = rows.filter(r => r.a.ph === 1 && decided(r));
  const suPass = su.filter(isPass);
  const jgPass = jg.filter(isPass);
  const stuSu = new Set(su.map(r => r.s.p.pk));
  const stuSuPass = new Set(suPass.map(r => r.s.p.pk));
  const nonsul = su.filter(r => r.a.track === '논술');
  return {
    su, jg,
    nSuPass: suPass.length,
    nJgPass: jgPass.length,
    stuSu, stuSuPass,
    gpaRange: sel.length ? [Math.min(...sel.map(s => s.g)), Math.max(...sel.map(s => s.g))] : [0, 0],
    cardsPerStudent: stuSu.size ? su.length / stuSu.size : 0,
    nonsul: {
      n: nonsul.length,
      pass: nonsul.filter(isPass).length,
      miss: nonsul.filter(r => r.a.min === '미충족').length,
    },
  };
}

export function aggregateUniv(su) {
  const m = new Map();
  for (const r of su) {
    const k = r.a.univ + '|' + r.a.track;
    if (!m.has(k)) m.set(k, { univ: r.a.univ, track: r.a.track, n: 0, h: 0, gs: [], miss: 0 });
    const o = m.get(k);
    o.n++;
    if (isPass(r)) { o.h++; const g = r.s.p.g?.[3]; if (g != null) o.gs.push(g); }
    if (r.a.min === '미충족') o.miss++;
  }
  return [...m.values()].sort((a, b) => b.h - a.h || b.n - a.n);
}

export function aggregateTrack(su) {
  const m = new Map();
  for (const r of su) {
    const t = r.a.track || '기타';
    if (!m.has(t)) m.set(t, { track: t, n: 0, h: 0, miss: 0 });
    const o = m.get(t);
    o.n++;
    if (isPass(r)) o.h++;
    if (r.a.min === '미충족') o.miss++;
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

export function aggregateJeongsi(jg) {
  const m = new Map();
  for (const r of jg) {
    const k = r.a.univ + '|' + (r.a.grp || '');
    if (!m.has(k)) m.set(k, { univ: r.a.univ, grp: r.a.grp || '', n: 0, h: 0, depts: new Set() });
    const o = m.get(k);
    o.n++;
    if (isPass(r)) { o.h++; if (r.a.dept) o.depts.add(r.a.dept); }
  }
  return [...m.values()].sort((a, b) => b.h - a.h || b.n - a.n);
}

/* 전체 데이터 기준 참고 수치 (좌측 패널에 표시) */
export function baseline(history) {
  const t = new Map();
  let minOk = [0, 0], minNo = [0, 0];
  for (const a of history.apps) {
    if (a.ph !== 0 || a.res == null) continue;
    const k = a.track || '기타';
    if (!t.has(k)) t.set(k, [0, 0]);
    const o = t.get(k);
    o[0]++;
    if (a.res === '합격' || a.res === '추합') o[1]++;
    if (a.track === '논술') {
      if (a.min === '충족') { minOk[0]++; if (a.res !== '불합') minOk[1]++; }
      if (a.min === '미충족') { minNo[0]++; if (a.res !== '불합') minNo[1]++; }
    }
  }
  const tracks = [...t.entries()]
    .map(([track, [n, h]]) => ({ track, n, rate: n ? h / n : 0 }))
    .sort((a, b) => b.n - a.n);
  return {
    tracks,
    minOk: { n: minOk[0], rate: minOk[0] ? minOk[1] / minOk[0] : 0 },
    minNo: { n: minNo[0], rate: minNo[0] ? minNo[1] / minNo[0] : 0 },
  };
}
