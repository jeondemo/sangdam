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
    /* 화면에 실제로 보일 기록(전문대 제외 · 계열 일치)이 하나도 없는 졸업생은 자리를 차지하지 않게 뺍니다. */
    const shown = i => (includeVocational || index.apps[i].cat !== 1) && (gy < 0 || index.apps[i].gy === gy);
    if (!idxs.some(shown)) continue;
    let d = Math.abs(g - gpa);
    if (myCsatAvg != null) {
      d += p.csatAvg != null ? CSAT_WEIGHT * Math.abs(p.csatAvg - myCsatAvg) : NO_CSAT_PENALTY;
    }
    cand.push({ p, d, g });
  }
  /* 거리가 같으면 최근 학년도를 먼저 — 오래된 자료가 우연히 앞서지 않도록. */
  cand.sort((a, b) => a.d - b.d || b.p.y - a.p.y);
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
  const v = [c.pk, c.pm, c.ps1, c.ps2].filter(x => x != null && x > 0);   // 0은 미응시
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
    const pairs = mine.map((v, i) => [v, theirs[i]]).filter(([a, b]) => a != null && b != null && b > 0);
    if (pairs.length < 3) continue;
    const idxs = index.byPerson.get(p.pk) || [];
    const jg = idxs.filter(i => index.apps[i].ph === 1
      && (includeVocational || index.apps[i].cat !== 1) && (gy < 0 || index.apps[i].gy === gy));
    if (!jg.length) continue;
    let d = pairs.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / pairs.length;
    if (eng != null && c.e != null) d += ENG_WEIGHT * Math.abs(eng - c.e);
    cand.push({ p, d, g: pctAvgOf(c) });
  }
  cand.sort((a, b) => a.d - b.d || b.p.y - a.p.y);
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

/* ── 정시 배치 — 학생 백분위 vs 대학 공개 입시결과 ─────────
   기준: 학생의 국·수·탐 백분위 평균(탐구는 2과목 평균)을 대학이 공개한
   최종등록자 70%컷(또는 평균) 백분위와 비교합니다.
   대학마다 탐구 반영 과목 수·영어 처리 방식이 달라 근사치입니다. */

export const JUDGE = [
  ['안정', 'safe'], ['적정', 'fit'], ['소신', 'reach'], ['상향', 'up'], ['도전', 'dream'],
];
const AVG_OFFSET = 0.7;   // '평균'은 70%컷보다 대략 이만큼 높습니다

/* 백분위 → 대략적인 등급 (등급만 공개한 대학과 비교할 때만 씁니다) */
export function pctToGrade(p) {
  if (p == null) return null;
  const cuts = [96, 89, 77, 60, 40, 23, 11, 4];
  for (let i = 0; i < cuts.length; i++) if (p >= cuts[i]) return i + 1;
  return 9;
}

