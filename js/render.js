/* 화면 렌더링 — HTML 문자열을 만들어 돌려줍니다. */

import { isPass, JUDGE } from './match.js';
import { TIER_NAME, TIER_RANK, mergeSub, feasible, summaryOf, whereOf,
  sciProgress, isSci, overCore, groupsFor, univKey, semLabel } from './subject.js';

/* 학급 코드는 306처럼 「학년+반」 세 자리입니다. 화면에는 「3학년 6반」으로 풉니다. */
export const clsLabel = c => (c >= 100 ? `${Math.floor(c / 100)}학년 ${c % 100}반` : `${c}반`);

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const pct1 = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function csatStr(c) {
  if (!c) return '<span style="opacity:.6">수능 기록 없음</span>';
  const f = x => (x == null || x <= 0 ? '·' : x);
  const 등급 = `수능 ${f(c.k)}·${f(c.m)}·${f(c.e)}·${f(c.s1)}·${f(c.s2)}`;
  const p = [c.pk, c.pm, c.ps1, c.ps2];
  if (!p.some(x => x != null)) return 등급;
  const q = x => (x == null ? '·' : Math.round(x));
  /* 영어는 절대평가라 백분위가 없습니다. 자리를 비워 국·수·영·탐1·탐2 순서를 맞춥니다. */
  return `${등급} <span class="pct" title="백분위 국·수·영·탐1·탐2 — 영어는 절대평가라 백분위가 없습니다">`
    + `(백분위 ${q(c.pk)} ${q(c.pm)} — ${q(c.ps1)} ${q(c.ps2)})</span>`;
}

const resTag = a => {
  if (a.res === '합격') return '<span class="tag t-ok">합격</span>';
  if (a.res === '추합') return '<span class="tag t-wait">추합</span>';
  if (a.res === '불합') return '<span class="tag t-no">불합</span>';
  return '';
};

const minTag = a => {
  if (a.ph !== 0) return '';
  if (a.min === '미충족') return '<span class="tag t-min">최저미달</span>';
  if (a.min === '충족') return '<span class="tag t-minok">최저충족</span>';
  return '';
};

/* 예비번호는 호명 여부와 상관없이 결과 배지 앞에 둡니다.
   그래야 「예비43 추합」과 「예비12 불합」이 같은 자리에서 비교됩니다. */
const waitTag = a => (a.wait ? `<span class="tag t-cand">예비${esc(a.wait)}</span>`
  /* 추합인데 원본에 예비번호가 비어 있으면 빈자리로 두지 않고 「미기재」로 드러냅니다 — 없는 번호를 지어내지는 않습니다. */
  : (a.res === '추합' ? '<span class="tag t-cand dim" title="원본 자료의 예비번호 칸이 비어 있습니다">예비 미기재</span>' : ''));

const appRow = a => `<div class="app${isPass({ a }) ? ' pass' : ''}">
  <span class="tk">${esc(a.ph === 1 ? (a.grp || '정시') : (a.track || ''))}</span>
  <span class="nm"><span class="un">${esc(a.univ)}</span><span class="dp">${esc(a.dept || '')}</span></span>
  <span class="rt">${minTag(a)}${waitTag(a)}${resTag(a)}</span></div>`;

/* 크게 보기 창 안의 한 줄. 목록보다 글자를 키웁니다. */
const bigRow = a => `<div class="md-r">
  <span class="tk">${esc(a.ph === 1 ? (a.grp || '정시') : (a.track || ''))}</span>
  <span class="nm"><span class="un">${esc(a.univ)}</span><div class="dp">${esc(a.dept || '')}</div></span>
  <span class="rt">${minTag(a)}${waitTag(a)}${resTag(a)}</span></div>`;

/* ── 학생 카드 (좌측) ────────────────────────────────── */

const SUBN = ['국', '영', '수', '사', '과'];
/* 성적표 열 순서는 국·수·영·사·과입니다. 화면에는 국·영·수 순으로 보여 줍니다. */
const SUBI = [0, 2, 1, 3, 4];

/* 내신 입력칸 옆 카드.
   성적표 맨 뒤의 묶음 교과(국수영사과 등)가 채워져 있으면 그것을 보여 주고,
   비어 있으면 교과별 등급을 늘어놓습니다.
   5등급과 9등급이 둘 다 있으면 5등급을 앞에 씁니다 — 1·2학년은 5등급이 기준입니다. */
export function gpaSubs(st, meta) {
  if (!st) return '';
  const cell = (lab, x) => (x == null ? ''
    : `<div><span>${esc(lab)}</span><b>${x.toFixed(2)}</b></div>`);
  const name = (meta?.combos || []).find(n => st.cb?.[n]);
  if (name) {
    const v = st.cb[name];
    return `<div class="cbt">${esc(name)}</div>
      <div class="cbv">${cell('5등급', v.g5)}${cell('9등급', v.g9)}</div>`;
  }
  if (!st.s) return '';
  return `<div class="cbt">교과별 <span class="wn">9등급</span></div>
    <div class="cbv many">${SUBI.map((j, i) => cell(SUBN[i], st.s[j])).join('')}</div>`;
}

export function studentCard(st, total, meta) {
  const g = st.g;
  /* 1·2학년 성적표(5등급 세대)의 학년별·전교과 값은 9등급 환산이라, 학생부에 적힌 5등급과 다릅니다. 표시해 둡니다. */
  const conv = meta?.has5 ? '<div class="fine">학년별·전교과는 9등급 환산 — 학생부의 5등급은 아래 칸에 따로 나옵니다.</div>' : '';
  const d = (g[2] != null && g[0] != null) ? g[2] - g[0] : null;
  const trend = d == null ? ''
    : d < -0.15 ? `<span class="up">1학년 대비 ${Math.abs(d).toFixed(2)} 상승</span>`
      : d > 0.15 ? `<span class="down">1학년 대비 ${d.toFixed(2)} 하락</span>`
        : '1학년 대비 큰 변화 없음';
  return `<div class="who">${esc(st.nm)}<small>${esc(clsLabel(st.c))} ${st.no}번</small></div>
    <div class="rk">${st.r != null ? `전교 ${st.r}위 / ${total}명 · ` : ''}${trend}</div>
    <div class="trend">
      ${[0, 1, 2].map(i => `<div><span>${i + 1}학년</span><b>${g[i] != null ? g[i].toFixed(2) : '—'}</b></div>`).join('')}
      <div class="cur"><span>전교과</span><b>${g[3].toFixed(2)}</b></div>
    </div>${conv}`;
  /* 교과별 등급은 바로 아래 「내신 전교과」 칸 옆에 나오므로 여기서는 뺍니다. */
}

/* ── 요약 ────────────────────────────────────────────── */

export function statBar(sel, sum) {
  const [lo, hi] = sum.gpaRange;
  return `
  <div class="stat"><b>${sel.length}명</b><i>유사 학생 · 내신 ${lo.toFixed(2)}~${hi.toFixed(2)}</i></div>
  <div class="stat"><b>${sum.su.length}건</b><i>수시 지원 (1인 평균 ${sum.cardsPerStudent.toFixed(1)}장)</i></div>
  <div class="stat"><b class="ok">${pct1(sum.nSuPass, sum.su.length)}%</b><i>수시 건별 합격률 (${sum.nSuPass}건)</i></div>
  <div class="stat"><b class="brand">${pct(sum.stuSuPass.size, sum.stuSu.size)}%</b><i>1개 이상 합격 (${sum.stuSuPass.size}/${sum.stuSu.size}명)</i></div>`;
}

