import { GAS_URL, SCHOOL, ROSTER_STEPS } from '../config.js';
import * as store from './store.js';
import * as api from './api.js';
import { encode, decode } from './codec.js';
import { parseHistory, parseRoster, parseMockExam, mergeMockExam, pctAvg, examInfo, parseCutTable } from './parse.js';
import {
  buildIndex, findSimilar, summarize, aggregateUniv, aggregateTrack, aggregateJeongsi, csatAvg,
  findSimilarJeongsi, summarizeJeongsi, aggregateJeongsiUniv, aggregateGroup,
  placement, schoolJeongsiStats,
} from './match.js';
import * as R from './render.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const S = {
  key: null, admin: null, history: null, index: null, version: null,
  roster: null,   // 학생부성적표 (수시·정시 상담) — 학년은 파일에서 읽음
  mock: null,     // 모의고사 성적표 (정시 상담) — 학년은 파일에서 읽음
  cur: null,      // 선택한 학생 (현재 모드의 명단에서)
  mode: 'susi',   // 'susi' | 'jg'
  cut: null,      // 정시 배치기준표 (대학 공개 입시결과)
  cutVersion: null,
  school: null,   // 우리 학교 5개년 정시 지원 집계
  cases: [],      // 현재 화면의 유사 학생 사례 — 목록과 「크게 보기」가 함께 씁니다
};

/* ── 표지 조각 ─────────────────────────────────────── */

const LEFT = () => `<div>
  <div class="cv-since">${esc(SCHOOL.since)}</div>
  <div class="cv-title">${esc(SCHOOL.title[0])}<br><span class="accent">${esc(SCHOOL.title[1])}</span></div>
  <div class="cv-en">${esc(SCHOOL.titleEn)}</div>
  <div class="cv-desc">우리 학교 <b>5개년 지원 결과</b>에서 성적이 비슷했던 졸업생을 찾아
    어디에 지원해 어떤 결과를 받았는지 보여줍니다.</div>
  <div class="cv-feats" id="cv-feats"></div>
  <div class="cv-motto"><div class="m">${esc(SCHOOL.motto[0])}</div><div class="m"><b>${esc(SCHOOL.motto[1])}</b></div></div>
</div>`;

