/* 선택과목 구성 — 학문 분야별 권장과목과 우리 학교 편제를 맞춰 봅니다.
   화면 문구는 render.js 에서 만들고, 여기서는 판단만 합니다. */

export const TIER_NAME = { core: '핵심', rec: '권장', gen: '계열 공통', genrec: '계열 권장' };
export const TIER_RANK = { core: 0, rec: 1, gen: 2, genrec: 3 };

/* 1학년은 2학년 과목을, 2학년은 3학년 과목을 고릅니다. */
export const semsFor = grade => (grade === 1 ? ['2-1', '2-2'] : ['3-1', '3-2']);

export function groupsFor(sel, grade) {
  const want = semsFor(grade);
  return sel.school.groups
    .filter(g => want.includes(g.sem))
    .map(g => ({ ...g, subs: grade === 2 ? g.subs.concat(g.only2 || []) : g.subs }))
    .sort((a, b) => a.sem.localeCompare(b.sem) || a.g.localeCompare(b.g));
}

/* 여러 분야를 함께 고르면 가장 강한 등급을 씁니다. */
export function mergeSub(picked, sub) {
  let t = null, n = 0, u = [], from = [];
  for (const f of picked) {
    const v = f.subs[sub];
    if (!v) continue;
    from.push(f.name); n = Math.max(n, v.n); u = u.concat(v.u || []);
    if (t === null || TIER_RANK[v.t] < TIER_RANK[t]) t = v.t;
  }
  return t ? { t, n, from, u: [...new Set(u)] } : null;
}

/* 고른 과목들에 서로 다른 교시를 하나씩 줄 수 있는지 — 조합이 작아 완전탐색 */
export function feasible(timeOf, subs) {
  const opts = subs.map(timeOf).filter(x => x && x.length);
  if (opts.length < 2) return true;
  const used = new Set();
  const go = i => i === opts.length || opts[i].some(t =>
    !used.has(t) && (used.add(t), go(i + 1) || (used.delete(t), false)));
  return go(0);
}

/* 이 묶음에서 「함께 들을 수 없는」 짝 — 안내 문구용 */
export function clashPairs(timeOf, subs) {
  const out = [];
  for (let i = 0; i < subs.length; i++)
    for (let j = i + 1; j < subs.length; j++)
      if (!feasible(timeOf, [subs[i], subs[j]])) out.push([subs[i], subs[j]]);
  return out;
}

/* 분야 설명에 들어갈 재료 — 문장은 render 에서 만듭니다. */
export function summaryOf(f, sel) {
  const common = new Set(sel.school.common.map(c => c.s));
  const core = Object.entries(f.subs).filter(([, v]) => v.t === 'core');
  const by = (a, b) => b[1].n - a[1].n;
  return {
    areas: core.filter(([, v]) => v.area).sort(by).slice(0, 4),
    already: core.filter(([k, v]) => !v.area && common.has(k)).sort(by).slice(0, 4),
    topick: core.filter(([k, v]) => !v.area && !common.has(k)).sort(by).slice(0, 4),
  };
}

/* 과목 → 「2-1 B그룹[택3]」 */
export function whereOf(sel) {
  const m = {};
  for (const g of sel.school.groups)
    for (const s of g.subs.concat(g.only2 || []))
      if (!m[s]) m[s] = `${g.sem} ${g.g}그룹[택${g.pick}]`;
  for (const c of sel.school.common) if (!m[c.s]) m[c.s] = `${c.sem} 공통`;
  return m;
}

/* 학생 한 명의 과학 이수 상태 — 대학이 요구하는 「진로선택 3과목」 기준 */
export const SCI_GEN = ['물리학', '화학', '생명과학', '지구과학'];
export const SCI_CAR = ['역학과 에너지', '물질과 에너지', '세포와 물질대사', '지구 시스템과학',
  '전자기와 양자', '화학 반응의 세계', '생물의 유전', '행성우주과학'];

export function sciProgress(taken) {
  const t = new Set(taken || []);
  const gen = SCI_GEN.filter(s => t.has(s));
  const car = SCI_CAR.filter(s => t.has(s));
  return { gen, car, need: Math.max(0, 3 - car.length) };
}

/* 자연·공학·의약 계열을 하나라도 골랐는지 */
export const isSci = picked => picked.some(f => ['자연', '공학', '의약'].includes(f.gy));

/* 이 묶음에서 핵심 등급 과목이 자리보다 많은지 */
export function overCore(group, picked) {
  const cores = group.subs.filter(s => {
    const m = mergeSub(picked, s);
    return m && m.t === 'core';
  });
  return cores.length > group.pick ? cores : null;
}
