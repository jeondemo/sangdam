/* 화면 렌더링 — HTML 문자열을 만들어 돌려줍니다. */

import { isPass, JUDGE } from './match.js';

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
  if (a.res === '추합') return `<span class="tag t-wait">추합${a.wait ? ' ' + esc(a.wait) : ''}</span>`;
  if (a.res === '불합') return '<span class="tag t-no">불합</span>';
  return '';
};

const minTag = a => {
  if (a.ph !== 0) return '';
  if (a.min === '미충족') return '<span class="tag t-min">최저미달</span>';
  if (a.min === '충족') return '<span class="tag t-minok">최저충족</span>';
  return '';
};

/* 예비번호를 받았지만 호명되지 못한 경우. 추합 컷을 가늠하는 근거가 됩니다. */
const waitTag = a => (a.res === '불합' && a.wait)
  ? `<span class="tag t-cut">예비 ${esc(a.wait)}</span>` : '';

const appRow = a => `<div class="app">
  <span class="tk">${esc(a.ph === 1 ? (a.grp || '정시') : (a.track || ''))}</span>
  <span class="nm"><span class="un">${esc(a.univ)}</span><span class="dp">${esc(a.dept || '')}</span></span>
  <span class="rt">${minTag(a)}${waitTag(a)}${resTag(a)}</span></div>`;

/* ── 학생 카드 (좌측) ────────────────────────────────── */

const SUBN = ['국', '수', '영', '사', '과'];

export function studentCard(st, total) {
  const g = st.g;
  const d = (g[2] != null && g[0] != null) ? g[2] - g[0] : null;
  const trend = d == null ? ''
    : d < -0.15 ? `<span class="up">1학년 대비 ${Math.abs(d).toFixed(2)} 상승</span>`
      : d > 0.15 ? `<span class="down">1학년 대비 ${d.toFixed(2)} 하락</span>`
        : '1학년 대비 큰 변화 없음';
  return `<div class="who">${esc(st.nm)}<small>${st.c}학급 ${st.no}번</small></div>
    <div class="rk">${st.r != null ? `전교 ${st.r}위 / ${total}명 · ` : ''}${trend}</div>
    <div class="trend">
      ${[0, 1, 2].map(i => `<div><span>${i + 1}학년</span><b>${g[i] != null ? g[i].toFixed(2) : '—'}</b></div>`).join('')}
      <div class="cur"><span>전교과</span><b>${g[3].toFixed(2)}</b></div>
    </div>
    <div class="subs">${st.s.map((x, i) => `<div><span>${SUBN[i]}</span><b>${x != null ? x.toFixed(2) : '—'}</b></div>`).join('')}</div>`;
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

export function similarStudents(sel, rows) {
  let html = '', rank = 0;
  for (const s of sel) {
    rank++;
    const mine = rows.filter(r => r.s.p.pk === s.p.pk);
    if (!mine.length) continue;
    const su = mine.filter(r => r.a.ph === 0);
    const jg = mine.filter(r => r.a.ph === 1);
    const won = mine.filter(isPass);
    const out = won.length
      ? `<span class="out t-ok">${esc(won[0].a.univ)}${won[0].a.ph === 1 ? ' · 정시' : ''}${won.length > 1 ? ` 外 ${won.length - 1}` : ''}</span>`
      : '<span class="out t-no">전체 불합</span>';
    html += `<div class="stu${won.length ? ' win' : ''}">
      <div class="stu-h"><span class="idx">${rank}</span><span class="yr">${s.p.y}</span>
        <span class="gpa">내신 ${s.p.g[3] != null ? s.p.g[3].toFixed(2) : '—'}</span>
        <span class="csat">${csatStr(s.p.csat)}</span>${out}</div>
      ${su.map(r => appRow(r.a)).join('')}
      ${jg.length ? `<div class="app sep"><span class="tk brand">정시</span><span class="mut">${jg.length}건</span></div>` + jg.map(r => appRow(r.a)).join('') : ''}
    </div>`;
  }
  return html ? `<div class="stugrid">${html}</div>` : '<div class="empty">표시할 지원 기록이 없습니다.</div>';
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
  return `<div class="who">${esc(st.nm)}<small>${st.c}학급 ${st.no}번</small></div>
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

export function jeongsiStudents(sel, rows) {
  let html = '', rank = 0;
  for (const s of sel) {
    rank++;
    const mine = rows.filter(r => r.s.p.pk === s.p.pk);
    if (!mine.length) continue;
    const won = mine.filter(isPass);
    const c = s.p.csat;
    const pa = pctAvgOf(c), ss = stdSum(c);
    const out = won.length
      ? `<span class="out t-ok">${esc(won[0].a.univ)}${won.length > 1 ? ` 外 ${won.length - 1}` : ''}</span>`
      : '<span class="out t-no">전체 불합</span>';
    const f = x => (x == null ? '·' : Math.round(x));
    const detail = c
      ? `국 ${f(c.pk)} · 수 ${f(c.pm)} · 탐 ${f(c.ps1)}·${f(c.ps2)}${c.e != null ? ` · 영 ${c.e}등급` : ''}${ss != null ? ` · 표점합 ${ss}` : ''}`
      : '<span style="opacity:.6">수능 기록 없음</span>';
    html += `<div class="stu${won.length ? ' win' : ''}">
      <div class="stu-h"><span class="idx">${rank}</span><span class="yr">${s.p.y}</span>
        <span class="gpa">백분위 ${pa != null ? pa.toFixed(1) : '—'}</span>
        <span class="csat">${detail}</span>${out}</div>
      ${mine.map(r => appRow(r.a)).join('')}
    </div>`;
  }
  return html ? `<div class="stugrid">${html}</div>` : '<div class="empty">표시할 정시 기록이 없습니다.</div>';
}

export function jeongsiUnivTable(list) {
  if (!list.length) return '<div class="empty">집계할 정시 기록이 없습니다.</div>';
  const item = (x, ok) => {
    const bits = [];
    if (x.pct != null) bits.push(`백 ${x.pct.toFixed(0)}`);
    if (x.wait) bits.push(ok ? `추합 ${esc(x.wait)}` : `예비 ${esc(x.wait)}`);
    return `<span class="dl${ok ? ' ok' : ''}">${esc(x.dept)}${bits.length ? ` <i>${bits.join(' · ')}</i>` : ''}</span>`;
  };
  return `<div class="note">유사 졸업생들이 실제로 지원한 대학입니다. 학과 옆 <b>백</b>은 그 졸업생의 백분위 4과목 평균,
    <b>추합 n</b>은 호명된 예비번호, <b>예비 n</b>은 받았지만 호명되지 못한 번호입니다.</div>
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