function feats() {
  const el = $('cv-feats');
  if (!el) return;
  if (!S.history) { el.innerHTML = ''; return; }
  const m = S.history.meta;
  const yr = m?.years?.length ? `${m.years[0]}~${m.years[m.years.length - 1]}학년도` : '자료 없음';
  const rows = [
    ['5개년', yr],
    [`${(m?.nApps || 0).toLocaleString()}건`, '수시·정시 지원'],
    ['유사 사례', '내신·수능 기준'],
    ['카드 배분', '전형별 실적'],
    ['수능최저', '충족 여부'],
  ];
  el.innerHTML = rows.map(([a, b]) => `<div class="cv-feat"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('');
}

const HOWTO = `<div class="howto">
  <div class="h"><span class="tk2"></span>학생자료 받는 방법</div>
  <div class="path">${ROSTER_STEPS.map((s, i) =>
    `${i ? '<span class="arw">›</span>' : ''}<span class="s ${i === 0 ? 'a' : i === ROSTER_STEPS.length - 1 ? 'z' : ''}">${esc(s)}</span>`).join('')}</div>
</div>`;

const SHIELD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  style="width:13px;height:13px"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>`;

function pills(list) {
  $('cv-pills').innerHTML = list.map(([cls, text]) =>
    `<span class="cv-pill"><i class="d ${cls}"></i>${esc(text)}</span>`).join('');
}

function cover(html, pillList) {
  $('app').classList.add('hidden');
  $('cover').classList.remove('hidden');
  pills(pillList || []);
  $('cv-body').innerHTML = html;
  feats();
}

const centered = inner => `<div class="centerwrap">${inner}</div>`;

/* ── 화면들 ────────────────────────────────────────── */

function screenLoading(msg, pct) {
  cover(centered(`<div class="spin"></div>
    <h3>${esc(msg)}</h3>
    <p>${S.history ? '' : '처음 한 번만 기다리시면 됩니다'}</p>
    <div class="prog"><i style="width:${pct ?? 55}%"></i></div>`), [['d-gold', '자료 확인 중']]);
}

function screenBlocked(reason) {
  cover(centered(`<div class="lockic">🔒</div>
    <h3>접근 권한이 필요합니다</h3>
    <p>교무기획부에서 받은 <b style="color:#e5ebfa">전용 링크</b>로 접속해 주세요.<br>
      주소 뒤에 <span class="kbd">?k=…</span> 가 붙은 형태입니다.
      ${reason ? `<br><span style="color:#ff9c9c;font-size:12px">${esc(reason)}</span>` : ''}</p>`), []);
}

function screenUpload(err) {
  const m = S.history.meta;
  const tag = d => d ? `<span class="p-tag">${esc(d.meta.label || '')} ${d.meta.n}명 불러옴</span>` : '';
  cover(`<div class="cv-main">${LEFT()}
    <div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">1</span><h2>5개년 지원결과</h2>
          <span class="p-tag">불러옴</span></div>
        <div class="p-hint">${esc(m.years[0])}~${esc(m.years[m.years.length - 1])}학년도 ·
          지원 ${m.nApps.toLocaleString()}건 · 학생 ${m.nPersons.toLocaleString()}명<br>
          이 자료는 자동으로 들어옵니다. 따로 올리실 것 없습니다.</div>
      </div>

      <div class="cv-panel">
        <div class="p-head"><span class="p-num">2</span><h2>학생부성적표 · 수시·정시 상담</h2>${tag(S.roster)}</div>
        <div class="p-hint">내신이 든 학생부성적표를 올리면 학급·이름으로 학생을 골라 상담할 수 있습니다. 학년은 파일에서 자동으로 읽습니다.</div>
        ${HOWTO}
        <div class="dropzone" id="dz">
          <strong>파일을 끌어다 놓거나 클릭해서 선택</strong>
          <div class="dz-hint">○○○○년 학생부성적표 … ○학년.xlsx</div>
          <div class="dz-tags"><span class="dz-tag">학급·번호·이름</span>
            <span class="dz-tag">학년별 내신</span><span class="dz-tag">과목별 등급</span></div>
        </div>
      </div>

      <div class="cv-panel">
        <div class="p-head"><span class="p-num">3</span><h2>모의고사 성적표 · 정시 상담</h2>${tag(S.mock)}
          ${S.mock ? '' : '<span class="p-tag" style="opacity:.6">선택</span>'}</div>
        <div class="p-hint">교육청·평가원 영역별 기준 수능성적표(.xls)를 올리면 모의고사 성적으로 정시만 상담할 수 있습니다.
          어느 학년이든 됩니다. 반별 파일이면 여러 개를 한꺼번에 골라도 됩니다.</div>
        <div class="dropzone" id="dz2">
          <strong>파일을 끌어다 놓거나 클릭해서 선택</strong>
          <div class="dz-hint">○○○○년 ○월 교육청 영역별 기준 수능성적표 … ○학년.xls</div>
          <div class="dz-tags"><span class="dz-tag">등급·백분위·표준점수</span><span class="dz-tag">반별 파일 여러 개 가능</span></div>
        </div>
      </div>

      <label class="opt"><input type="checkbox" id="keep" checked>
        <span><span class="t">이 컴퓨터에 명단 저장</span>
        <span class="d">다음부터 이 화면 없이 바로 상담 화면으로 들어갑니다. 공용 PC에서는 체크를 해제하세요.</span></span></label>
      ${err ? `<div class="cv-err">${esc(err)}</div>` : ''}
      ${(S.roster || S.mock) ? '<button class="mini" id="btn-go" style="width:100%;margin-top:12px;padding:10px">상담 화면으로</button>' : ''}
      <div class="cv-safe">${SHIELD} 명단은 이 브라우저 안에서만 열립니다</div>
    </div>
  </div>`, [['d-gold', `${new Date().getFullYear() + 1}학년도`], ['d-green', '명단은 서버로 전송되지 않습니다']]);

  bindDrop($('dz'), files => loadRoster(files[0]));
  bindDrop($('dz2'), files => loadMock(files));
  $('dz').addEventListener('click', () => $('f-roster').click());
  $('dz2').addEventListener('click', () => $('f-mock').click());
  $('btn-go')?.addEventListener('click', () => showApp(S.roster ? 'susi' : 'jg'));
}

function bindDrop(el, cb) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => {
    e.preventDefault(); el.classList.remove('over');
    if (e.dataTransfer.files.length) cb([...e.dataTransfer.files]);
  });
}

/* ── 명단 읽기 ─────────────────────────────────────── */