export function headline(sum, sel, gpa, myAvg, studentName) {
  const ns = sum.nonsul;
  let warn = false;
  let s = (studentName ? `<span class="who-tag">${esc(studentName)}</span>` : '')
    + `내신 <b>${gpa.toFixed(2)}</b>${myAvg != null ? ` · 수능 평균 <b>${myAvg.toFixed(1)}등급</b>` : ''} 근처 학생 ${sel.length}명 기준입니다. `
    + `수시 카드 ${sum.su.length}장 중 ${sum.nSuPass}장이 합격으로 이어졌고, `
    + `<b>${sum.stuSuPass.size}명(${pct(sum.stuSuPass.size, sum.stuSu.size)}%)</b>이 최소 한 곳에 붙었습니다.`;
  if (ns.n) {
    s += ` 논술은 ${ns.n}장 중 ${ns.pass}장 합격(${pct1(ns.pass, ns.n)}%)`;
    if (ns.miss) {
      s += `이고, 그중 <b class="warn">${ns.miss}장(${pct(ns.miss, ns.n)}%)은 수능최저 미충족</b>으로 사실상 버려진 카드였습니다.`;
      warn = true;
    } else s += '입니다.';
  }
  return `<div class="note${warn ? ' warn' : ''}">${s}</div>`;
}

/* ── 탭 본문 ─────────────────────────────────────────── */

/* 유사 학생 한 명 = 사례 한 건. 목록과 「크게 보기」 창이 같은 배열을 씁니다. */
export function buildCases(sel, rows, mode) {
  const out = [];
  for (const s of sel) {
    const mine = rows.filter(r => r.s.p.pk === s.p.pk);
    if (!mine.length) continue;
    out.push({
      p: s.p, mode,
      su: mine.filter(r => r.a.ph === 0).map(r => r.a),
      jg: mine.filter(r => r.a.ph === 1).map(r => r.a),
      won: mine.filter(isPass).map(r => r.a),
    });
  }
  return out;
}

const outTag = c => (c.won.length
  ? `<span class="out t-ok">${esc(c.won[0].univ)}${c.mode === 'susi' && c.won[0].ph === 1 ? ' · 정시' : ''}${c.won.length > 1 ? ` 外 ${c.won.length - 1}` : ''}</span>`
  : '<span class="out t-no">전체 불합</span>');

const ZOOM = '<span class="zoom">크게 보기</span>';

/* 결과 필터 줄 — 탭 아래, 첫 카드 위. 학생 단위로 「합격 있음 / 전부 불합」을 거르고,
   「합격 줄만 보기」는 카드 안의 불합 줄을 접습니다. 실제 걸러내기는 main.js 가 상태를 들고 합니다. */
export function caseFilterBar(cases) {
  const ok = cases.filter(c => c.won.length).length;
  return `<div class="fbar"><span class="fl">결과</span>
    <button class="fc" data-f="all" aria-pressed="true">전체<span class="c">${cases.length}</span></button>
    <button class="fc ok" data-f="ok">합격 있음<span class="c">${ok}</span></button>
    <button class="fc no" data-f="no">전부 불합<span class="c">${cases.length - ok}</span></button>
    <label class="sw"><input type="checkbox" id="onlyok"> 카드 안에서 합격 줄만 보기</label></div>`;
}

export function similarStudents(cases) {
  const html = cases.map((c, i) => `<div class="stu${c.won.length ? ' win' : ''}" data-case="${i}" data-win="${c.won.length ? 1 : 0}">
    <div class="stu-h"><span class="idx">${i + 1}</span><span class="yr">${c.p.y}</span>
      <span class="gpa">내신 ${c.p.g[3] != null ? c.p.g[3].toFixed(2) : '—'}</span>
      <span class="csat">${csatStr(c.p.csat)}</span>${outTag(c)}${ZOOM}</div>
    ${c.su.map(appRow).join('')}
    ${c.jg.length ? `<div class="app sep"><span class="tk brand">정시</span><span class="mut">${c.jg.length}건</span></div>` + c.jg.map(appRow).join('') : ''}
  </div>`).join('');
  return html ? caseFilterBar(cases) + `<div class="stugrid">${html}</div>` : '<div class="empty">표시할 지원 기록이 없습니다.</div>';
}

