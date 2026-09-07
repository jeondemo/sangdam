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

/* ── 이 조합으로 대학 보기 ──────────────────────────
   대학이 적어 둔 과목 이름을 우리 학생이 든 과목과 맞춰 봅니다.
   권장과목은 지원 자격이 아니므로 「가능·불가능」이 아니라
   「모두 이수 / 몇 과목 빠짐 / 지정 기준 없음」으로만 나눕니다. */

const AREA_NAMES = ['국어', '수학', '영어', '사회', '과학', '체육', '예술', '교양',
  '한문', '제2외국어', '역사', '지리', '도덕', '정보', '기술·가정'];

const sq = s => String(s || '').replace(/[\s·、]/g, '').replace(/교과\(?군\)?$/, '');

/* 학생이 든 과목 이름과, 선택과목으로 채운 교과군 */
export function haveOf(sel, subs) {
  const names = new Set(), areas = new Set();
  const common = new Set(sel.school.common.map(c => c.s));
  for (const s of subs) {
    names.add(sq(s));
    /* 교과군은 「선택해서 들은 과목」으로만 셉니다 — 공통과목은 전원이 듣기 때문입니다. */
    if (!common.has(s) && sel.school.area[s]) areas.add(sq(sel.school.area[s]));
  }
  for (const c of sel.school.common) names.add(sq(c.s));
  return { names, areas };
}

/* 우리 학교가 개설한 과목과, 그 과목이 어느 학기 어느 묶음에 있는지 */
export function offeredOf(sel) {
  const names = new Map(), areas = new Set();
  const put = (s, where) => { if (!names.has(sq(s))) names.set(sq(s), where); };
  for (const g of sel.school.groups)
    for (const s of g.subs.concat(g.only2 || [])) {
      put(s, `${g.sem} ${g.g}`);
      if (sel.school.area[s]) areas.add(sq(sel.school.area[s]));
    }
  for (const e of sel.school.extra) {
    put(e.s, '공동교육과정');
    if (sel.school.area[e.s]) areas.add(sq(sel.school.area[e.s]));
  }
  for (const c of sel.school.common) put(c.s, `${c.sem} 공통`);
  return { names, areas };
}

/* 대학마다 표기가 다릅니다. 2015 개정 이름, 교과 영역 이름, 서울대식 표기를 우리 편제 이름으로 옮깁니다. */
const AREA_ALIAS = {
  '역사': '사회', '도덕': '사회', '지리': '사회', '윤리': '사회', '일반사회': '사회',
  '사회(역사/도덕포함)': '사회', '사회(역사도덕포함)': '사회', '사회탐구': '사회',
  '수학①': '수학', '수학②': '수학', '과학①': '과학', '과학②': '과학', '과학탐구': '과학',
  '외국어': '제2외국어', '제2외국어한문': '제2외국어',
};
const SUBJ_ALIAS = {
  '미적분': ['미적분Ⅰ', '미적분Ⅱ'],
  '물리': ['물리학'], '생물': ['생명과학'], '지구': ['지구과학'],
  '확률통계': ['확률과 통계'], '언어와매체': ['화법과 언어'], '화법과작문': ['화법과 언어'],
};

/* 대학마다 적는 방식이 제각각입니다 — 「A 또는 B」, 「[A 또는 B]」, 「과학(물리학)」,
   「A -진로선택: B」, 「제2외국어/한문」. 후보 이름들로 펼칩니다. */
function altsOf(tok) {
  let t = String(tok).replace(/[[\]]/g, ' ')
    .replace(/-\s*(진로|일반|융합)\s*선택\s*:/g, ',')
    .replace(/^[^:]{0,16}:\s*/, '');
  const m = t.match(/^(.*?)\(([^)]*)\)(.*)$/);
  const bases = m ? [`${m[1]} ${m[3] || ''}`.trim(), m[2]] : [t];
  const out = new Set();
  for (const b of bases)
    for (let x of b.split(/\/|또는|,/)) {
      x = x.replace(/\s*(중\s*\d+\s*과목.*|이상|교과\s*적극\s*이수|적극\s*이수|포함|불요)\s*$/g, '').trim();
      if (x) out.add(x);
    }
  return [...out];
}

/* 결과는 세 가지 — 이미 들었다 / 우리 학교에 있는데 아직 안 골랐다 / 우리 학교에 없다. */
function tokenState(tok, have, off) {
  let known = false, where = null;
  for (const alt of altsOf(tok)) {
    const k = sq(alt);
    if (!k) continue;

    const area = AREA_ALIAS[k] || (AREA_NAMES.some(a => sq(a) === k) ? k : null);
    if (area) {
      known = true;
      if (have.areas.has(sq(area))) return 'got';
      if (off.areas.has(sq(area))) where = where || '선택과목';
      continue;
    }

    let seen = false;
    for (const nm of (SUBJ_ALIAS[k] || [alt])) {
      const q = sq(nm);
      if (have.names.has(q)) return 'got';
      if (off.names.has(q)) { seen = true; where = where || off.names.get(q); }
    }
    if (seen || SUBJ_ALIAS[k]) { known = true; continue; }

    if (/^[가-힣A-Za-zⅠⅡ0-9]/.test(alt) && alt.length <= 16
      && !/이수|선택|고려|적성|진로|계열|상관|무관|전\s*과목/.test(alt)) known = true;
  }
  if (!known) return null;
  return where ? 'later' : 'no';
}

const splitReq = s => String(s || '').split(/[,\n]/).map(x => x.trim())
  .filter(x => x && x !== '-' && x !== '해당 없음');

export function matchUnits(sel, subs) {
  const have = haveOf(sel, subs);
  const off = offeredOf(sel);
  return (sel.units || []).map(r => {
    const got = [], later = [], no = [];
    for (const t of splitReq(r.core).concat(splitReq(r.rec))) {
      const v = tokenState(t, have, off);
      if (v === 'got') got.push(t);
      else if (v === 'later') later.push({ s: t, w: off.names.get(sq(t.split('/')[0])) || '선택과목' });
      else if (v === 'no') no.push(t);
    }
    const st = (!got.length && !later.length && !no.length) ? 'none'
      : (no.length ? 'no' : (later.length ? 'later' : 'full'));
    return { ...r, got, later, no, st };
  });
}

/* 우리 학교 지원이 많은 대학을 위로 — 표기가 달라 이름을 다듬어 맞춥니다. */
export function univKey(name) {
  return String(name || '').replace(/\s|\(.*?\)|캠퍼스/g, '')
    .replace(/대학교/g, '대').replace(/대학/g, '대')
    .replace(/여자대/g, '여대').replace(/교육대/g, '교대')
    .replace(/(ERICA|글로컬|국제|제2|미래|세종|천안|삼척|도계|춘천|여수|광주|서울)$/, '');
}