const keepChecked = () => $('keep') ? $('keep').checked : true;

async function loadRoster(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const data = parseRoster(wb, XLSX);
    if (!data.students.length) throw new Error('학생을 찾지 못했습니다. 학생부성적표 파일이 맞는지 확인해 주세요.');
    Object.assign(data.meta, examInfo(file.name, data.students));
    S.roster = data;
    if (keepChecked()) await store.set(store.KEY_ROSTER, data); else await store.del(store.KEY_ROSTER);
    showApp('susi');
  } catch (e) {
    screenUpload('학생부성적표를 읽지 못했습니다 — ' + e.message);
  }
}

async function readMockFile(file) {
  const buf = await file.arrayBuffer();
  let text;
  try { text = new TextDecoder('euc-kr').decode(buf); } catch { text = new TextDecoder().decode(buf); }
  if (!/<table/i.test(text)) {
    /* 진짜 엑셀이면 SheetJS 로 HTML 로 바꿔서 같은 파서를 태웁니다 */
    const wb = XLSX.read(buf, { type: 'array' });
    text = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]);
  }
  return parseMockExam(text);
}

async function loadMock(files) {
  try {
    let merged = null;
    for (const f of files) {
      const one = await readMockFile(f);
      if (!one.students.length) throw new Error(`${f.name} 에서 학생을 찾지 못했습니다.`);
      merged = merged ? mergeMockExam(merged, one) : one;
    }
    Object.assign(merged.meta, examInfo(files[0].name, merged.students));
    S.mock = merged;
    if (keepChecked()) await store.set(store.KEY_MOCK, merged); else await store.del(store.KEY_MOCK);
    showApp('jg');
  } catch (e) {
    screenUpload('모의고사 성적표를 읽지 못했습니다 — ' + e.message);
  }
}

/* ── 상담 화면 ─────────────────────────────────────── */

function showApp(mode) {
  $('cover').classList.add('hidden');
  $('app').classList.remove('hidden');
  if (!S.index) S.index = buildIndex(S.history);
  const m = S.history.meta;
  const gl = d => d?.meta.grade ? `${d.meta.grade}학년` : '';
  $('sb-scope').innerHTML =
    `<div class="row"><span>5개년 자료</span><b>지원 ${m.nApps.toLocaleString()}건</b></div>` +
    (S.roster ? `<div class="row"><span>${gl(S.roster)} 학생부</span><b class="off">${S.roster.meta.n}명</b></div>` : '') +
    (S.mock ? `<div class="row"><span>${esc(S.mock.meta.label || '모의고사')}</span><b class="off">${S.mock.meta.n}명</b></div>` : '');
  $('m-susi').textContent = S.roster ? `${gl(S.roster)} ${S.roster.meta.n}명`.trim() : '명단 없음';
  $('m-jg').textContent = S.mock ? (S.mock.meta.label || `${S.mock.meta.n}명`) : '명단 없음';
  setMode(mode || S.mode);
}