export function univTable(list) {
  if (!list.length) return '<div class="empty">집계할 수시 기록이 없습니다.</div>';
  return `<div class="note">유사 학생들이 실제로 지원한 대학·전형입니다. <b>합격 열에 숫자가 있는 행</b>이 이 성적대에서 실제로 뚫린 조합입니다. 열 제목을 누르면 정렬됩니다.</div>
  <div class="tbl-wrap"><table data-sortable>
  <thead><tr><th>대학</th><th>전형</th><th class="n">지원</th><th class="n">합격</th><th class="n">합격률</th><th class="n">합격자 내신</th><th class="n">최저미달</th></tr></thead>
  <tbody>${list.map(o => `<tr>
    <td>${esc(o.univ)}</td><td class="mut">${esc(o.track || '')}</td>
    <td class="n">${o.n}</td>
    <td class="n ${o.h ? 'ok' : 'mut'}" data-v="${o.h}"><b>${o.h}</b></td>
    <td class="n" data-v="${o.n ? o.h / o.n : 0}">${pct(o.h, o.n)}%</td>
    <td class="n mut" data-v="${o.gs.length ? Math.min(...o.gs) : 99}">${o.gs.length ? `${Math.min(...o.gs).toFixed(2)} ~ ${Math.max(...o.gs).toFixed(2)}` : '—'}</td>
    <td class="n ${o.miss ? 'warn' : 'mut'}" data-v="${o.miss}">${o.miss || '—'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

export function trackTable(list, sum) {
  if (!list.length) return '<div class="empty">집계할 기록이 없습니다.</div>';
  const maxN = Math.max(1, ...list.map(o => o.n));
  const totN = sum.su.length || 1, totH = sum.nSuPass || 1;
  return `<div class="note">같은 성적대 학생들이 <b>어디에 카드를 썼고, 어디서 실제로 붙었는지</b>를 비교합니다. 지원 비중이 합격 비중보다 훨씬 큰 전형이 카드가 새는 곳입니다.</div>
  <div class="tbl-wrap"><table data-sortable>
  <thead><tr><th>전형</th><th class="n">지원</th><th class="n">지원 비중</th><th class="n">합격</th><th class="n">합격 비중</th><th class="n">합격률</th><th class="n">최저미달</th></tr></thead>
  <tbody>${list.map(o => `<tr>
    <td><span class="bar" style="width:${Math.round((o.n / maxN) * 54)}px"></span><b>${esc(o.track)}</b></td>
    <td class="n">${o.n}</td>
    <td class="n mut">${pct(o.n, totN)}%</td>
    <td class="n ${o.h ? 'ok' : 'mut'}" data-v="${o.h}"><b>${o.h}</b></td>
    <td class="n mut">${sum.nSuPass ? pct(o.h, totH) : 0}%</td>
    <td class="n" data-v="${o.h / o.n}">${pct(o.h, o.n)}%</td>
    <td class="n ${o.miss ? 'warn' : 'mut'}" data-v="${o.miss}">${o.miss || '—'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

export function jeongsiTable(list, sum) {
  if (!list.length) return '<div class="empty">이 성적대의 정시 기록이 없습니다.</div>';
  return `<div class="note">유사 학생들의 정시 지원 ${sum.jg.length}건 중 ${sum.nJgPass}건 합격(${pct(sum.nJgPass, sum.jg.length)}%). 정시 시트의 내신은 3학년 2학기까지 반영되어 수시 내신과 값이 다릅니다.</div>
  <div class="tbl-wrap"><table data-sortable>
  <thead><tr><th>대학</th><th>군</th><th class="n">지원</th><th class="n">합격</th><th>합격 학과</th></tr></thead>
  <tbody>${list.map(o => `<tr>
    <td>${esc(o.univ)}</td><td class="mut nw">${esc(o.grp)}</td>
    <td class="n">${o.n}</td>
    <td class="n ${o.h ? 'ok' : 'mut'}" data-v="${o.h}"><b>${o.h}</b></td>
    <td class="mut">${esc([...o.depts].join(', ')) || '—'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

export function baselinePanel(b) {
  const find = t => b.tracks.find(x => x.track === t);
  const show = ['교과', '종합', '실기', '논술'].map(t => {
    const o = find(t);
    if (!o) return null;
    const v = `${(o.rate * 100).toFixed(1)}%`;
    return t === '논술' ? `<b class="warn">${t} ${v}</b>` : t === '교과' ? `<b>${t} ${v}</b>` : `${t} ${v}`;
  }).filter(Boolean).join(' · ');
  return `수시 전형별 합격률<br>${show}
    <span class="hr">수능최저 <b>충족 논술 ${(b.minOk.rate * 100).toFixed(1)}%</b> / <b class="warn">미충족 ${(b.minNo.rate * 100).toFixed(1)}%</b><br>
    논술 지원 ${b.minOk.n + b.minNo.n}건 중 ${pct(b.minNo.n, b.minOk.n + b.minNo.n)}%가 최저 미충족 상태</span>`;
}

/* ── 표 정렬 ─────────────────────────────────────────── */

export function enableSort(root) {
  root.querySelectorAll('table[data-sortable]').forEach(tbl => {
    tbl.querySelectorAll('th').forEach((th, i) => {
      th.addEventListener('click', () => {
        const dir = th.dataset.dir === 'desc' ? 'asc' : 'desc';
        tbl.querySelectorAll('th').forEach(x => delete x.dataset.dir);
        th.dataset.dir = dir;
        const body = tbl.tBodies[0];
        [...body.rows].sort((x, y) => {
          const a = x.cells[i].dataset.v ?? x.cells[i].textContent;
          const b = y.cells[i].dataset.v ?? y.cells[i].textContent;
          const na = parseFloat(a), nb = parseFloat(b);
          const r = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a).localeCompare(String(b), 'ko');
          return dir === 'asc' ? r : -r;
        }).forEach(row => body.appendChild(row));
      });
    });
  });
}

/* ══ 정시 모드 ═══════════════════════════════════════ */

const pctAvgOf = c => {
  if (!c) return null;
  const v = [c.pk, c.pm, c.ps1, c.ps2].filter(x => x != null);
  return v.length >= 3 ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const stdSum = c => {
  if (!c) return null;
  const v = [c.sk, c.sm, c.ss1, c.ss2].filter(x => x != null);
  return v.length === 4 ? v.reduce((s, x) => s + x, 0) : null;
};

/* 사이드바 — 모의고사 학생 카드 */
export function mockCard(st, total) {
  const g = st.grade, p = st.pct, s = st.std;
  const f = x => (x == null ? '—' : x);
  const avg = [p.k, p.m, p.s1, p.s2].filter(x => x != null);
  const pa = avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length) : null;
  const ss = [s.k, s.m, s.s1, s.s2].every(x => x != null) ? s.k + s.m + s.s1 + s.s2 : null;
  return `<div class="who">${esc(st.nm)}<small>${esc(clsLabel(st.c))} ${st.no}번</small></div>
    <div class="rk">${st.r != null ? `${st.r}위 / ${total}명 · ` : ''}백분위 평균 <b class="up">${pa != null ? pa.toFixed(1) : '—'}</b>${ss != null ? ` · 표점합 ${ss}` : ''}</div>
    <div class="mk">
      <div class="mk-h"><span></span><span>국</span><span>수</span><span>영</span><span>탐1</span><span>탐2</span></div>
      <div class="mk-r"><span>등급</span><b>${f(g.k)}</b><b>${f(g.m)}</b><b>${f(g.e)}</b><b>${f(g.s1)}</b><b>${f(g.s2)}</b></div>
      <div class="mk-r"><span>백분위</span><b>${f(p.k)}</b><b>${f(p.m)}</b><b class="dim">—</b><b>${f(p.s1)}</b><b>${f(p.s2)}</b></div>
      <div class="mk-r"><span>표점</span><b>${f(s.k)}</b><b>${f(s.m)}</b><b class="dim">—</b><b>${f(s.s1)}</b><b>${f(s.s2)}</b></div>
    </div>
    <div class="mk-sub">${esc(st.subj.s1 || '')}${st.subj.s2 ? ' · ' + esc(st.subj.s2) : ''}${g.h ? ` · 한국사 ${g.h}등급` : ''}</div>`;
}

export function jeongsiStatBar(sel, sum) {
  const [lo, hi] = sum.pctRange;
  return `
  <div class="stat"><b>${sel.length}명</b><i>유사 졸업생 · 백분위 ${lo.toFixed(0)}~${hi.toFixed(0)}</i></div>
  <div class="stat"><b>${sum.jg.length}건</b><i>정시 지원 (1인 평균 ${sum.cardsPerStudent.toFixed(1)}장)</i></div>
  <div class="stat"><b class="ok">${pct1(sum.nPass, sum.jg.length)}%</b><i>정시 건별 합격률 (${sum.nPass}건)</i></div>
  <div class="stat"><b class="brand">${pct(sum.stuPass.size, sum.stu.size)}%</b><i>1개 이상 합격 (${sum.stuPass.size}/${sum.stu.size}명)</i></div>`;
}

export function jeongsiHeadline(sum, sel, pctIn, eng, name, groups, exam) {
  const f = x => (x == null ? '·' : Math.round(x));
  const best = groups.length ? [...groups].sort((a, b) => (b.h / b.n) - (a.h / a.n))[0] : null;
  let s = (name ? `<span class="who-tag">${esc(name)}</span>` : '')
    + `백분위 국 <b>${f(pctIn.k)}</b> · 수 <b>${f(pctIn.m)}</b> · 탐 <b>${f(pctIn.s1)}</b>·<b>${f(pctIn.s2)}</b>`
    + (eng != null ? ` · 영어 <b>${eng}등급</b>` : '')
    + ` 근처 졸업생 ${sel.length}명 기준입니다. 정시 ${sum.jg.length}장 중 ${sum.nPass}장이 합격으로 이어졌고, `
    + `<b>${sum.stuPass.size}명(${pct(sum.stuPass.size, sum.stu.size)}%)</b>이 최소 한 곳에 붙었습니다.`;
  if (best && best.n >= 5) s += ` 이 성적대에서는 <b>${esc(best.grp)}</b> 합격률이 가장 높았습니다(${pct(best.h, best.n)}%).`;
  const label = exam?.label || '모의고사';
  const isReal = exam?.org === '수능';
  const warn = isReal
    ? ''
    : `<div class="note warn"><b>${esc(label)} 성적이 수능까지 유지된다는 가정</b>입니다.
    ${exam?.org === '교육청' ? '교육청 모의고사는 재수생이 빠져 있고 범위도 좁아 실제 수능보다 백분위가 높게 나오는 경향이 있습니다. ' : ''}목표 설정용으로 보시고 보수적으로 읽어 주세요.</div>`;
  return `<div class="note">${s}</div>${warn}`;
}

/* 정시 카드 머리의 백분위 상세. 크게 보기 창에서도 씁니다. */
const jgDetail = c => {
  if (!c) return '<span style="opacity:.6">수능 기록 없음</span>';
  const f = x => (x == null ? '·' : Math.round(x));
  const ss = stdSum(c);
  return `국 ${f(c.pk)} · 수 ${f(c.pm)} · 탐 ${f(c.ps1)}·${f(c.ps2)}`
    + `${c.e != null ? ` · 영 ${c.e}등급` : ''}${ss != null ? ` · 표점합 ${ss}` : ''}`;
};

export function jeongsiStudents(cases) {
  const html = cases.map((c, i) => {
    const pa = pctAvgOf(c.p.csat);
    return `<div class="stu${c.won.length ? ' win' : ''}" data-case="${i}" data-win="${c.won.length ? 1 : 0}">
      <div class="stu-h"><span class="idx">${i + 1}</span><span class="yr">${c.p.y}</span>
        <span class="gpa">백분위 ${pa != null ? pa.toFixed(1) : '—'}</span>
        <span class="csat">${jgDetail(c.p.csat)}</span>${outTag(c)}${ZOOM}</div>
      ${c.su.concat(c.jg).map(appRow).join('')}
    </div>`;
  }).join('');
  return html ? caseFilterBar(cases) + `<div class="stugrid">${html}</div>` : '<div class="empty">표시할 정시 기록이 없습니다.</div>';
}

/* ── 사례 크게 보기 ─────────────────────────────────── */

export function caseView(c, i, n) {
  const pa = pctAvgOf(c.p.csat);
  const big = c.mode === 'jg'
    ? `백분위 ${pa != null ? pa.toFixed(1) : '—'}<small>내신 ${c.p.g[3] != null ? c.p.g[3].toFixed(2) : '—'}</small>`
    : `내신 ${c.p.g[3] != null ? c.p.g[3].toFixed(2) : '—'}<small>${pa != null ? `수능 백분위 ${pa.toFixed(1)}` : '수능 기록 없음'}</small>`;
  const chips = c.mode === 'jg'
    ? jgDetail(c.p.csat).split(' · ').map(x => `<span>${x}</span>`).join('')
    : [[0, '1학년'], [1, '2학년'], [2, '3학년']]
      .map(([k, t]) => `<span>${t} ${c.p.g[k] != null ? c.p.g[k].toFixed(2) : '—'}</span>`).join('')
      + (c.p.csat ? `<span>${jgDetail(c.p.csat)}</span>` : '');
  const res = c.won.length
    ? `합격 ${c.won.length}건 — ${c.won.map(a => esc(a.univ) + (a.dept ? ' ' + esc(a.dept) : '')).join(', ')}`
    : '합격 없음 — 전체 불합';
  const grp = (t, arr) => (arr.length ? `<div class="md-g">${t}</div>` + arr.map(bigRow).join('') : '');
  return {
    win: c.won.length > 0,
    cnt: `${i + 1} / ${n}`,
    yr: `${c.p.y}학년도`,
    big, chips,
    res, resNo: !c.won.length,
    body: grp(`수시 ${c.su.length}장`, c.su) + grp(`정시 ${c.jg.length}건`, c.jg),
  };
}

export function jeongsiUnivTable(list) {
  if (!list.length) return '<div class="empty">집계할 정시 기록이 없습니다.</div>';
  const item = (x, ok) => {
    const bits = [];
    if (x.pct != null) bits.push(`백 ${x.pct.toFixed(0)}`);
    if (x.wait) bits.push(`예비${esc(x.wait)}${ok ? ' 추합' : ''}`);
    return `<span class="dl${ok ? ' ok' : ''}">${esc(x.dept)}${bits.length ? ` <i>${bits.join(' · ')}</i>` : ''}</span>`;
  };
  return `<div class="note">유사 졸업생들이 실제로 지원한 대학입니다. 학과 옆 <b>백</b>은 그 졸업생의 백분위 4과목 평균,
    <b>예비 n 추합</b>은 그 번호로 호명된 것, 불합 쪽의 <b>예비 n</b>은 번호를 받고도 호명되지 못한 것입니다.</div>
  <div class="tbl-wrap"><table data-sortable>
  <thead><tr><th>대학</th><th>군</th><th class="n">지원</th><th class="n">합격</th><th>합격 학과</th><th>불합 학과</th></tr></thead>
  <tbody>${list.map(o => `<tr>
    <td>${esc(o.univ)}</td><td class="mut nw">${esc(o.grp)}</td>
    <td class="n">${o.n}</td>
    <td class="n ${o.h ? 'ok' : 'mut'}" data-v="${o.h}"><b>${o.h}</b></td>
    <td class="dlist">${o.pass.map(x => item(x, true)).join('') || '<span class="mut">—</span>'}</td>
    <td class="dlist">${o.fail.map(x => item(x, false)).join('') || '<span class="mut">—</span>'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

export function groupTable(list, sum) {
  if (!list.length) return '<div class="empty">집계할 기록이 없습니다.</div>';
  const maxN = Math.max(1, ...list.map(o => o.n));
  return `<div class="note">같은 성적대 졸업생들이 <b>가·나·다군에 어떻게 카드를 썼고 어디서 붙었는지</b>입니다.</div>
  <div class="tbl-wrap"><table data-sortable>
  <thead><tr><th>군</th><th class="n">지원</th><th class="n">지원 비중</th><th class="n">합격</th><th class="n">합격률</th></tr></thead>
  <tbody>${list.map(o => `<tr>
    <td><span class="bar" style="width:${Math.round((o.n / maxN) * 54)}px"></span><b>${esc(o.grp)}</b></td>
    <td class="n">${o.n}</td>
    <td class="n mut">${pct(o.n, sum.jg.length || 1)}%</td>
    <td class="n ${o.h ? 'ok' : 'mut'}" data-v="${o.h}"><b>${o.h}</b></td>
    <td class="n" data-v="${o.n ? o.h / o.n : 0}">${pct(o.h, o.n)}%</td>
  </tr>`).join('')}</tbody></table></div>`;
}

/* ── 정시 배치 탭 ────────────────────────────────────── */

const fmt1 = x => (x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1));
const sign = x => (x > 0 ? '+' : '') + fmt1(x);

const stat = (o, label) => o ? `<span class="ss"><i>${esc(label)}</i> ${o.n}건 · <b class="${o.h ? 'ok' : 'mut'}">합 ${o.h}</b></span>` : '';

export function placementTable(res, opts) {
  const { exam, cutMeta, gyLabel } = opts || {};
  if (!res || res.my == null) return '<div class="empty">국·수·탐 백분위를 입력하면 배치 결과가 나옵니다.</div>';
  if (!res.list.length) return `<div class="empty">배치기준표에 이 성적대(백분위 평균 ${fmt1(res.my)})와 비교할 학과가 없습니다.<br>
    <span class="fine">관리자가 배치기준표에 대학을 더 넣으면 늘어납니다.</span></div>`;
  const cnt = JUDGE.map(([n, c]) => [n, c, res.list.filter(x => x.jc === c).length]);
  const def = (cnt.find(x => x[1] === 'fit' && x[2] > 0) ? 'fit' : 'all');
  const label = exam?.label || '모의고사';
  const yr = (res.years || []).join('·');
  const head = `<div class="note"><b>${esc(label)}</b> 백분위 평균 <b>${fmt1(res.my)}</b> (국·수·탐 3영역) 기준으로,
    대학과 대교협이 공개한 <b>${esc(yr)}학년도 최종등록자 컷</b>과 비교했습니다.
    <span class="fine">대학마다 탐구 반영 과목 수·영어 처리·표본이 달라 <b>±2 정도는 오차</b>로 보셔야 합니다.
    배치기준표에 실린 <b>${cutMeta?.nUniv || 0}개 대학 · ${cutMeta?.n || 0}개 모집단위</b>만 나옵니다.
    기준이 <span class="sch-k">우리 학교</span>로 적힌 줄은 대학이 공개한 학과별 컷이 아니라
    <b>우리 학교 졸업생이 실제로 합격한 백분위의 중앙값</b>이라 학과 구분이 없습니다.</span></div>
  <div class="pl-tools">
    <div class="chips" id="plchips"><button class="chip" data-j="all" aria-pressed="${def === 'all'}">전체 <small>${res.list.length}</small></button>
      ${cnt.map(([n, c, k]) => `<button class="chip j-${c}" data-j="${c}" aria-pressed="${def === c}" ${k ? '' : 'disabled'}>${n} <small>${k}</small></button>`).join('')}</div>
    <input type="search" id="plq" placeholder="대학·학과 찾기">
  </div>`;
  const rows = res.list.map(x => `<tr class="pl j-${x.jc}${(def === 'all' || def === x.jc) ? '' : ' hidden'}" data-j="${x.jc}" data-q="${esc((x.univ + ' ' + x.dept).toLowerCase())}">
    <td><span class="tag jt jt-${x.jc}">${x.jn}</span></td>
    <td class="nw"><b>${esc(x.univ)}</b>${x.campus ? `<span class="mut"> ${esc(x.campus)}</span>` : ''}</td>
    <td class="mut nw">${x.group ? esc(x.group) + '군' : ''}</td>
    <td class="dp2">${esc(x.dept)}${x.track && !/일반|^수능/.test(x.track) ? `<span class="mut"> · ${esc(x.track)}</span>` : ''}
      ${x.note ? `<span class="info" title="${esc(x.note)}">ⓘ</span>` : ''}</td>
    <td class="n nw" data-v="${x.base}">${fmt1(x.base)}<span class="mut${x.kind === '우리 학교' ? ' sch-k' : ''}"> ${esc(x.kind)}</span></td>
    <td class="n nw ${x.diff >= 0 ? 'ok' : 'no'}" data-v="${x.diff}">${x.kind === '등급' ? sign(x.diff) + '등급' : sign(x.diff)}</td>
    <td class="n mut nw">${x.quota ?? ''}${x.wait ? `<span class="mut"> · 충원 ${esc(x.wait)}</span>` : ''}</td>
    <td class="sch">${stat(x.sim, '유사')}${stat(x.deptStat, '학과')}${!x.deptStat ? stat(x.univStat, '대학') : ''}${(!x.sim && !x.deptStat && !x.univStat) ? '<span class="mut">사례 없음</span>' : ''}</td>
  </tr>`).join('');
  return `${head}<div class="tbl-wrap"><table data-sortable class="pltbl">
  <thead><tr><th>판정</th><th>대학</th><th>군</th><th>모집단위</th><th class="n">대학 기준</th><th class="n">차이</th><th class="n">모집·충원</th><th>우리 학교 정시 사례</th></tr></thead>
  <tbody>${rows}</tbody></table></div>
  <div class="note fine">처음에는 <b>적정</b>만 보여 드립니다. 위 칩으로 안정·소신·상향도 볼 수 있습니다.
    판정 기준: 안정 +2 이상 · 적정 0 이상 · 소신 −1.5 이상 · 상향 −3 이상 · 도전 그 아래. 「평균」으로만 공개한 대학은 70%컷보다 0.7 높다고 보고 보정했습니다.
    「유사」는 이 화면의 유사 졸업생, 「학과」·「대학」은 우리 학교 5개년 정시 지원 전체입니다.</div>`;
}

/* ── 선택과목 구성 ─────────────────────────────────── */


const TCLS = { core: 't-core', rec: 't-rec', gen: 't-gen', genrec: 't-gen' };

/* 받침이 있으면 「이」, 없으면 「가」 */
function josa(name, a, b) {
  const c = String(name || '').trim().slice(-1).charCodeAt(0);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : true;
  return has ? a : b;
}

function pane(cls, title, body, src, memo) {
  return `<div class="pane ${cls || ''}"><div class="ph"><span class="bar"></span>
    <span class="tt">${esc(title)}</span>${src ? `<span class="src">${esc(src)}</span>` : ''}</div>
    <div class="pb">${body}</div>
    ${memo ? `<div class="memo"><span class="lb">학교 메모</span>${esc(memo)}</div>` : ''}</div>`;
}

export function fieldList(sel, picked, q) {
  const by = {};
  for (const n of sel.order) { const f = sel.fields[n]; (by[f.gy] = by[f.gy] || []).push(f); }
  let h = '';
  for (const gy of ['인문', '사회', '교육', '자연', '공학', '의약', '예체능']) {
    const list = (by[gy] || []).filter(f => !q || f.name.includes(q));
    if (!list.length) continue;
    h += `<div class="gy">${esc(gy)}</div>`;
    for (const f of list)
      h += `<button data-f="${esc(f.name)}" aria-pressed="${picked.some(p => p.name === f.name)}">`
        + `${esc(f.name)}<span class="n">${f.nOwn + f.nGen}곳</span></button>`;
  }
  return h || '<div class="gy">찾는 분야가 없습니다</div>';
}

export function pickedChips(picked) {
  return picked.map(f => `<span class="pk"><b>${esc(f.name)}</b><button data-x="${esc(f.name)}">×</button></span>`).join('');
}

/* 분야 설명 — 표에 있는 값만 조합합니다. */
function fieldPane(f, sel, WHERE) {
  const s = summaryOf(f, sel), p = [];
  if (s.areas.length) p.push(`교과로는 ${s.areas.map(([k, v]) => `<b>${esc(k)}</b>(${v.n}곳)`).join(', ')}을 봅니다.`);
  if (s.already.length) p.push(`이 중 ${s.already.map(([k]) => esc(k)).join('·')}은 우리 학교에서 전원이 이미 듣습니다.`);
  if (s.topick.length) p.push(`직접 골라야 하는 것은 ${s.topick.map(([k, v]) =>
    `<b>${esc(k)}</b> <span class="fine">(${v.n}곳 · ${esc(WHERE[k] || '')})</span>`).join(', ')}입니다.`);
  if (!p.length) p.push('대학이 따로 지정한 과목이 없습니다. 진로와 적성에 맞게 고르면 됩니다.');
  const src = `대교협 ${f.nOwn + f.nGen}곳` + (f.snu ? ` · 서울대 ${f.snu}` : '');
  const pref = f.pref ? `<br><span class="fine">서울대 우선 이수 권장 — ${esc(f.pref)}</span>` : '';
  return pane('', f.name, p.join(' ') + pref, src, f.memo);
}

/* 「2학년 → 3학년 선택」 화면 — 3학년 상자 위에 「지금 듣고 있는 과목」을 깔아 둡니다.
   이 분야와 관계있는 과목을 앞에, 나머지는 「그 외」로 접고, 핵심 과목 진행을 한 줄로 보여 줍니다. */
function takenBlock(sel, picked, stu, choice, TK) {
  const by = stu?.by || {};
  const sems = Object.keys(by).filter(k => k.startsWith('2')).sort();
  if (!sems.length) return '';
  const kindOf = s => [sel.school.kind[s], sel.school.area[s]].filter(Boolean).join(' · ');
  let total = 0;
  const cols = sems.map(sem => {
    const subs = by[sem] || []; total += subs.length;
    const rel = [], etc = [];
    for (const sub of subs) { const m = mergeSub(picked, sub); if (m) rel.push({ s: sub, m }); else etc.push(sub); }
    rel.sort((a, b) => TIER_RANK[a.m.t] - TIER_RANK[b.m.t] || (b.m.n || 0) - (a.m.n || 0));
    const rows = rel.map(r => `<div class="tk-row"><span class="bx">✓</span><b>${esc(r.s)}</b><i>${esc(kindOf(r.s))}</i>
      <span class="rt">${r.m.n ? `<span class="why">${r.m.n}곳</span>` : ''}<span class="tag ${TCLS[r.m.t]}">${TIER_NAME[r.m.t]}</span></span></div>`).join('');
    const etcHtml = etc.length ? `<div class="tk-etc"><b>그 외 ${etc.length}과목</b> — ${etc.map(esc).join(', ')}</div>`
      : (rel.length ? '' : '<div class="tk-etc">선택 기록이 없습니다.</div>');
    return `<div class="tk-sem"><div class="th">${esc(semLabel(sem))}<small>${subs.length}과목</small></div>${rows}${etcHtml}</div>`;
  }).join('');

  /* 핵심 과목 진행 — 이수한 것 / 3학년에서 고를 것 / 2학년에 있었는데 안 들은 것 */
  const seen = new Set(), pills = [];
  const push = (sub, sem, g) => {
    if (seen.has(sub)) return; seen.add(sub);
    const m = mergeSub(picked, sub); if (!m || m.t !== 'core') return;
    if (TK.has(sub)) pills.push(`<span class="pill done">${esc(sub)} ✓</span>`);
    else if (String(sem).startsWith('3')) pills.push(`<span class="pill todo">${esc(sub)} → ${esc(semLabel(sem))}${g ? ' ' + esc(g) + '그룹' : ' 전원'}</span>`);
    else if (String(sem).startsWith('1')) pills.push(`<span class="pill done">${esc(sub)} ✓ <small>1학년 공통</small></span>`);
    else pills.push(`<span class="pill miss">${esc(sub)} — 2학년에 안 들음</span>`);
  };
  for (const c of sel.school.common) push(c.s, c.sem, null);
  for (const g of sel.school.groups) for (const sub of g.subs.concat(g.only2 || [])) push(sub, g.sem, g.g);
  const prog = pills.length ? `<div class="tk-prog"><span class="lab">이 분야 핵심 과목</span>${pills.join('')}</div>` : '';

  const year = choice?.meta?.year;
  const now = new Date(); const cur = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  const old = year && year < cur;
  return `<div class="takenblk${old ? ' old' : ''}"><div class="bh"><span class="h">2학년 — 지금 듣고 있는 과목
      <small>${year ? `${year}학년도 ` : ''}반별 선택 기준 · 이 분야와 관계있는 것만 앞에${old ? ' · <b>작년 자료입니다</b>' : ''}</small></span>
      <span class="n">1·2학기 ${total}과목 이수 중</span></div>
    <div class="bd">${cols}${prog}</div></div>`;
}

export function selPanel(sel, st) {
  const { picked, grade, chosen, taken, choice, sumOpen, openG } = st;
  const WHERE = whereOf(sel);
  const G = groupsFor(sel, grade);
  const TK = new Set(taken || []);
  const timeOf = (sem, g) => sub => {
    const T = choice?.sem?.[sem]?.time?.[g];
    return T ? Object.keys(T).filter(k => T[k][sub] != null).sort() : [];
  };
  const cntOf = (sem, sub) => choice?.sem?.[sem]?.count?.[sub];

  /* 카드 위 안내 */
  const good = [], warn = [];
  const commonCore = sel.school.common.filter(c => {
    const m = mergeSub(picked, c.s); return m && (m.t === 'core' || m.t === 'rec');
  }).map(c => `${esc(c.s)} <span class="fine">(${esc(semLabel(c.sem))})</span>`);
  if (commonCore.length)
    good.push(`이 분야가 핵심·권장으로 꼽은 과목 중 <b>우리 학교에서 전원이 이미 듣는 것</b> — ${commonCore.join(', ')}`);

  if (grade === 2 && st.stu) {
    const pr = sciProgress(TK);
    const nm = `<b>${esc(st.stu.nm)}</b>${josa(st.stu.nm, '이', '가')}`;
    const line = `${nm} 2학년에 이수한 과학 — 일반선택 ${pr.gen.length ? esc(pr.gen.join(', ')) : '없음'}`
      + ` / 진로선택 ${pr.car.length ? esc(pr.car.join(', ')) : '<b>없음</b>'}`;
    if (isSci(picked)) {
      if (!pr.need) good.push(line + '<br>과학 진로선택 <b>3과목을 이미 채웠습니다.</b> 3학년은 위계를 이어 가면 됩니다.');
      else warn.push(line + `<br>대학이 권장하는 <b>과학 진로선택 3과목</b>까지 <b>${pr.need}과목</b>이 남았습니다.`
        + (pr.gen.length ? '' : '<br>2학년에 과학 일반선택도 없어서, 3학년에 진로선택만 듣는 것은 <b>위계가 끊긴 이수</b>로 보일 수 있습니다.'));
    } else if (pr.gen.length || pr.car.length) good.push(line);
    /* 자연계가 아닌 분야에서 「과학 없음」은 알릴 일이 아니라 그냥 넘어갑니다. */
    const mine = (st.stu.taken || []).filter(x => mergeSub(picked, x));
    if (mine.length) good.push(`${nm} 2학년에 들은 과목 중 이 분야가 꼽은 것 — ${mine.map(esc).join(', ')}`);
  }

  /* 묶음 카드 — 학기마다 상자 하나로 모읍니다. 「2-1」은 「2학년 1학기」로 풀어 씁니다. */
  const semName = semLabel;
  const blocks = {};   // sem → { cards: [], pick, got }
  for (const g of G) {
    const tOf = timeOf(g.sem, g.g);
    /* 같은 과목이 학기마다 따로 있으므로 「학기|묶음|과목」으로 구분합니다. */
    const K = s => `${g.sem}|${g.g}|${s}`;
    const rows = g.subs.map(s => {
      const m = mergeSub(picked, s);
      const tms = tOf(s), n = cntOf(g.sem, s), isT = TK.has(s), on = chosen.has(K(s));
      const tag = m ? `<span class="tag ${TCLS[m.t]}">${TIER_NAME[m.t]}</span>`
        : '<span class="tag t-non">관계없음</span>';
      const cnt = n != null ? (n < 15 ? `<span class="few">2학년 ${n}명</span>` : `<span class="why">2학년 ${n}명</span>`) : '';
      return { s, m, html: `<div class="sub${on ? ' on' : ''}${isT ? ' done' : ''}" data-s="${esc(K(s))}">
        <span class="bx">${(on || isT) ? '✓' : ''}</span>
        <span class="nm"><b>${esc(s)}</b><i>${esc(sel.school.kind[s] || '')}${sel.school.area[s] ? ' · ' + esc(sel.school.area[s]) : ''}${isT ? ' · 이수함' : ''}</i></span>
        <span class="rt">${tms.map(t => `<span class="tm">${t}</span>`).join('')}${cnt}${m ? `<span class="why">${m.n}곳</span>` : ''}${tag}</span></div>` };
    });
    rows.sort((a, b) => (a.m ? TIER_RANK[a.m.t] : 9) - (b.m ? TIER_RANK[b.m.t] : 9) || (b.m?.n || 0) - (a.m?.n || 0));
    const rel = rows.filter(r => r.m || chosen.has(K(r.s)) || TK.has(r.s));
    const irr = rows.filter(r => !(r.m || chosen.has(K(r.s)) || TK.has(r.s)));
    const key = g.sem + g.g, open = openG.has(key);
    const got = g.subs.filter(s => chosen.has(K(s)));
    const T = choice?.sem?.[g.sem]?.time?.[g.g];
    const slots = T ? `<div class="slots">${Object.keys(T).sort().map(t => {
      const hit = g.subs.find(s => (chosen.has(K(s)) || TK.has(s)) && tOf(s).includes(t));
      return `<div class="slot${hit ? ' f' : ''}">${t}타임<b>${hit ? esc(hit) : '—'}</b></div>`;
    }).join('')}<div class="fine" style="flex:1 1 100%;margin-top:2px">↑ 올해 2학년 기준입니다. 내년 시간표는 아직 정해지지 않았습니다.</div></div>` : '';
    const cls = got.length === g.pick ? 'full' : (got.length > g.pick ? 'over' : '');
    const B = blocks[g.sem] = blocks[g.sem] || { cards: [], pick: 0, got: 0 };
    B.pick += g.pick; B.got += got.length;
    B.cards.push(`<div class="sem"><div class="sem-h"><span class="t">${esc(semName(g.sem))}</span>
      <span class="g">${esc(g.g)}그룹 [택${g.pick}]</span><span class="cnt ${cls}">${got.length} / ${g.pick}</span></div>
      ${slots}${rel.map(r => r.html).join('')}
      ${irr.length ? `<div class="more" data-m="${key}">${open ? '▲ 관계없는 과목 접기' : `▼ 이 분야와 관계없는 과목 ${irr.length}개`}</div>
        <div class="${open ? '' : 'hidden'}">${irr.map(r => r.html).join('')}</div>` : ''}</div>`);

    const gl = `<b>${esc(semName(g.sem))} ${esc(g.g)}그룹</b>`;
    if (got.length > g.pick) warn.push(`${gl}은 ${g.pick}개까지인데 ${got.length}개를 골랐습니다.`);
    if (got.length > 1 && !feasible(tOf, got))
      warn.push(`${gl} — 지금 고른 ${got.map(esc).join(', ')}는 <b>올해 시간표 기준으로는 함께 들을 수 없습니다.</b>`
        + ' <span class="fine">(내년 시간표는 아직 정해지지 않았습니다)</span>');
    const oc = overCore(g, picked);
    if (oc) warn.push(`${gl}에 핵심 과목이 ${oc.length}개인데 자리는 ${g.pick}개입니다 — ${oc.map(esc).join(', ')} 중에서 골라야 합니다.`);
  }
  const cards = Object.keys(blocks).sort().map(k => {
    const B = blocks[k];
    const semNo = (k.split('-')[1] || '1');
    const state = B.got === B.pick ? ' full' : (B.got > B.pick ? ' over' : '');
    return `<div class="semblk s${semNo}"><div class="bh"><span class="h">${esc(semName(k))}<small>묶음 ${B.cards.length}개에서 과목 ${B.pick}개를 고릅니다</small></span>
      <span class="n${state}">고른 것 ${B.got} / ${B.pick}</span></div><div class="bd">${B.cards.join('')}</div></div>`;
  }).join('');

  const sum = picked.map(f => fieldPane(f, sel, WHERE)).join('');
  const head = (picked.length > 1 && !sumOpen)
    ? `<div class="moretog" data-sum="1">▼ 분야별 설명 ${picked.length}개 보기</div>`
    : sum + (picked.length > 1 ? '<div class="moretog" data-sum="1">▲ 분야별 설명 접기</div>' : '');

  return head
    + (good.length ? pane('ok', '확인된 것', good.join('<br>')) : '')
    + (warn.length ? pane('warn', '짚어야 할 것', warn.join('<br>')) : '')
    + (grade === 2 && st.stu ? takenBlock(sel, picked, st.stu, choice, TK) : '')
    + `<div class="sems">${cards}</div>`;
}

export function selCond(sel, picked) {
  const rows = [];
  for (const f of picked) for (const n of f.notes) rows.push([f.name, n.u, n.t]);
  if (!rows.length) return '<div class="empty">이 분야에는 대학이 따로 붙인 조건이 없습니다.</div>';
  return `<div class="note">대학이 권장과목 옆에 <b>따로 적어 둔 조건</b>입니다. "3과목 이상", "위계에 맞게", "일반선택 먼저" 같은 말이 실제 판단 기준이 됩니다.</div>
  <div class="tbl-wrap"><table><thead><tr><th>분야</th><th>대학</th><th>조건 (원문)</th></tr></thead><tbody>
  ${rows.map(([a, b, c]) => `<tr><td class="nw">${esc(a)}</td><td class="nw mut">${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

export function selMiss(sel, picked) {
  const names = new Set(picked.map(f => f.name));
  const ms = sel.missing.filter(m => m.f.some(x => names.has(x)));
  const extra = sel.school.extra.map(e => `${esc(e.s)} <span class="fine">(${esc(e.note || e.sem)})</span>`).join(' · ');
  if (!ms.length) return `<div class="note">이 분야가 권장하는 과목은 <b>우리 학교에서 모두 들을 수 있습니다.</b></div>`
    + (extra ? `<div class="note fine">공동교육과정·주문형 강좌: ${extra}</div>` : '');
  return `<div class="note warn">대학이 권장하지만 <b>우리 학교에 개설되지 않은</b> 과목입니다. 공동교육과정으로 메울 수 있는지 확인해 보세요.</div>
  <div class="tbl-wrap"><table><thead><tr><th>과목</th><th>등급</th><th class="n">근거 대학</th><th>요구한 분야</th></tr></thead><tbody>
  ${ms.map(m => `<tr><td><b>${esc(m.s)}</b></td><td class="nw">${esc(m.r)}</td><td class="n">${m.n}곳</td>
    <td class="mut">${esc(m.f.filter(x => names.has(x)).join(', '))}</td></tr>`).join('')}
  </tbody></table></div>
  ${extra ? `<div class="note fine" style="margin-top:12px">공동교육과정·주문형 강좌: ${extra}</div>` : ''}`;
}


/* ── 이 조합으로 대학 보기 ─────────────────────────── */

const UST = {
  full: ['ok', '권장과목 모두 이수'],
  later: ['later', '과목 더 들으면 충족'],
  no: ['no', '우리 학교에 없는 과목'],
  none: ['non', '지정 기준 없음'],
};

export function selGoBar(nChosen, nTaken) {
  const n = nChosen + nTaken;
  return `<div class="gobar">
    <button class="gobtn" id="btn-univ"${n ? '' : ' disabled'}>이 조합으로 대학 보기 →</button>
    <span class="gohint">${n
      ? `지금 잡힌 <b>${n}과목</b>${nTaken ? ` <span class="fine">(고른 것 ${nChosen} · 이수한 것 ${nTaken})</span>` : ''}을
         대학이 지정한 과목과 맞춰 봅니다.`
      : '과목을 하나라도 고르면 켜집니다.'}</span>
  </div>`;
}

export function selUnits(res, st) {
  const c = { full: 0, later: 0, no: 0, none: 0 };
  for (const r of res) c[r.st]++;
  const A = st.apps || new Map();
  const ORD = { full: 0, later: 1, no: 2, none: 3 };
  const list = res.slice().sort((a, b) => (A.get(univKey(b.u)) || 0) - (A.get(univKey(a.u)) || 0)
    || a.u.localeCompare(b.u) || ORD[a.st] - ORD[b.st] || a.d.localeCompare(b.d));

  const rows = list.map(r => {
    const [cls, txt] = UST[r.st];
    const n = A.get(univKey(r.u));
    const req = r.got.map(x => `<span class="sc g">${esc(x)}</span>`).join('')
      + r.later.map(x => `<span class="sc l">${esc(x.s)}<i>${esc(x.w)}</i></span>`).join('')
      + r.no.map(x => `<span class="sc m">${esc(x)}</span>`).join('')
      || '<span class="fine">과목을 지정하지 않고 문장으로만 안내</span>';
    const cnt = r.st === 'later' ? r.later.length : (r.st === 'no' ? r.no.length : 0);
    return `<tr class="ur" data-st="${r.st}" data-q="${esc((r.u + ' ' + r.d).toLowerCase())}">
      <td class="uu">${esc(r.u)}${n ? `<i>${n}건</i>` : ''}</td>
      <td class="ud">${esc(r.d)}</td><td class="urq">${req}</td>
      <td class="uj"><span class="vv ${cls}">${r.st === "later" ? `${cnt}` : ""}${txt}${r.st === "no" ? ` ${r.no.length}개` : ""}</span></td></tr>`;
  }).join('');

  const chip = (k, label, num) => `<button class="chip" data-uf="${k}" aria-pressed="${k === 'all'}">${label}${num != null ? ` <span class="c">${num}</span>` : ''}</button>`;

  return `<div class="uwarn"><b>권장과목은 지원 자격이 아닙니다.</b>
      대학이 「이런 과목을 들으면 좋다」고 안내한 것이지, 안 들으면 지원할 수 없다는 뜻이 아닙니다.
      대부분 학생부 서류평가에서 참고 자료로 씁니다. 그래서 이 화면은 <b>가능·불가능</b>이 아니라
      <b>이미 채운 것 / 앞으로 더 들을 것 / 우리 학교에 없는 것</b>으로 나눠 보여 줍니다.</div>

    <div class="usum">
      <div class="u1 a"><div class="v">${c.full}</div><div class="k">지금 조합으로 이미 충족</div></div>
      <div class="u1 b"><div class="v">${c.later}</div><div class="k">남은 학기에 더 들으면 충족</div></div>
      <div class="u1 d"><div class="v">${c.no}</div><div class="k">우리 학교에 없는 과목을 요구</div></div>
      <div class="u1 c"><div class="v">${c.none}</div><div class="k">과목을 지정하지 않음</div></div>
    </div>

    <div class="ubar">${chip('all', '전체', res.length)}${chip('full', '이미 충족', c.full)}${chip('later', '더 들으면 충족', c.later)}${chip('no', '없는 과목 요구', c.no)}${chip('none', '기준 없음', c.none)}
      <input type="search" id="uq" placeholder="대학·학과 찾기">
      <span class="fine">우리 학교 지원이 많은 대학 순 · ${st.nUniv || 47}개 대학 ${res.length}개 모집단위</span></div>

    <div class="tbl-wrap"><table class="utbl">
      <thead><tr><th>대학</th><th>모집단위</th><th>대학이 지정한 과목</th><th>판정</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="note fine" id="unone" hidden>조건에 맞는 모집단위가 없습니다.</div>
    <div class="note fine"><span class="sc g">초록</span> 이미 들었거나 지금 고른 과목 ·
      <span class="sc l">파랑<i>2-2 B</i></span> 우리 학교에 있는데 아직 안 고른 과목(어느 학기·묶음인지 함께 표시) ·
      <span class="sc m">빨강</span> 우리 학교에 개설되지 않은 과목.<br>
      「수학」·「사회」처럼 교과군으로만 지정한 대학은 그 교과군에서 <b>선택과목을 한 과목이라도</b> 들었으면 이수로 봅니다
      — 전원이 듣는 공통과목은 세지 않습니다.</div>`;
}

/* ── 정시 배치 (대학 공개 정시 결과 기반) ─────────────
   판정 옆의 합격률은 우리 학교 5개년 실제 결과로 맞춰 본 값입니다. */

const JG_HIT = { 안정: 78, 적정: 76, 소신: 53, 상향: 16, 도전: 6 };
const JG_ORDER = ['안정', '적정', '소신', '상향', '도전'];
const JG_CLS = { 안정: 'j-safe', 적정: 'j-fit', 소신: 'j-try', 상향: 'j-up', 도전: 'j-far' };

export function jgTable(res, opts = {}) {
  const cnt = {}; let none = 0;
  for (const r of res) { if (r.judge) cnt[r.judge] = (cnt[r.judge] || 0) + 1; else none++; }

  /* −0.04 는 「-0.0」이 아니라 「0.0」으로 — 반올림한 뒤에 부호를 정합니다. */
  const sign = d => { const r = Math.round(d * 10) / 10; return (r > 0 ? '+' : '') + (Object.is(r, -0) ? 0 : r).toFixed(1); };
  const trendOf = r => {
    const k = r.rec;
    /* 전형까지 맞는 추이를 먼저 찾고, 없으면 그 해 전형이 하나뿐이던 학과의 추이를 씁니다. */
    const t = opts.trend?.[`${k.u}|${k.g}|${k.t}|${k.d}`] || opts.trend?.[`${k.u}|${k.g}|${k.d}`];
    if (!t) return '';
    return Object.keys(t).sort().map(y => {
      const v = t[y];
      return v.c != null && v.f ? `<span class="tr"><i>${String(y).slice(2)}</i>${(100 * v.c / v.f).toFixed(1)}</span>` : '';
    }).join('');
  };

  const rows = res.filter(r => r.judge).sort((a, b) => b.diff - a.diff).map(r => {
    const k = r.rec, n = k.n, need = k.need;
    return `<tr class="jgr" data-j="${r.judge}" data-q="${esc((k.u + ' ' + k.d).toLowerCase())}">
      <td class="nw"><span class="jv ${JG_CLS[r.judge]}">${r.judge}</span></td>
      <td class="nw b">${esc(k.u)}</td><td class="nw mut">${esc(k.g)}</td>
      <td>${esc(k.d)}<span class="tf">${esc(k.t)}</span>${need ? `<span class="need">${esc(need)}</span>` : ''}</td>
      <td class="n">${r.mine.toFixed(1)}</td>
      <td class="n mut">${r.cut.toFixed(1)}</td>
      <td class="n ${Math.round(r.diff * 10) >= 0 ? 'ok' : 'no'}">${sign(r.diff)}</td>
      <td class="n nw mut">${n != null ? `${n}명` : '—'}${k.comp ? ` · ${k.comp.toFixed(1)}:1` : ''}${k.wait != null ? ` · 충원 ${k.wait}` : ''}</td>
      <td class="nw trend">${trendOf(r)}</td></tr>`;
  }).join('');

  const chip = (k, label, num, hit) => `<button class="chip" data-jf="${k}" aria-pressed="${k === '적정'}">${label}${num != null ? ` <span class="c">${num}</span>` : ''}${hit != null ? `<span class="hr">${hit}%</span>` : ''}</button>`;

  return `<div class="jghead">
      <div class="jgnote"><b>우리 학생 점수와 「70%컷 학생」 점수를 같은 식에 넣어 견준 것입니다.</b>
        대학마다 환산식에 붙는 상수는 재현하지 않았습니다. 두 사람에게 똑같은 식을 쓰므로 앞뒤 순서는 유지되지만,
        <b>점수 자체는 대학이 발표한 환산점수와 다릅니다.</b> 같은 줄 안에서 차이(±)만 보시고,
        <b>줄과 줄 사이의 점수는 견주지 마십시오</b> — 대학마다 척도가 다릅니다.</div>
      <div class="jgchips">${JG_ORDER.map(k => chip(k, k, cnt[k] || 0, JG_HIT[k])).join('')}
        ${chip('all', '전체', res.filter(r => r.judge).length)}
        <input type="search" id="jgq" placeholder="대학·학과 찾기">
      </div>
      <div class="jghint">칩 아래 %는 <b>우리 학교 5개년 정시 실제 합격률</b>입니다 — 같은 계산을 졸업생 지원 171건에 돌려 맞춰 봤습니다.</div>
    </div>
    <div class="tbl-wrap"><table class="jgtbl">
      <thead><tr><th>판정</th><th>대학</th><th>군</th><th>모집단위</th><th class="n">내 점수<i>이 대학 기준</i></th>
        <th class="n">70%컷</th><th class="n">차이</th><th class="n">모집·경쟁·충원</th><th>컷 추이</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="note fine" id="jgnone" hidden>조건에 맞는 모집단위가 없습니다.</div>
    <div class="note fine">${opts.meta ? `${opts.meta.year}학년도 · ${opts.meta.nUniv}개 대학 ${opts.meta.n.toLocaleString()}개 모집단위` : ''}
      ${none ? ` · <b>판정하지 못한 곳 ${none}개</b> <span class="fine">(과목별 컷 미공개, 반영 비율 없음, 또는 그 대학이 반영하는 과목이 입력에 없음)</span>` : ''}
      ${opts.credit ? `<br>${esc(opts.credit)}` : ''}</div>`;
}
