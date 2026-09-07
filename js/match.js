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

/* ── 정시 전용 매칭 ───────────────────────────────────
   내신은 보지 않고 수능 백분위(국·수·탐1·탐2)와 영어 등급으로만 찾습니다.
   정시 지원 이력이 있는 졸업생만 후보로 삼습니다. */

const ENG_WEIGHT = 3;   // 영어 1등급 차이를 백분위 3점 차이로 칩니다

function pctAvgOf(c) {
  if (!c) return null;
  const v = [c.pk, c.pm, c.ps1, c.ps2].filter(x => x != null);
  return v.length >= 3 ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function findSimilarJeongsi(index, opts) {
  const { pct, eng, topN, minYear, gy, includeVocational } = opts;
  const mine = [pct.k, pct.m, pct.s1, pct.s2];
  const cand = [];
  for (const p of index.persons) {
    if (p.y < minYear) continue;
    const c = p.csat;
    if (!c) continue;
    const theirs = [c.pk, c.pm, c.ps1, c.ps2];
    const pairs = mine.map((v, i) => [v, theirs[i]]).filter(([a, b]) => a != null && b != null);
    if (pairs.length < 3) continue;
    const idxs = index.byPerson.get(p.pk) || [];
    const jg = idxs.filter(i => index.apps[i].ph === 1);
    if (!jg.length) continue;
    if (gy >= 0 && !jg.some(i => index.apps[i].gy === gy)) continue;
    let d = pairs.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / pairs.length;
    if (eng != null && c.e != null) d += ENG_WEIGHT * Math.abs(eng - c.e);
    cand.push({ p, d, g: pctAvgOf(c) });
  }
  cand.sort((a, b) => a.d - b.d);
  const sel = cand.slice(0, topN);

  const rows = [];
  for (const s of sel) {
    for (const i of index.byPerson.get(s.p.pk) || []) {
      const a = index.apps[i];
      if (a.ph !== 1) continue;
      if (!includeVocational && a.cat === 1) continue;
      if (gy >= 0 && a.gy !== gy) continue;
      rows.push({ a, s });
    }
  }
  return { sel, rows };
}

export function summarizeJeongsi(sel, rows) {
  const jg = rows.filter(r => r.a.ph === 1 && r.a.res != null);
  const pass = jg.filter(isPass);
  const stu = new Set(jg.map(r => r.s.p.pk)), stuPass = new Set(pass.map(r => r.s.p.pk));
  const avgs = sel.map(s => s.g).filter(x => x != null);
  return {
    jg, nPass: pass.length, stu, stuPass,
    pctRange: avgs.length ? [Math.min(...avgs), Math.max(...avgs)] : [0, 0],
    cardsPerStudent: stu.size ? jg.length / stu.size : 0,
  };
}

export function aggregateJeongsiUniv(jg) {
  const m = new Map();
  for (const r of jg) {
    const k = `${r.a.univ}|${r.a.grp || ''}`;
    if (!m.has(k)) m.set(k, { univ: r.a.univ, grp: r.a.grp || '', n: 0, h: 0, ps: [], pass: [], fail: [] });
    const o = m.get(k);
    o.n++;
    const g = pctAvgOf(r.s.p.csat);
    if (isPass(r)) {
      o.h++;
      if (g != null) o.ps.push(g);
      o.pass.push({ dept: r.a.dept || '', pct: g, wait: r.a.res === '추합' ? r.a.wait : null });
    } else {
      o.fail.push({ dept: r.a.dept || '', pct: g, wait: r.a.wait });
    }
  }
  return [...m.values()].sort((a, b) => b.h - a.h || b.n - a.n);
}

export function aggregateGroup(jg) {
  const m = new Map([['가군', { grp: '가군', n: 0, h: 0 }], ['나군', { grp: '나군', n: 0, h: 0 }], ['다군', { grp: '다군', n: 0, h: 0 }]]);
  for (const r of jg) {
    const g = r.a.grp;
    if (!m.has(g)) m.set(g, { grp: g || '기타', n: 0, h: 0 });
    const o = m.get(g); o.n++; if (isPass(r)) o.h++;
  }
  return [...m.values()].filter(o => o.n);
}