function setMode(mode) {
  S.mode = mode;
  S.cur = null;
  document.querySelectorAll('#modechips .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.mode === mode)));
  $('in-susi').classList.toggle('hidden', mode !== 'susi');
  $('in-jg').classList.toggle('hidden', mode !== 'jg');
  $('stucard').classList.add('hidden');
  $('t-univ').textContent = mode === 'jg' ? '대학·학과' : '대학·전형';
  $('t-track').textContent = mode === 'jg' ? '군별 배분' : '카드 배분';
  $('t-jg').textContent = mode === 'jg' ? '배치' : '정시';
  document.querySelector('.tab[data-t="jg"]')?.classList.remove('hidden');
  $('c-jg').textContent = '';
  $('btn-roster').textContent = mode === 'jg' ? '모의고사 성적표 올리기' : '학생부성적표 다시 올리기';
  selectTab('stu');
  fillClasses();
  fillStudents();
  $('results').classList.add('hidden');
  $('placeholder').classList.remove('hidden');
  $('placeholder').innerHTML = mode === 'jg'
    ? (S.mock
      ? '왼쪽에서 <b>학생을 선택</b>하면 수능 백분위가 비슷했던 졸업생들의 <b>정시</b> 지원 결과가 여기에 표시됩니다.<br><span class="fine">명단에 없으면 백분위를 직접 입력해도 됩니다.</span>'
      : '모의고사 성적표가 아직 없습니다.<br><span class="fine">왼쪽 아래 「모의고사 성적표 올리기」를 누르거나, 백분위를 직접 입력하세요.</span>')
    : '왼쪽에서 <b>학생을 선택</b>하면 성적이 비슷했던 졸업생들의 지원 결과가 여기에 표시됩니다.<br><span class="fine">명단에 없으면 내신 전교과를 직접 입력해도 됩니다.</span>';
  run();
}

const currentList = () => (S.mode === 'jg' ? S.mock?.students : S.roster?.students) || [];

function fillClasses() {
  const cs = [...new Set(currentList().map(s => s.c))].sort((a, b) => a - b);
  $('cls').innerHTML = '<option value="">전체 학급</option>'
    + cs.map(c => `<option value="${c}">${esc(R.clsLabel(c))}</option>`).join('');
}

function fillStudents() {
  const c = $('cls').value, q = ($('q').value || '').trim();
  const f = currentList().filter(s => (!c || String(s.c) === c) && (!q || s.nm.includes(q)));
  /* 목록에는 성적을 넣지 않습니다. 펼치면 반 전체의 점수가 한눈에 보이기 때문입니다.
     선택한 학생의 성적은 아래 카드에서만 보여 줍니다. */
  const label = s => `${s.no}번 ${s.nm}`;
  $('stu').innerHTML = '<option value="">직접 입력</option>' + f.map(s => `<option value="${s.c}-${s.no}">${esc(label(s))}</option>`).join('');
  if (S.cur && f.some(s => s.c === S.cur.c && s.no === S.cur.no)) $('stu').value = `${S.cur.c}-${S.cur.no}`;
}

function onStudentChange() {
  const v = $('stu').value;
  if (!v) { S.cur = null; $('stucard').classList.add('hidden'); $('gpanote').textContent = ''; return; }
  const [c, no] = v.split('-').map(Number);
  S.cur = currentList().find(s => s.c === c && s.no === no) || null;
  if (!S.cur) return;
  if (S.mode === 'jg') {
    $('stucard').innerHTML = R.mockCard(S.cur, S.mock.meta.n);
    const p = S.cur.pct, g = S.cur.grade;
    $('p_k').value = p.k ?? ''; $('p_m').value = p.m ?? '';
    $('p_s1').value = p.s1 ?? ''; $('p_s2').value = p.s2 ?? '';
    $('p_e').value = g.e ?? '';
  } else {
    $('stucard').innerHTML = R.studentCard(S.cur, S.roster.meta.n);
    $('gpa').value = S.cur.g[3].toFixed(2);
    $('gpanote').textContent = '';
  }
  $('stucard').classList.remove('hidden');
  run();
}

/* ── 분석 ──────────────────────────────────────────── */

const numOf = id => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
let selGy = -1;
/* 전문대 지원 기록은 데이터에 남아 있지만 화면에서는 4년제만 봅니다. */
const includeVoc = false;

function showEmpty(msg) {
  $('results').classList.add('hidden');
  $('placeholder').classList.remove('hidden');
  if (msg) $('placeholder').innerHTML = msg;
}

function run() {
  if (!S.index) return;
  caseClose();  /* 목록이 다시 그려지면 번호가 바뀌므로 열려 있던 창은 닫습니다. */
  return S.mode === 'jg' ? runJeongsi() : runSusi();
}

function commonOpts() {
  const years = S.history.meta.years;
  return {
    topN: +$('topn').value,
    minYear: years[years.length - 1] + 1 - (+$('yrs').value),
    gy: selGy, includeVocational: includeVoc,
  };
}

function finish(sel, counts) {
  R.enableSort($('results'));
  $('c-stu').textContent = sel.length;
  $('c-univ').textContent = counts.univ;
  $('c-jg').textContent = counts.jg ?? '';
  $('placeholder').classList.add('hidden');
  $('results').classList.remove('hidden');
}

function runSusi() {
  const gpa = numOf('gpa');
  if (gpa == null) return showEmpty();
  const my = { k: numOf('c_k'), m: numOf('c_m'), e: numOf('c_e'), s1: numOf('c_s1'), s2: numOf('c_s2') };
  const myAvg = csatAvg(my);
  const { sel, rows } = findSimilar(S.index, { gpa, myCsatAvg: myAvg, ...commonOpts() });
  if (!sel.length) return showEmpty('조건에 맞는 졸업생이 없습니다. 연도 범위나 계열 조건을 넓혀 보세요.');

  const sum = summarize(sel, rows);
  const [lo, hi] = sum.gpaRange;
  $('rtitle').textContent = S.cur ? `${S.cur.nm} · 유사 사례` : '유사 사례';
  $('rnote').textContent = `내신 ${lo.toFixed(2)}~${hi.toFixed(2)} 구간 졸업생 ${sel.length}명 기준`;
  $('stats').innerHTML = R.statBar(sel, sum);
  $('headline').innerHTML = R.headline(sum, sel, gpa, myAvg, S.cur?.nm);
  S.cases = R.buildCases(sel, rows, 'susi');
  $('p-stu').innerHTML = R.similarStudents(S.cases);
  const uni = aggregateUniv(sum.su);
  $('p-univ').innerHTML = R.univTable(uni);
  $('p-track').innerHTML = R.trackTable(aggregateTrack(sum.su), sum);
  $('p-jg').innerHTML = R.jeongsiTable(aggregateJeongsi(sum.jg), sum);
  finish(sel, { univ: uni.length, jg: sum.jg.length });
}

function runJeongsi() {
  const pct = { k: numOf('p_k'), m: numOf('p_m'), s1: numOf('p_s1'), s2: numOf('p_s2') };
  const filled = Object.values(pct).filter(v => v != null).length;
  if (filled < 3) return showEmpty();
  const eng = numOf('p_e');
  const { sel, rows } = findSimilarJeongsi(S.index, { pct, eng, ...commonOpts() });
  if (!sel.length) return showEmpty('조건에 맞는 졸업생이 없습니다. 연도 범위나 계열 조건을 넓혀 보세요.');

  const sum = summarizeJeongsi(sel, rows);
  const [lo, hi] = sum.pctRange;
  const groups = aggregateGroup(sum.jg);
  $('rtitle').textContent = S.cur ? `${S.cur.nm} · 정시 유사 사례` : '정시 유사 사례';
  $('rnote').textContent = `백분위 평균 ${lo.toFixed(0)}~${hi.toFixed(0)} 구간 졸업생 ${sel.length}명 · 정시 지원만`;
  $('stats').innerHTML = R.jeongsiStatBar(sel, sum);
  $('headline').innerHTML = R.jeongsiHeadline(sum, sel, pct, eng, S.cur?.nm, groups, S.mock?.meta);
  S.cases = R.buildCases(sel, rows, 'jg');
  $('p-stu').innerHTML = R.jeongsiStudents(S.cases);
  const uni = aggregateJeongsiUniv(sum.jg);
  $('p-univ').innerHTML = R.jeongsiUnivTable(uni);
  $('p-track').innerHTML = R.groupTable(groups, sum);
  const myGrade = S.cur?.grade ? (() => { const g = [S.cur.grade.k, S.cur.grade.m, S.cur.grade.s1, S.cur.grade.s2].filter(x => x != null); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null; })() : null;
  if (!S.school) S.school = schoolJeongsiStats(S.index);
  /* 배치 탭은 배치기준표를 올린 학교에서만 나타납니다. 없으면 탭 자체를 감춥니다. */
  const pl = S.cut ? placement(S.cut, { pct, eng, myGrade, gy: selGy, similarRows: sum.jg, school: S.school }) : null;
  const tabJg = document.querySelector('.tab[data-t="jg"]');
  if (tabJg) tabJg.classList.toggle('hidden', !S.cut);
  if (!S.cut && document.querySelector('.tab[data-t="jg"][aria-selected="true"]')) selectTab('stu');
  $('p-jg').innerHTML = S.cut ? R.placementTable(pl, { exam: S.mock?.meta, cutMeta: S.cut.meta }) : '';
  finish(sel, { univ: uni.length, jg: pl ? pl.list.length : '' });
}

/* ── 관리자 ────────────────────────────────────────── */

function screenAdmin(status, msg) {
  cover(`<div class="cv-main">${LEFT()}
    <div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">✓</span><h2>현재 자료</h2>
          <span class="p-tag ${status?.ok ? '' : 'err'}">${status?.ok ? '연결됨' : '연결 안 됨'}</span></div>
        <div class="p-hint">${status?.ok
          ? `${esc(status.요약 || '아직 자료가 없습니다')}<br>최종 갱신 ${esc(status.갱신 || '—')}`
          : esc(status?.error || '스프레드시트에 연결하지 못했습니다.')}</div>
      </div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">↻</span><h2>새 자료 반영</h2></div>
        <div class="adm-row"><span class="n">1</span><span class="t"><b>지원결과 엑셀 올리기</b>
          <span>학년도별 수시·정시 시트가 든 파일</span></span>
          <button class="mini" id="a-pick">파일 선택</button></div>
        <div class="adm-row"><span class="n">2</span><span class="t"><b>변환 확인</b>
          <span id="a-parsed">파일을 올리면 건수를 확인합니다</span></span>
          <button class="mini" id="a-send" disabled>시트에 반영</button></div>
      </div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">정</span><h2>정시 배치기준표</h2>
          <span class="p-tag">${esc(status?.배치요약 || '아직 없음')}</span></div>
        <div class="p-hint">각 대학 입학처가 공개한 전년도 정시 입시결과를 모은 엑셀입니다. 행을 더하거나 고쳐서 다시 올리면 됩니다.${status?.배치갱신 ? ` 최종 갱신 ${esc(status.배치갱신)}` : ''}</div>
        <div class="adm-row"><span class="n">1</span><span class="t"><b>배치기준 엑셀 올리기</b>
          <span>대학 · 모집단위 · 백분위70 열이 있는 파일</span></span>
          <button class="mini" id="c-pick">파일 선택</button></div>
        <div class="adm-row"><span class="n">2</span><span class="t"><b>변환 확인</b>
          <span id="c-parsed">파일을 올리면 대학 수를 확인합니다</span></span>
          <button class="mini" id="c-send" disabled>시트에 반영</button></div>
      </div>
      ${msg ? `<div class="cv-panel"><div class="p-hint" style="color:#e5ebfa">${msg}</div></div>` : ''}
    </div>
  </div>`, [['d-gold', '관리자']]);
  $('a-pick').addEventListener('click', () => $('f-history').click());
  $('a-send').addEventListener('click', sendHistory);
  $('c-pick').addEventListener('click', () => $('f-cut').click());
  $('c-send').addEventListener('click', sendCut);
}

let pendingCut = null;

async function pickCut(file) {
  $('c-parsed').textContent = `${file.name} 읽는 중…`;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const data = parseCutTable(wb, XLSX);
    if (!data.rows.length) throw new Error('「대학」「모집단위」 열이 있는 시트를 찾지 못했습니다.');
    pendingCut = data;
    const m = data.meta;
    const withPct = data.rows.filter(r => r.pct70 != null || r.pct50 != null).length;
    $('c-parsed').innerHTML = `<b style="color:#e5ebfa">${m.nUniv}개 대학</b> · ${m.n}개 모집단위 · 백분위 있음 ${withPct}개${m.years.length ? ` · ${m.years.join('·')}학년도` : ''}`;
    $('c-send').disabled = false;
  } catch (e) {
    $('c-parsed').innerHTML = `<span style="color:#ff9c9c">읽지 못했습니다 — ${esc(e.message)}</span>`;
    $('c-send').disabled = true;
  }
}