export function studentPct3(pct) {
  const inq = [pct.s1, pct.s2].filter(x => x != null);
  const parts = [pct.k, pct.m].filter(x => x != null);
  if (inq.length) parts.push(inq.reduce((a, b) => a + b, 0) / inq.length);
  return parts.length >= 2 ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function judgeByDiff(d0, t) {
  /* 2.4 − 2.0 = 0.3999… 같은 부동소수 찌꺼기가 경계에서 한 단계 내리지 않도록 소수 둘째 자리로 맞춥니다. */
  const d = Math.round(d0 * 100) / 100;
  if (d >= t[0]) return 0;
  if (d >= t[1]) return 1;
  if (d >= t[2]) return 2;
  if (d >= t[3]) return 3;
  return 4;
}

/* 우리 학교 졸업생 정시 지원 결과를 대학·학과별로 세어 둡니다. */
export function schoolJeongsiStats(index) {
  const byUniv = new Map(), byDept = new Map();
  const add = (m, k, pass) => { const o = m.get(k) || { n: 0, h: 0 }; o.n++; if (pass) o.h++; m.set(k, o); };
  for (const a of index.apps) {
    if (a.ph !== 1 || a.res == null) continue;
    const pass = a.res === '합격' || a.res === '추합';
    add(byUniv, a.univ, pass);
    add(byDept, `${a.univ}|${a.dept || ''}`, pass);
  }
  return { byUniv, byDept };
}

const normDept = s => String(s || '').replace(/[\s()·ㆍ・,\-]/g, '').replace(/학과$|학부$|전공$|과$/, '');

export function placement(cut, opts) {
  const { pct, eng, myGrade, gy, similarRows, school, yearOnly } = opts;
  const my = studentPct3(pct);
  if (my == null || !cut?.rows?.length) return { my, list: [] };
  const myG = myGrade ?? (() => {
    const gs = [pct.k, pct.m, pct.s1, pct.s2].map(pctToGrade).filter(x => x != null);
    return gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null;
  })();
  /* 유사 졸업생의 대학별 결과 */
  const sim = new Map();
  for (const r of similarRows || []) {
    const k = r.a.univ; const o = sim.get(k) || { n: 0, h: 0 }; o.n++; if (isPass(r)) o.h++; sim.set(k, o);
  }
  /* 같은 학과가 여러 학년도로 들어 있으면 가장 최근 것만 씁니다. */
  const newest = new Map();
  for (const r of cut.rows) {
    const k = `${r.univ}|${r.campus || ''}|${r.dept}|${r.group || ''}|${r.track || ''}`;
    const p = newest.get(k);
    if (!p || (r.year || 0) > (p.year || 0)) newest.set(k, r);
  }
  const list = [];
  for (const r of newest.values()) {
    if (yearOnly && r.year !== yearOnly) continue;
    if (gy >= 0 && r.gy !== gy) continue;
    let base = null, kind = '', diff = null, j = null;
    if (r.metric === 'grade' && r.gradeAvg != null) {
      if (myG == null) continue;
      base = r.gradeAvg; kind = '등급';
      diff = base - myG;      // 양수면 학생이 더 좋음
      j = judgeByDiff(diff, [0.4, 0.1, -0.2, -0.5]);
    } else if (r.metric === 'school' && r.pct70 != null) {
      base = r.pct70; kind = '우리 학교';
      diff = my - (r.pct70 - AVG_OFFSET);
      j = judgeByDiff(diff, [2.0, 0, -1.5, -3.0]);
    } else {
      const c70 = r.pct70 != null ? r.pct70 : (r.pct50 != null ? r.pct50 - AVG_OFFSET : null);
      if (c70 == null) continue;
      base = r.pct70 != null ? r.pct70 : r.pct50;
      kind = r.pct70 != null ? (r.metric === 'pctAvg' ? '평균' : '70%컷') : '평균';
      diff = my - c70;
      j = judgeByDiff(diff, [2.0, 0, -1.5, -3.0]);
    }
    if (kind === '등급' ? (diff < -1.2 || diff > 2.5) : (diff < -6 || diff > 10)) continue;   // 화면이 넘치지 않게 멀리 있는 학과는 뺍니다
    const dk = `${r.univ}|${r.dept}`;
    let dept = school?.byDept.get(dk);
    if (!dept) {
      const nd = normDept(r.dept);
      for (const [k, v] of school?.byDept || []) {
        if (k.startsWith(r.univ + '|') && nd && normDept(k.split('|')[1]) === nd) { dept = v; break; }
      }
    }
    list.push({
      ...r, base, kind, diff, j, jn: JUDGE[j][0], jc: JUDGE[j][1],
      univStat: school?.byUniv.get(r.univ) || null, deptStat: dept || null, sim: sim.get(r.univ) || null,
    });
  }
  /* 배치표처럼 기준이 높은 학과부터 아래로 내려갑니다. 등급만 있는 대학은 맨 뒤에. */
  const years = [...new Set(list.map(x => x.year).filter(Boolean))].sort();
  list.sort((a, b) => {
    const ga = a.kind === '등급', gb = b.kind === '등급';
    if (ga !== gb) return ga ? 1 : -1;
    return ga ? (a.base - b.base) : (b.base - a.base) || a.univ.localeCompare(b.univ);
  });
  return { my, myG, list, years };
}
