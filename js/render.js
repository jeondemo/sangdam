/* 화면 렌더링 — HTML 문자열을 만들어 돌려줍니다. */

import { isPass } from './match.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const pct1 = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function csatStr(c) {
  if (!c) return '<span style="opacity:.6">수능 기록 없음</span>';
  const f = x => (x == null || x <= 0 ? '·' : x);
  return `수능 ${f(c.k)}·${f(c.m)}·${f(c.e)}·${f(c.s1)}·${f(c.s2)}`;
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

const appRow = a => `<div class="app">
  <span class="tk">${esc(a.ph === 1 ? (a.grp || '정시') : (a.track || ''))}</span>
  <span class="nm"><span class="un">${esc(a.univ)}</span><span class="dp">${esc(a.dept || '')}</span></span>
  <span class="rt">${minTag(a)}${resTag(a)}</span></div>`;

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