async function sendCut() {
  if (!pendingCut) return;
  $('c-send').disabled = true;
  try {
    const res = await api.uploadData(S.admin, pendingCut, (i, n) => { $('c-parsed').textContent = `보내는 중 ${i}/${n}`; }, 'cut');
    await store.del(store.KEY_CUT);
    screenAdmin(await api.adminStatus(S.admin).catch(() => null), `배치기준표 반영이 끝났습니다. ${esc(res.요약 || '')}`);
  } catch (e) {
    $('c-parsed').innerHTML = `<span style="color:#ff9c9c">${esc(e.message)}</span>`;
    $('c-send').disabled = false;
  }
}

let pending = null;

async function pickHistory(file) {
  $('a-parsed').textContent = `${file.name} 읽는 중…`;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const data = parseHistory(wb, XLSX);
    if (!data.apps.length) throw new Error('지원 기록을 찾지 못했습니다.');
    pending = encode(data);
    const m = data.meta;
    $('a-parsed').innerHTML = `${m.years[0]}~${m.years[m.years.length - 1]}학년도 · 지원 <b style="color:#e5ebfa">${m.nApps.toLocaleString()}건</b> · 학생 ${m.nPersons.toLocaleString()}명`;
    $('a-send').disabled = false;
  } catch (e) {
    $('a-parsed').innerHTML = `<span style="color:#ff9c9c">읽지 못했습니다 — ${esc(e.message)}</span>`;
    $('a-send').disabled = true;
  }
}

async function sendHistory() {
  if (!pending) return;
  $('a-send').disabled = true;
  try {
    const res = await api.uploadData(S.admin, pending, (i, n) => { $('a-parsed').textContent = `보내는 중 ${i}/${n}`; });
    await store.del(store.KEY_DATA);
    screenAdmin(await api.adminStatus(S.admin).catch(() => null),
      `반영이 끝났습니다. ${esc(res.요약 || '')}<br>선생님들 화면은 다음 접속 때 자동으로 새 자료를 받습니다.`);
  } catch (e) {
    $('a-parsed').innerHTML = `<span style="color:#ff9c9c">${esc(e.message)}</span>`;
    $('a-send').disabled = false;
  }
}

/* ── 자료 불러오기 ─────────────────────────────────── */

async function loadHistory() {
  const cached = await store.get(store.KEY_DATA);
  if (cached?.enc) {
    S.history = decode(cached.enc);
    S.version = cached.version;
    api.fetchVersion(S.key).then(v => {
      if (v.version && v.version !== S.version) refresh();
      loadCut(v.cutVersion);
    }).catch(() => loadCut(null));
    return;
  }
  screenLoading('5개년 지원결과를 불러오는 중', 55);
  const res = await api.fetchData(S.key);
  S.history = decode(res.data);
  S.version = res.version;
  await store.set(store.KEY_DATA, { enc: res.data, version: res.version });
  await loadCut(null);
}

/* 배치기준표 — 없어도 프로그램은 돌아갑니다. 조용히 시도합니다. */
async function loadCut(serverVersion) {
  const cached = await store.get(store.KEY_CUT);
  if (cached?.data && (!serverVersion || cached.version === serverVersion)) { S.cut = cached.data; S.cutVersion = cached.version; return; }
  try {
    const res = await api.fetchCut(S.key);
    if (!res.ok || !res.data?.rows) { if (cached?.data) { S.cut = cached.data; } return; }
    S.cut = res.data; S.cutVersion = res.version;
    await store.set(store.KEY_CUT, { data: res.data, version: res.version });
    if (S.mode === 'jg' && S.index && !$('app').classList.contains('hidden')) run();
  } catch { if (cached?.data) S.cut = cached.data; }
}

async function refresh() {
  try {
    const res = await api.fetchData(S.key);
    await store.set(store.KEY_DATA, { enc: res.data, version: res.version });
  } catch { /* 다음 접속 때 다시 시도합니다 */ }
}

/* ── 시작 ──────────────────────────────────────────── */

async function boot() {
  const p = new URLSearchParams(location.search);
  if (p.get('admin')) {
    S.admin = p.get('admin');
    screenAdmin(await api.adminStatus(S.admin).catch(e => ({ ok: false, error: e.message })));
    return;
  }
  S.key = p.get('k') || await store.get(store.KEY_LINK);
  if (!S.key) { screenBlocked(); return; }
  if (p.get('k')) await store.set(store.KEY_LINK, S.key);
  if (!GAS_URL.includes('/exec')) { screenBlocked('config.js 에 Apps Script 주소가 아직 설정되지 않았습니다.'); return; }

  try { await loadHistory(); }
  catch (e) { await store.del(store.KEY_LINK); screenBlocked(e.message); return; }

  S.roster = await store.get(store.KEY_ROSTER);
  S.mock = await store.get(store.KEY_MOCK);
  if (!S.roster?.students?.length) S.roster = null;
  if (!S.mock?.students?.length) S.mock = null;
  if (S.roster || S.mock) showApp(S.roster ? 'susi' : 'jg');
  else screenUpload();
}

/* ── 이벤트 ────────────────────────────────────────── */

function bindChips(id, cb) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    [...e.currentTarget.children].forEach(c => c.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true'); cb(b);
  });
}

function selectTab(t) {
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t === t)));
  ['stu', 'univ', 'track', 'jg'].forEach(k => $('p-' + k).classList.toggle('hidden', k !== t));
}

/* ── 사례 크게 보기 ────────────────────────────────────
   목록에서 카드를 누르면 열립니다. ← → 로 넘기고 Esc로 닫습니다. */

let caseAt = -1;

function caseOpen(i) {
  if (!S.cases.length) return;
  caseAt = Math.max(0, Math.min(i, S.cases.length - 1));
  casePaint();
  $('mask').classList.add('on');
  $('md-next').focus();
}

function caseClose() {
  $('mask').classList.remove('on');
  caseAt = -1;
}

function caseGo(d) {
  const n = caseAt + d;
  if (n < 0 || n >= S.cases.length) return;
  caseAt = n;
  casePaint();
}

function casePaint() {
  const v = R.caseView(S.cases[caseAt], caseAt, S.cases.length);
  $('md').classList.toggle('win', v.win);
  $('md-cnt').textContent = v.cnt;
  $('md-yr').textContent = v.yr;
  $('md-big').innerHTML = v.big;
  $('md-sc').innerHTML = v.chips;
  $('md-res').className = 'res' + (v.resNo ? ' no' : '');
  $('md-res').textContent = v.res;
  $('md-b').innerHTML = v.body;
  $('md-b').scrollTop = 0;
  $('md-prev').disabled = caseAt === 0;
  $('md-next').disabled = caseAt === S.cases.length - 1;
}

$('p-stu').addEventListener('click', e => {
  const card = e.target.closest('.stu[data-case]');
  if (card) caseOpen(+card.dataset.case);
});
$('md-prev').addEventListener('click', () => caseGo(-1));
$('md-next').addEventListener('click', () => caseGo(1));
$('md-x').addEventListener('click', caseClose);
$('md-close').addEventListener('click', caseClose);
$('mask').addEventListener('click', e => { if (e.target === $('mask')) caseClose(); });
document.addEventListener('keydown', e => {
  if (!$('mask').classList.contains('on')) return;
  if (e.key === 'Escape') { caseClose(); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); caseGo(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); caseGo(1); }
});

$('f-roster').addEventListener('change', e => { if (e.target.files[0]) loadRoster(e.target.files[0]); e.target.value = ''; });
$('f-mock').addEventListener('change', e => { if (e.target.files.length) loadMock([...e.target.files]); e.target.value = ''; });
$('f-history').addEventListener('change', e => { if (e.target.files[0]) pickHistory(e.target.files[0]); e.target.value = ''; });
$('f-cut').addEventListener('change', e => { if (e.target.files[0]) pickCut(e.target.files[0]); e.target.value = ''; });

/* 배치 탭 안의 판정 칩·검색 */
function filterPlacement() {
  const j = $('p-jg').querySelector('#plchips .chip[aria-pressed=true]')?.dataset.j || 'all';
  const q = ($('p-jg').querySelector('#plq')?.value || '').trim().toLowerCase();
  $('p-jg').querySelectorAll('tr.pl').forEach(tr => {
    tr.classList.toggle('hidden', (j !== 'all' && tr.dataset.j !== j) || (q && !tr.dataset.q.includes(q)));
  });
}
$('p-jg').addEventListener('click', e => {
  const b = e.target.closest('#plchips .chip'); if (!b || b.disabled) return;
  b.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true'); filterPlacement();
});
$('p-jg').addEventListener('input', e => { if (e.target.id === 'plq') filterPlacement(); });

$('cls').addEventListener('change', fillStudents);
$('q').addEventListener('input', fillStudents);
$('stu').addEventListener('change', onStudentChange);
$('gpa').addEventListener('input', () => {
  $('gpanote').textContent = (S.cur && S.mode === 'susi' && Math.abs((parseFloat($('gpa').value) || 0) - S.cur.g[3]) > 0.004)
    ? `· ${S.cur.nm} 실제 ${S.cur.g[3].toFixed(2)}` : '';
});

let timer = null;
['gpa', 'c_k', 'c_m', 'c_e', 'c_s1', 'c_s2', 'p_k', 'p_m', 'p_s1', 'p_s2', 'p_e', 'topn', 'yrs'].forEach(id =>
  $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); }));

bindChips('gychips', b => { selGy = +b.dataset.gy; run(); });
bindChips('modechips', b => setMode(b.dataset.mode));

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => selectTab(t.dataset.t)));

$('btn-roster').addEventListener('click', () => {
  if (S.mode === 'jg') $('f-mock').click(); else screenUpload();
});
$('btn-wipe').addEventListener('click', async () => {
  if (!confirm('이 컴퓨터에 저장된 명단과 자료를 지웁니다.\n다음 접속 때 링크로 다시 받아옵니다.\n계속할까요?')) return;
  await store.clearAll();
  location.replace(location.pathname);
});

boot();
