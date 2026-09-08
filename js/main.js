import * as CFG from '../config.js';
const { GAS_URL, SCHOOL, ROSTER_STEPS } = CFG;
/* 모의고사 성적표 받는 경로. config.js 에 MOCK_STEPS 를 넣으면 그쪽이 우선합니다. */
const MOCK_STEPS = CFG.MOCK_STEPS || [
  '김영일 컨설팅 로그인', '성적관리', '모의고사 성적 업로드',
  '성적분석', '영역별 기준 수능성적표', '본인 학급', '보기', '하단 다운로드로 엑셀파일 받기',
];
import * as store from './store.js';
import * as api from './api.js';
import { encode, decode } from './codec.js';
import {
  parseHistory, parseRoster, parseMockExam, mergeMockExam, pctAvg, examInfo, parseCutTable,
  parseSubjectTable, parseSubjectChoice, mergeChoice, parseJeongsiFile, ROSTER_PV,
} from './parse.js';
import {
  buildIndex, findSimilar, summarize, aggregateUniv, aggregateTrack, aggregateJeongsi, csatAvg,
  findSimilarJeongsi, summarizeJeongsi, aggregateJeongsiUniv, aggregateGroup,
  placement, schoolJeongsiStats,
} from './match.js';
import * as R from './render.js';
import { matchUnits, univKey } from './subject.js';
import { placementJG } from './jeongsi.js';

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
  jg: null,       // 정시 지원가능 자료 (대학 공개 정시 결과 + 반영 방식)
  jgVersion: null,
  sel: null,      // 선택과목 자료 (대학 권장과목 + 우리 학교 편제) — 이름 없음
  selVersion: null,
  choice: null,   // 학생별 선택 결과 — 실명이 들어 있어 이 브라우저에만 둡니다
};

/* 과목 선택 화면의 상태 */
const SEL = { picked: [], grade: 1, chosen: new Set(), openG: new Set(), sumOpen: false, stu: null,
  uFilter: 'all', uQ: '' };
let uApps = null;   // 대학 이름 → 우리 학교 6개년 지원 건수

/* ── 표지 조각 ─────────────────────────────────────── */

const LEFT = () => `<div>
  <div class="cv-since">${esc(SCHOOL.since)}</div>
  <div class="cv-title">${esc(SCHOOL.title[0])}<br><span class="accent">${esc(SCHOOL.title[1])}</span></div>
  <div class="cv-en">${esc(SCHOOL.titleEn)}</div>
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

/* 처음에는 접혀 있습니다. 제목을 누르면 펴집니다. */
const howto = steps => `<details class="howto">
  <summary><span class="tk2"></span>자료 받는 방법<span class="arw2">▾</span></summary>
  <div class="path">${steps.map((s, i) =>
    `${i ? '<span class="arw">›</span>' : ''}<span class="s ${i === 0 ? 'a' : i === steps.length - 1 ? 'z' : ''}">${esc(s)}</span>`).join('')}</div>
</details>`;

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
      <div class="cv-panel one">
        <div class="p-head"><span class="p-num">1</span><h2>5개년 지원결과</h2>
          <span class="p-line">지원 ${m.nApps.toLocaleString()}건 · 학생 ${m.nPersons.toLocaleString()}명 —
            자동으로 들어옵니다. 따로 올리실 것 없습니다.</span>
          <span class="p-tag">불러옴</span></div>
      </div>

      <div class="cv-pair">
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">2</span><h2>학생부성적표 · 수시·정시 상담</h2>${tag(S.roster)}</div>
        <div class="p-hint">내신이 포함된 학생부 성적표를 김영일 컨설팅에서 내려받아 올리면 자동으로 읽습니다.</div>
        ${howto(ROSTER_STEPS)}
        <div class="dropzone" id="dz">
          <strong>파일을 끌어다 놓거나 클릭해서 선택</strong>
          <div class="dz-hint">○○○○년 학생부성적표 … ○학년.xlsx</div>
          <div class="dz-tags"><span class="dz-tag">학급·번호·이름</span>
            <span class="dz-tag">학년별 내신</span><span class="dz-tag">과목별 등급</span></div>
        </div>
      </div>

      <div class="cv-panel">
        <div class="p-head"><span class="p-num">3</span><h2>모의고사 성적표 · 정시 상담</h2>${tag(S.mock)}</div>
        <div class="p-hint">모의고사 성적을 김영일 컨설팅에 올린 뒤, 김영일 사이트에서 내려받아 여기에 올리면 됩니다.</div>
        ${howto(MOCK_STEPS)}
        <div class="dropzone" id="dz2">
          <strong>파일을 끌어다 놓거나 클릭해서 선택</strong>
          <div class="dz-hint">○○○○년 ○월 교육청 영역별 기준 수능성적표 … ○학년.xls</div>
          <div class="dz-tags"><span class="dz-tag">등급·백분위·표준점수</span><span class="dz-tag">반별 파일 여러 개 가능</span></div>
        </div>
      </div>
      </div>

      <label class="opt"><input type="checkbox" id="keep" checked>
        <span class="t">체크를 하시면 다음 접속 때부터 이 화면 없이 바로 상담 화면으로 들어갑니다.
          <b>공용 PC에서는 체크를 하지 마세요.</b></span></label>
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
    if (S.choice?.meta?.src === 'server') attachNames(S.choice);
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
  /* 명단은 이 컴퓨터에 남아 있다가 다음 해에도 그대로 열릴 수 있습니다. 올린 날짜를 같이 보여 줍니다. */
  const when = d => {
    if (!d?.meta?.loadedAt) return '';
    const t = new Date(d.meta.loadedAt);
    const old = (Date.now() - t) > 180 * 86400e3;
    return `<i class="when${old ? ' old' : ''}">${t.getFullYear()}.${t.getMonth() + 1}.${t.getDate()} 올림${old ? ' · 오래됨' : ''}</i>`;
  };
  $('sb-scope').innerHTML =
    `<div class="row"><span>5개년 자료</span><b>지원 ${m.nApps.toLocaleString()}건</b></div>` +
    (S.roster ? `<div class="row"><span>${gl(S.roster)} 학생부${when(S.roster)}${S.roster.meta.stale ? '<i class="when old">예전 판으로 읽힘 · 다시 올려 주세요</i>' : ''}</span><b class="off">${S.roster.meta.n}명</b></div>` : '') +
    (S.mock ? `<div class="row"><span>${esc(S.mock.meta.label || '모의고사')}${when(S.mock)}</span><b class="off">${S.mock.meta.n}명</b></div>` : '');
  $('m-susi').textContent = S.roster ? `${gl(S.roster)} ${S.roster.meta.n}명`.trim() : '명단 없음';
  $('m-jg').textContent = S.mock ? (S.mock.meta.label || `${S.mock.meta.n}명`) : '명단 없음';
  $('c-mode-sel').classList.toggle('hidden', !S.sel);
  if (S.sel) $('m-sel').textContent = choiceLabel(S.choice);
  setMode(mode || S.mode);
}

/* 학생을 바꾸거나 목록을 바꿀 때 앞 학생의 값이 한 칸도 남지 않게 전부 비웁니다.
   내신·수능 등급·백분위 칸이 남아 있으면 다음 학생 계산에 섞여 들어갑니다. */
const SCORE_INPUTS = ['gpa', 'c_k', 'c_m', 'c_e', 'c_s1', 'c_s2', 'p_k', 'p_m', 'p_s1', 'p_s2', 'p_e'];
function clearStudent() {
  S.cur = null;
  for (const id of SCORE_INPUTS) if ($(id)) $(id).value = '';
  if ($('gpanote')) $('gpanote').textContent = '';
  if ($('gpasubs')) $('gpasubs').innerHTML = '';
  $('gpa5c')?.classList.add('hidden');
  $('gpa5c')?.classList.remove('est');
  $('stucard')?.classList.add('hidden');
}

function toast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 4000);
}

function setMode(mode) {
  S.mode = mode;
  clearStudent();
  document.querySelectorAll('#modechips .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.mode === mode)));

  /* 과목 선택은 성적이 아니라 편제를 다루므로 사이드바 구성이 다릅니다. */
  const isSel = mode === 'sel';
  $('sb-sel').classList.toggle('hidden', !isSel);
  $('sb-stupick').classList.toggle('hidden', isSel);
  $('sb-cond').classList.toggle('hidden', isSel);
  $('sb-nums').classList.toggle('hidden', isSel);
  $('selview').classList.add('hidden');
  $('results').classList.toggle('hidden', true);
  $('btn-roster').textContent = isSel ? '학년별 선택 결과 올리기'
    : (mode === 'jg' ? '모의고사 성적표 다시 올리기' : '학생부성적표 다시 올리기');
  if (isSel) {
    $('placeholder').classList.remove('hidden');
    fillSelStudents();
    selTab('pick');
    selPaint();
    return;
  }

  $('in-susi').classList.toggle('hidden', mode !== 'susi');
  $('in-jg').classList.toggle('hidden', mode !== 'jg');
  $('stucard').classList.add('hidden');
  $('t-univ').textContent = mode === 'jg' ? '대학·학과' : '대학·전형';
  $('t-track').textContent = mode === 'jg' ? '군별 배분' : '카드 배분';
  $('t-jg').textContent = mode === 'jg' ? '배치' : '정시';
  document.querySelector('.tab[data-t="jg"]')?.classList.remove('hidden');
  $('c-jg').textContent = '';
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

const semLabelKo = k => String(k).replace(/^(\d)-(\d)$/, '$1학년 $2학기');
/* 「과목 선택」 칩 밑 글씨 — 몇 명, 어느 학기가 들어왔는지 */
const choiceLabel = c => (c ? `${c.meta.n}명 · ${(c.meta.sems || []).map(k => k.replace(/^\d-(\d)$/, '$1학기')).join('·')}` : '1·2학년');

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
  else if (S.cur) { clearStudent(); run(); }   // 고른 학생이 새 목록에 없으면 앞 학생 값을 남기지 않습니다
}

/* 명단의 같은 학생(학급·번호)을 다른 명단에서 찾습니다 — 학생부 학생의 모의고사 등급을 같이 채울 때 씁니다. */
const sameStudent = (list, s) => (list || []).find(x => x.c === s.c && x.no === s.no && x.nm === s.nm) || null;

function onStudentChange() {
  const v = $('stu').value;
  clearStudent();
  if (!v) return run();
  const [c, no] = v.split('-').map(Number);
  S.cur = currentList().find(s => s.c === c && s.no === no) || null;
  if (!S.cur) return run();
  if (S.mode === 'jg') {
    $('stucard').innerHTML = R.mockCard(S.cur, S.mock.meta.n);
    const p = S.cur.pct, g = S.cur.grade;
    $('p_k').value = p.k ?? ''; $('p_m').value = p.m ?? '';
    $('p_s1').value = p.s1 ?? ''; $('p_s2').value = p.s2 ?? '';
    $('p_e').value = g.e ?? '';
  } else {
    $('stucard').innerHTML = R.studentCard(S.cur, S.roster.meta.n, S.roster.meta);
    $('gpa').value = S.cur.g[3].toFixed(2);
    /* 모의고사 명단에 같은 학생이 있으면 수능 등급 칸을 그 학생 것으로 채웁니다. 없으면 빈칸입니다. */
    const mk = sameStudent(S.mock?.students, S.cur);
    if (mk?.grade) {
      $('c_k').value = mk.grade.k ?? ''; $('c_m').value = mk.grade.m ?? ''; $('c_e').value = mk.grade.e ?? '';
      $('c_s1').value = mk.grade.s1 ?? ''; $('c_s2').value = mk.grade.s2 ?? '';
    }
    $('gpasubs').innerHTML = R.gpaSubs(S.cur, S.roster?.meta);
    /* 전교과 5등급은 1·2학년 성적표에만 들어 있습니다. */
    $('gpa5').textContent = S.cur.a5 != null ? S.cur.a5.toFixed(2) : '—';
    $('gpa5c').classList.toggle('hidden', S.cur.a5 == null);
    $('gpa5c').classList.remove('est'); $('gpa5c').title = '';
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
  if (S.mode === 'sel') return runSel();
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
  applyCaseFilter();
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
  applyCaseFilter();
  const uni = aggregateJeongsiUniv(sum.jg);
  $('p-univ').innerHTML = R.jeongsiUnivTable(uni);
  $('p-track').innerHTML = R.groupTable(groups, sum);
  /* 등급 평균과 한국사는 명단 학생의 성적표에서만 옵니다. 입력칸을 손으로 고쳤으면
     그 학생 것이 아니므로 쓰지 않습니다 — 백분위에서 환산한 값으로 넘어갑니다. */
  const untouched = S.cur?.pct && S.cur.pct.k === pct.k && S.cur.pct.m === pct.m
    && S.cur.pct.s1 === pct.s1 && S.cur.pct.s2 === pct.s2 && (S.cur.grade?.e ?? null) === eng;
  const myGrade = (untouched && S.cur?.grade) ? (() => { const g = [S.cur.grade.k, S.cur.grade.m, S.cur.grade.s1, S.cur.grade.s2].filter(x => x != null); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null; })() : null;
  const his = untouched ? (S.cur?.grade?.h ?? null) : null;
  if (!S.school) S.school = schoolJeongsiStats(S.index);
  /* 배치 탭 — 정시 자료가 있으면 그쪽으로, 없으면 예전 배치기준표로. 둘 다 없으면 탭을 감춥니다. */
  const has = !!(S.jg || S.cut);
  const tabJg = document.querySelector('.tab[data-t="jg"]');
  if (tabJg) tabJg.classList.toggle('hidden', !has);
  if (!has && document.querySelector('.tab[data-t="jg"][aria-selected="true"]')) selectTab('stu');
  let nJg = '';
  if (S.jg) {
    jgRes = placementJG(S.jg.units, { pct, eng, his });
    jgFilter = '적정'; jgQ = '';
    $('p-jg').innerHTML = R.jgTable(jgRes, { trend: S.jg.trend, meta: S.jg.meta, credit: JG_CREDIT });
    filterJG();
    nJg = jgRes.filter(r => r.judge === '적정').length;
  } else if (S.cut) {
    const pl = placement(S.cut, { pct, eng, myGrade, gy: selGy, similarRows: sum.jg, school: S.school });
    $('p-jg').innerHTML = R.placementTable(pl, { exam: S.mock?.meta, cutMeta: S.cut.meta });
    nJg = pl.list.length;
  } else $('p-jg').innerHTML = '';
  finish(sel, { univ: uni.length, jg: nJg });
}

/* ── 선택과목 구성 ─────────────────────────────────── */

function fillSelStudents() {
  const list = S.choice?.students || [];
  const cs = [...new Set(list.map(s => s.cls))].sort((a, b) => a - b);
  const keepC = $('selcls').value;
  $('selcls').innerHTML = '<option value="">전체 학급</option>'
    + cs.map(c => `<option value="${c}">${esc(R.clsLabel(c))}</option>`).join('');
  if (keepC) $('selcls').value = keepC;
  const c = $('selcls').value;
  const f = list.filter(s => !c || String(s.cls) === c);
  $('selstu').innerHTML = '<option value="">선택 안 함</option>'
    + f.map(s => `<option value="${s.cls}-${s.no}">${esc(`${s.no}번 ${s.nm}`)}</option>`).join('');
  if (SEL.stu && f.some(s => s.cls === SEL.stu.cls && s.no === SEL.stu.no)) $('selstu').value = `${SEL.stu.cls}-${SEL.stu.no}`;
  else SEL.stu = null;
}

function selPaint() {
  if (!S.sel) return;
  $('selfbox').innerHTML = R.fieldList(S.sel, SEL.picked, ($('selq').value || '').trim());
  $('selpicked').innerHTML = R.pickedChips(SEL.picked);
  $('sb-selstu').classList.toggle('hidden', !(S.choice && SEL.grade === 2));
  runSel();
}

function runSel() {
  if (!S.sel) return;
  const m = S.sel.meta || {};
  $('selnote').textContent = `대학 ${m.nRec ? `권장과목 ${m.nRec.toLocaleString()}건` : ''}`
    + ` · 우리 학교 개설 ${m.nSub || 0}과목`;
  $('seltitle').textContent = SEL.grade === 1 ? '2학년 과목 고르기' : '3학년 과목 고르기';
  if (!SEL.picked.length) {
    $('selview').classList.add('hidden');
    $('placeholder').classList.remove('hidden');
    $('placeholder').innerHTML = '왼쪽에서 <b>희망 분야</b>를 고르면 그 분야가 요구하는 과목이 우리 학교 편제 위에 표시됩니다.'
      + '<br><span class="fine">분야는 최대 3개까지 함께 볼 수 있습니다.</span>';
    return;
  }
  $('placeholder').classList.add('hidden');
  $('selview').classList.remove('hidden');
  const taken = (SEL.grade === 2 && SEL.stu) ? SEL.stu.taken : null;
  $('s-pick').innerHTML = R.selPanel(S.sel, {
    picked: SEL.picked, grade: SEL.grade, chosen: SEL.chosen, taken,
    choice: S.choice, sumOpen: SEL.sumOpen, openG: SEL.openG, stu: SEL.stu,
  });
  const sb = selSubs();
  $('s-pick').insertAdjacentHTML('beforeend', R.selGoBar(sb.chosen.length, sb.taken.length));
  paintUnits();
  $('s-cond').innerHTML = R.selCond(S.sel, SEL.picked);
  $('s-miss').innerHTML = R.selMiss(S.sel, SEL.picked);
  $('c-scond').textContent = SEL.picked.reduce((a, f) => a + f.notes.length, 0) || '';
  const names = new Set(SEL.picked.map(f => f.name));
  $('c-smiss').textContent = S.sel.missing.filter(x => x.f.some(y => names.has(y))).length || '';
}

function selTab(t) {
  document.querySelectorAll('#seltabs .tab').forEach(x => x.setAttribute('aria-selected', String(x.dataset.s === t)));
  ['pick', 'cond', 'miss', 'univ'].forEach(k => $('s-' + k).classList.toggle('hidden', k !== t));
}

/* 지금 화면에 잡혀 있는 과목 — 고른 것 + (2학년이면) 이미 이수한 것 */
function selSubs() {
  const chosen = [...SEL.chosen].map(k => k.split('|')[2]);
  const taken = (SEL.grade === 2 && SEL.stu) ? (SEL.stu.taken || []) : [];
  return { chosen, taken, all: [...new Set(chosen.concat(taken))] };
}

/* 우리 학교 지원이 많은 대학을 위로 올리는 데 씁니다. */
function univApps() {
  if (uApps || !S.history) return uApps;
  uApps = new Map();
  for (const a of S.history.apps) {
    const k = univKey(a.univ);
    if (k) uApps.set(k, (uApps.get(k) || 0) + 1);
  }
  return uApps;
}

function paintUnits() {
  if (!S.sel?.units?.length) {
    $('s-univ').innerHTML = '<div class="empty">이 자료에는 대학별 원문 표가 없습니다. 관리자 화면에서 선택과목 엑셀을 다시 올려 주세요.</div>';
    $('c-suniv').textContent = '';
    return;
  }
  const res = matchUnits(S.sel, selSubs().all);
  SEL.uFilter = 'all'; SEL.uQ = '';
  $('s-univ').innerHTML = R.selUnits(res, { apps: univApps(), nUniv: S.sel.meta?.nUniv, coverage: unitCoverage() });
  $('c-suniv').textContent = res.filter(r => r.st === 'full').length;
}

/* 표는 한 번만 그리고, 칩·검색은 줄을 감추는 것으로 처리합니다. */
/* 권장과목 자료에 어느 대학이 있는지 — 없는 주요대와 한 계열만 낸 대학을 골라냅니다. */
const MAJOR_UNIV = ['서울대', '연세대', '고려대', '서강대', '성균관대', '한양대', '중앙대', '경희대', '한국외대', '서울시립대',
  '이화여대', '건국대', '동국대', '홍익대', '국민대', '숭실대', '세종대', '단국대', '아주대', '인하대', '광운대', '서울과기대',
  '숙명여대', '성신여대', '덕성여대', '동덕여대', '서울여대', '가톨릭대', '명지대', '상명대', '경기대'];
const GY_KO = { 인문: '인문', 사회: '사회', 교육: '교육', 자연: '자연', 공학: '공학', 의약: '의약', 예체능: '예체능' };
function unitCoverage() {
  const units = S.sel?.units || [];
  const byU = new Map();
  for (const r of units) {
    const k = univKey(r.u);
    if (!byU.has(k)) byU.set(k, { u: r.u.replace(/\s*\(.*?\)\s*/g, ''), hum: 0, nat: 0 });
    const o = byU.get(k);
    for (const f of r.f || []) {
      const gy = S.sel.fields?.[f]?.gy;
      if (['인문', '사회', '예체능'].includes(gy)) o.hum++;
      else if (['자연', '공학', '의약'].includes(gy)) o.nat++;
      /* 「교육」은 사범대처럼 계열이 섞여 있어 세지 않습니다 */
    }
  }
  const present = new Set([...byU.keys()]);
  const absent = MAJOR_UNIV.filter(u => !present.has(univKey(u)));
  const partial = [];
  for (const o of byU.values()) {
    if (!MAJOR_UNIV.some(m => univKey(m) === univKey(o.u))) continue;
    const tot = o.hum + o.nat;
    if (tot >= 3 && (o.hum === 0 || o.nat === 0)) partial.push({ u: o.u, gy: o.hum ? '인문·사회계열' : '자연·공학·의약계열' });
  }
  return { nUniv: byU.size, absent, partial, byU };
}

function filterUnits() {
  let n = 0;
  $('s-univ').querySelectorAll('tr.ur').forEach(tr => {
    const ok = (SEL.uFilter === 'all' || tr.dataset.st === SEL.uFilter)
      && (!SEL.uQ || tr.dataset.q.includes(SEL.uQ));
    tr.classList.toggle('hidden', !ok);
    if (ok) n++;
  });
  const e = $('unone'); if (e) e.hidden = n > 0;
  /* 검색어에 맞는 대학이 자료에 아예 없거나, 그 대학이 한 계열만 낸 경우를 짚어 줍니다. */
  const ab = $('uabsent');
  if (ab) {
    ab.hidden = true;
    if (n === 0 && SEL.uQ) {
      const cov = unitCoverage();
      const q = SEL.uQ.replace(/\s+/g, '');
      const hit = [...cov.byU.values()].find(x => univKey(x.u).includes(q.split(/대/)[0]) && q.length >= 2);
      const uname = q.replace(/(학교|경영|경제|의예|공학|학과|학부).*$/, '');
      if (!hit && uname) {
        ab.innerHTML = `<b>${esc(uname)}</b>… 로 시작하는 대학은 이 자료에 없습니다. 권장과목을 공개하지 않은 대학이라 표에 안 나오는 것이지, 지원에 불리하다는 뜻이 아닙니다.`;
        ab.hidden = false;
      } else if (hit) {
        const p = cov.partial.find(x => x.u === hit.u);
        ab.innerHTML = `<b>${esc(hit.u)}</b>는 ${p ? `<b>${esc(p.gy)}</b> 모집단위만 권장과목을 냈습니다. 그 밖의 학과는 과목을 지정하지 않았습니다.` : '이 검색어에 맞는 모집단위가 없습니다. 학과 이름을 줄여서 찾아 보세요.'}`;
        ab.hidden = false;
      }
    }
  }
}

function selPick(name) {
  const f = S.sel.fields[name];
  if (!f) return;
  const i = SEL.picked.findIndex(p => p.name === name);
  if (i >= 0) SEL.picked.splice(i, 1);
  else if (SEL.picked.length >= 3) return;
  else SEL.picked.push(f);
  /* 분야가 바뀌면 새 상담입니다. 앞서 눌러 둔 과목은 비우고 빈칸에서 시작합니다. */
  SEL.chosen.clear();
  SEL.openG.clear();
  selPaint();
}

/* 학생별 선택 결과 — 실명이 들어 있어 서버로 보내지 않습니다. */
async function loadChoice(files) {
  try {
    const parts = [];
    for (const f of files) {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      parts.push(...parseSubjectChoice(wb, XLSX, f.name));
    }
    if (!parts.length) throw new Error('「이름」 열이 있는 시트를 찾지 못했습니다.');
    /* 한 파일씩 올려도 쌓입니다 — 같은 학기는 새 파일로 바꾸고, 다른 학기는 옆에 둡니다. */
    const sems = new Set(parts.map(p => p.sem));
    const kept = (S.choice?.meta?.src === 'local' && S.choice.parts) ? S.choice.parts.filter(p => !sems.has(p.sem)) : [];
    const all = kept.concat(parts);
    S.choice = mergeChoice(all, S.sel);
    S.choice.meta.src = 'local';
    S.choice.parts = all;
    await store.set(store.KEY_CHOICE, S.choice);
    $('m-sel').textContent = choiceLabel(S.choice);
    fillSelStudents();
    selPaint();
    const have = S.choice.meta.sems.map(semLabelKo).join(' · ');
    toast(`선택 결과 ${S.choice.meta.n}명 — ${have}${S.choice.meta.sems.length < 2 ? ' (다른 학기 파일도 올리면 합쳐집니다)' : ''}`);
  } catch (e) {
    alert('선택 결과를 읽지 못했습니다 — ' + e.message);
  }
}

/* 정시 배치 — 칩과 검색은 줄을 감추는 것으로 처리합니다. */
let jgRes = [], jgFilter = '적정', jgQ = '';
const JG_CREDIT = '정시 자료: YMABI 「27학년도 정시 지원가능 대학 및 학과 검색」 · 제작자 이용허락을 받아 씁니다.';

function filterJG() {
  let n = 0;
  $('p-jg').querySelectorAll('tr.jgr').forEach(tr => {
    const ok = (jgFilter === 'all' || tr.dataset.j === jgFilter) && (!jgQ || tr.dataset.q.includes(jgQ));
    tr.classList.toggle('hidden', !ok);
    if (ok) n++;
  });
  const e = $('jgnone'); if (e) e.hidden = n > 0;
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
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">정</span><h2>정시 지원가능 자료</h2>
          <span class="p-tag">${esc(status?.정시요약 || '아직 없음')}</span></div>
        <div class="p-hint">62개 대학의 정시 결과와 수능 반영 방식이 든 파일(.xlsb)입니다.
          매월 새 파일이 나오면 여기에 다시 올리면 됩니다.${status?.정시갱신 ? ` 최종 갱신 ${esc(status.정시갱신)}` : ''}<br>
          ${esc(JG_CREDIT)}</div>
        <div class="adm-row"><span class="n">↓</span><span class="t"><b>제작자 저장소에서 바로 받기</b>
          <span id="j-remote">누르면 새 파일이 있는지 확인합니다</span></span>
          <button class="mini" id="j-check">새 파일 확인</button></div>
        <div class="adm-row"><span class="n">1</span><span class="t"><b>파일을 직접 올리기</b>
          <span>내려받아 두신 파일이 있으면 이쪽으로</span></span>
          <button class="mini" id="j-pick">파일 선택</button></div>
        <div class="adm-row"><span class="n">2</span><span class="t"><b>변환 확인</b>
          <span id="j-parsed">파일을 올리면 모집단위 수를 확인합니다</span></span>
          <button class="mini" id="j-send" disabled>시트에 반영</button></div>
      </div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">선</span><h2>선택과목 자료</h2>
          <span class="p-tag">${esc(status?.선택요약 || '아직 없음')}</span></div>
        <div class="p-hint">대학이 공개한 <b>전공별 권장과목</b>과 우리 학교 편제를 담은 엑셀입니다.
          「학교 메모」 칸에 선생님 안내를 적어 다시 올리면 그대로 화면에 나옵니다.${status?.선택갱신 ? ` 최종 갱신 ${esc(status.선택갱신)}` : ''}</div>
        <div class="adm-row"><span class="n">1</span><span class="t"><b>선택과목 엑셀 올리기</b>
          <span>학문분야 · 권장과목 · 우리학교과목 시트가 있는 파일</span></span>
          <button class="mini" id="s-pick2">파일 선택</button></div>
        <div class="adm-row"><span class="n">2</span><span class="t"><b>변환 확인</b>
          <span id="s-parsed">파일을 올리면 분야 수를 확인합니다</span></span>
          <button class="mini" id="s-send" disabled>시트에 반영</button></div>
      </div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">결</span><h2>학년별 선택 결과</h2>
          <span class="p-tag">${esc(status?.결과요약 || '아직 없음')}</span></div>
        <div class="p-hint">학교가 만든 <b>반별 선택 명단</b>(1학기·2학기 파일을 한꺼번에)입니다. 올리면 모든 선생님 화면의 「과목 선택」에
          타임·인원·학생별 이수 과목이 자동으로 붙습니다.<br>
          <b>이름은 이 브라우저에서 지우고 학급·번호·과목만 보냅니다.</b> 원본 파일은 서버로 가지 않습니다.${status?.결과갱신 ? ` 최종 갱신 ${esc(status.결과갱신)}` : ''}</div>
        <div class="adm-row"><span class="n">1</span><span class="t"><b>반별 선택 명단 올리기</b>
          <span>「이름」 열이 있는 시트 · 한 번에 여러 파일을 골라도, 한 파일씩 차례로 골라도 됩니다 — 고른 파일이 아래에 쌓입니다</span>
          <div id="r-files" class="adm-files"></div></span>
          <button class="mini" id="r-pick">파일 추가</button></div>
        <div class="adm-row"><span class="n">2</span><span class="t"><b>학생부 명단으로 반·번호 맞추기</b> <span class="wn">(권장)</span>
          <span id="r-roster">학생부성적표를 고르면 이름으로 짝을 맞춰 반·번호를 학생부 기준으로 바꾸고, 학생부에 없는 학생(자퇴·전학)은 뺍니다. 이 파일도 서버로 가지 않습니다.</span></span>
          <button class="mini" id="r-roster-pick">파일 선택</button></div>
        <div class="adm-row"><span class="n">3</span><span class="t"><b>변환 확인</b>
          <span id="r-parsed">파일을 올리면 인원과 학기를 확인합니다</span></span>
          <button class="mini" id="r-send" disabled>시트에 반영</button></div>
      </div>
      ${msg ? `<div class="cv-panel"><div class="p-hint" style="color:#e5ebfa">${msg}</div></div>` : ''}
    </div>
  </div>`, [['d-gold', '관리자']]);
  $('a-pick').addEventListener('click', () => $('f-history').click());
  $('a-send').addEventListener('click', sendHistory);
  $('c-pick').addEventListener('click', () => $('f-cut').click());
  $('c-send').addEventListener('click', sendCut);
  $('j-check').addEventListener('click', () => checkJG(status?.정시SHA || ''));
  $('j-pick').addEventListener('click', () => $('f-jg').click());
  $('j-send').addEventListener('click', sendJG);
  $('s-pick2').addEventListener('click', () => $('f-sel').click());
  $('s-send').addEventListener('click', sendSel);
  $('r-pick').addEventListener('click', () => $('f-choice-adm').click());
  $('r-roster-pick').addEventListener('click', () => $('f-roster-adm').click());
  $('r-send').addEventListener('click', sendChoiceAdm);
}

/* ── 학년별 선택 결과 → 서버 (이름 제거) ─────────────────
   선택 명단의 반·번호는 학생부 명단과 어긋날 수 있습니다(번호를 새로 매긴 뒤·전의 자료).
   교사 화면은 반·번호로 학생부와 짝을 맞추므로, 여기서 학생부 명단을 같이 고르면
   이름으로 짝을 맞춰 반·번호를 학생부 기준으로 바꾸고 학생부에 없는 학생은 뺍니다. 두 파일 모두 서버로 가지 않습니다. */
let pendingChoice = null, choiceRaw = null, rosterAdm = null;
let choiceFiles = [];   // [{ name, parts }] — 고른 순서대로 쌓이고, 같은 학기를 다시 고르면 그 학기만 바뀝니다
const nmKey = s => String(s || '').replace(/\s+/g, '');
const semKo = k => String(k).replace(/^(\d)-(\d)$/, '$1학년 $2학기');

/* 어떤 학기가 들어왔고 어떤 학기가 비었는지를 파일 목록으로 보여 줍니다.
   「두 개 올렸는데 하나만 잡힌 건가」를 여기서 바로 알 수 있게. */
function renderChoiceFiles() {
  const box = $('r-files'); if (!box) return;
  if (!choiceFiles.length) { box.innerHTML = ''; return; }
  const have = new Set(choiceFiles.flatMap(f => f.parts.map(p => p.sem)));
  const grade = [...have][0]?.[0] || '2';
  const want = [`${grade}-1`, `${grade}-2`];
  const rows = choiceFiles.map((f, i) => `<div class="af"><span class="ok">✓</span><b>${esc(f.name)}</b>
      <span>${f.parts.map(p => `${semKo(p.sem)} ${p.n}명`).join(' · ')}</span><button class="x" data-i="${i}" title="목록에서 빼기">×</button></div>`).join('');
  const chips = want.map(k => have.has(k) ? `<span class="sc on">${semKo(k)} ✓</span>` : `<span class="sc">${semKo(k)} 아직 없음</span>`).join('');
  box.innerHTML = rows + `<div class="af-sum">${chips}${have.size < 2 ? '<i>학기 파일이 하나뿐입니다. 나머지 학기 파일도 「파일 추가」로 올려 주세요.</i>' : ''}</div>`;
  box.querySelectorAll('.x').forEach(b => b.addEventListener('click', () => {
    choiceFiles.splice(+b.dataset.i, 1);
    choiceRaw = choiceFiles.flatMap(f => f.parts);
    renderChoiceFiles();
    if (choiceRaw.length) buildPendingChoice(); else { pendingChoice = null; $('r-parsed').textContent = '파일을 올리면 인원과 학기를 확인합니다'; $('r-send').disabled = true; }
  }));
}

function buildPendingChoice() {
  if (!choiceRaw) return;
  const stat = [];
  const parts = choiceRaw.map(p => {
    let same = 0, renum = 0, dropped = 0, ambiguous = 0;
    const students = [];
    for (const st of p.students) {
      let cls = st.cls, no = st.no;
      if (rosterAdm) {
        const cands = rosterAdm.students.filter(r => nmKey(r.nm) === nmKey(st.nm));
        const inCls = cands.filter(r => r.c % 100 === st.cls);
        const hit = inCls.length === 1 ? inCls[0] : (cands.length === 1 ? cands[0] : null);
        if (!hit) { if (cands.length) ambiguous++; else dropped++; continue; }
        if (hit.c % 100 === st.cls && hit.no === st.no) same++; else renum++;
        cls = hit.c % 100; no = hit.no;
      }
      students.push({ cls, no, picks: st.picks });     // 이름은 여기서 사라집니다
    }
    if (rosterAdm) stat.push(`${p.sem.replace(/^(\d)-(\d)$/, '$1학년 $2학기')} 같음 ${same}${renum ? ` · 번호 바꿈 ${renum}` : ''}${dropped ? ` · 학생부에 없어 뺌 ${dropped}` : ''}${ambiguous ? ` · 동명이인 미확정 ${ambiguous}` : ''}`);
    return { sem: p.sem, year: p.year, sheet: p.sheet, n: students.length, students };
  });
  const ids = new Set(); parts.forEach(p => p.students.forEach(st => ids.add(`${st.cls}-${st.no}`)));
  const sems = [...new Set(parts.map(p => p.sem))].sort();
  const year = Math.max(...parts.map(p => p.year || 0)) || null;
  pendingChoice = { parts, meta: { year, n: ids.size, sems, matched: !!rosterAdm, loadedAt: Date.now() } };
  const semTxt = sems.map(k => k.replace(/^(\d)-(\d)$/, '$1학년 $2학기')).join(' / ');
  const fit = rosterAdm
    ? `<br>학생부와 맞춤 — ${stat.join(' / ')}`
    : ' · <span style="color:#ffd27a">학생부 명단과 안 맞췄음 — 반·번호가 다르면 다른 학생에게 붙습니다</span>';
  $('r-parsed').innerHTML = `<b style="color:#e5ebfa">${year ? year + '학년도 · ' : ''}${ids.size}명</b> · ${semTxt} · 이름 제거됨${fit}`;
  $('r-send').disabled = false;
}

async function pickChoiceAdm(files) {
  $('r-parsed').textContent = `${files.map(f => f.name).join(', ')} 읽는 중…`;
  try {
    for (const f of files) {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const parts = parseSubjectChoice(wb, XLSX, f.name);
      if (!parts.length) throw new Error(`${f.name} — 「이름」 열이 있는 시트를 찾지 못했습니다.`);
      /* 같은 학기를 다시 고르면 예전 파일을 밀어냅니다. 다른 학기면 옆에 쌓입니다. */
      const sems = new Set(parts.map(p => p.sem));
      choiceFiles = choiceFiles.filter(x => !x.parts.some(p => sems.has(p.sem)));
      choiceFiles.push({ name: f.name, parts });
    }
    choiceRaw = choiceFiles.flatMap(f => f.parts);
    renderChoiceFiles();
    buildPendingChoice();
  } catch (e) {
    $('r-parsed').innerHTML = `<span style="color:#ff9c9c">읽지 못했습니다 — ${esc(e.message)}</span>`;
    $('r-send').disabled = true;
  }
}

async function pickRosterAdm(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const data = parseRoster(wb, XLSX);
    if (!data.students.length) throw new Error('학생을 찾지 못했습니다.');
    rosterAdm = data;
    $('r-roster').innerHTML = `<b style="color:#e5ebfa">${esc(file.name)}</b> · ${data.students.length}명 — 이 명단의 반·번호를 기준으로 맞춥니다`;
    buildPendingChoice();
  } catch (e) {
    $('r-roster').innerHTML = `<span style="color:#ff9c9c">학생부성적표를 읽지 못했습니다 — ${esc(e.message)}</span>`;
  }
}

async function sendChoiceAdm() {
  if (!pendingChoice) return;
  $('r-send').disabled = true;
  try {
    const res = await api.uploadData(S.admin, pendingChoice, (i, n) => { $('r-parsed').textContent = `보내는 중 ${i}/${n}`; }, 'choice');
    await store.del(store.KEY_CHOICE_SRV);
    choiceFiles = []; choiceRaw = null; pendingChoice = null; rosterAdm = null;
    screenAdmin(await api.adminStatus(S.admin).catch(() => null), `학년별 선택 결과 반영이 끝났습니다. ${esc(res.요약 || '')}`);
  } catch (e) {
    $('r-parsed').innerHTML = `<span style="color:#ff9c9c">${esc(e.message)}</span>`;
    $('r-send').disabled = false;
  }
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

let pendingJG = null, pendingSha = '';

/* 저장소에서 새 파일이 있는지 보고, 있으면 받아서 바로 변환까지 합니다. */
async function checkJG(savedSha) {
  const say = h => { $('j-remote').innerHTML = h; };
  $('j-check').disabled = true;
  try {
    say('저장소를 확인하는 중…');
    const f = await api.jgLatest();
    const mb = (f.size / 1048576).toFixed(1);
    if (savedSha && savedSha === f.sha) {
      say(`<b style="color:#9be6b4">이미 최신입니다</b> — ${esc(f.name)} · ${mb}MB`);
      $('j-check').disabled = false; return;
    }
    say(`<b style="color:#e5ebfa">새 파일이 있습니다</b> — ${esc(f.name)} · ${mb}MB · 받는 중…`);
    const buf = await api.jgDownload(f.url, (got, total) => {
      say(`받는 중 ${(got / 1048576).toFixed(1)} / ${mb} MB`);
    });
    say(`받았습니다. 읽는 중… <span class="wn">(파일이 커서 30초쯤 걸립니다)</span>`);
    await new Promise(r => setTimeout(r, 30));
    const wb = XLSX.read(buf, { type: 'array', sheets: ['26정시', '25정시', '24정시'] });
    pendingJG = parseJeongsiFile(wb, XLSX);
    pendingSha = f.sha;
    const m = pendingJG.meta;
    say(`<b style="color:#9be6b4">${esc(f.name)}</b> — ${m.nUniv}개 대학 · ${m.n.toLocaleString()}개 모집단위`);
    $('j-parsed').innerHTML = `저장소에서 받은 파일입니다. 아래 「시트에 반영」을 누르세요.`;
    $('j-send').disabled = false;
  } catch (e) {
    say(`<span style="color:#ff9c9c">${esc(e.message)}</span>`);
  }
  $('j-check').disabled = false;
}

async function pickJG(file) {
  $('j-parsed').textContent = `${file.name} 읽는 중… (파일이 커서 몇 초 걸립니다)`;
  try {
    /* 필요한 시트만 읽습니다 — 전체를 읽으면 훨씬 오래 걸립니다. */
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', sheets: ['26정시', '25정시', '24정시'] });
    const data = parseJeongsiFile(wb, XLSX);
    pendingJG = data; pendingSha = '';
    const m = data.meta;
    $('j-parsed').innerHTML = `<b style="color:#e5ebfa">${m.nUniv}개 대학</b> · ${m.n.toLocaleString()}개 모집단위 · ${m.years.join('·')}학년도`;
    $('j-send').disabled = false;
  } catch (e) {
    $('j-parsed').innerHTML = `<span style="color:#ff9c9c">읽지 못했습니다 — ${esc(e.message)}</span>`;
    $('j-send').disabled = true;
  }
}

async function sendJG() {
  if (!pendingJG) return;
  $('j-send').disabled = true;
  try {
    const res = await api.uploadData(S.admin, pendingJG,
      (i, n) => { $('j-parsed').textContent = `보내는 중 ${i}/${n}`; }, 'jg', { sha: pendingSha });
    await store.del(store.KEY_JG);
    screenAdmin(await api.adminStatus(S.admin).catch(() => null), `정시 자료 반영이 끝났습니다. ${esc(res.요약 || '')}`);
  } catch (e) {
    $('j-parsed').innerHTML = `<span style="color:#ff9c9c">${esc(e.message)}</span>`;
    $('j-send').disabled = false;
  }
}

let pendingSel = null;

async function pickSel(file) {
  $('s-parsed').textContent = `${file.name} 읽는 중…`;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const data = parseSubjectTable(wb, XLSX);
    if (!data.order.length) throw new Error('「학문분야」 시트에서 분야를 찾지 못했습니다.');
    pendingSel = data;
    const m = data.meta;
    $('s-parsed').innerHTML = `<b style="color:#e5ebfa">${m.nField}개 학문분야</b> · 권장과목 ${m.nRec.toLocaleString()}건 · 우리 학교 ${m.nSub}과목`;
    $('s-send').disabled = false;
  } catch (e) {
    $('s-parsed').innerHTML = `<span style="color:#ff9c9c">읽지 못했습니다 — ${esc(e.message)}</span>`;
    $('s-send').disabled = true;
  }
}

async function sendSel() {
  if (!pendingSel) return;
  $('s-send').disabled = true;
  try {
    const res = await api.uploadData(S.admin, pendingSel, (i, n) => { $('s-parsed').textContent = `보내는 중 ${i}/${n}`; }, 'sel');
    await store.del(store.KEY_SEL);
    screenAdmin(await api.adminStatus(S.admin).catch(() => null), `선택과목 자료 반영이 끝났습니다. ${esc(res.요약 || '')}`);
  } catch (e) {
    $('s-parsed').innerHTML = `<span style="color:#ff9c9c">${esc(e.message)}</span>`;
    $('s-send').disabled = false;
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
    /* 이 컴퓨터에 남아 있는 자료를 먼저 붙입니다 — 화면이 뜬 뒤에 탭이 뒤늦게 나타나지 않도록.
       새 자료가 있는지는 뒤에서 조용히 확인합니다. */
    await loadCut();
    await loadJG();
    await loadSel();
    await loadChoiceSrv();
    api.fetchVersion(S.key).then(v => {
      if (v.version && v.version !== S.version) refresh();
      loadCut(v.cutVersion);
      loadJG(v.jgVersion);
      loadSel(v.selVersion).then(() => loadChoiceSrv(v.choiceVersion));
    }).catch(() => { /* 다음 접속 때 다시 확인합니다 */ });
    return;
  }
  screenLoading('5개년 지원결과를 불러오는 중', 55);
  const res = await api.fetchData(S.key);
  S.history = decode(res.data);
  S.version = res.version;
  await store.set(store.KEY_DATA, { enc: res.data, version: res.version });
  await loadCut(null);
  await loadJG(null);
  await loadSel(null);
  await loadChoiceSrv(null);
}

/* 배치기준표 — 없어도 프로그램은 돌아갑니다. 조용히 시도합니다. */
async function loadCut(serverVersion) {
  const cached = await store.get(store.KEY_CUT);
  if (cached?.data) { S.cut = cached.data; S.cutVersion = cached.version; }
  if (serverVersion === undefined) return;   /* 캐시만 붙이는 호출 */
  if (cached?.data && serverVersion && cached.version === serverVersion) return;
  try {
    const res = await api.fetchCut(S.key);
    if (!res.ok || !res.data?.rows) return;
    S.cut = res.data; S.cutVersion = res.version;
    await store.set(store.KEY_CUT, { data: res.data, version: res.version });
    if (S.mode === 'jg' && S.index && !$('app').classList.contains('hidden')) run();
  } catch { /* 캐시가 있으면 그대로 씁니다 */ }
}

/* 정시 지원가능 자료 — 없어도 프로그램은 돌아갑니다. */
async function loadJG(serverVersion) {
  const cached = await store.get(store.KEY_JG);
  const use = d => {
    S.jg = d;
    if (S.mode === 'jg' && S.index && !$('app').classList.contains('hidden')) run();
  };
  if (cached?.data) { S.jgVersion = cached.version; use(cached.data); }
  if (serverVersion === undefined) return;
  if (cached?.data && serverVersion && cached.version === serverVersion) return;
  try {
    const res = await api.fetchJG(S.key);
    if (!res.ok || !res.data?.units) return;
    S.jgVersion = res.version;
    await store.set(store.KEY_JG, { data: res.data, version: res.version });
    use(res.data);
  } catch { /* 캐시가 있으면 그대로 씁니다 */ }
}

/* 선택과목 자료 — 없어도 프로그램은 돌아갑니다. 조용히 시도합니다. */
/* 선택 결과 — 이 컴퓨터에서 직접 올린 것(이름 있음)이 있으면 그것을, 없으면 서버 것(학급·번호만)을 씁니다.
   서버 것에는 이 컴퓨터의 학생부 명단에서 학급·번호로 이름을 붙입니다. 명단이 없으면 「3반 12번」으로만 보입니다. */
async function buildChoice() {
  const local = await store.get(store.KEY_CHOICE).catch(() => null);
  if (local?.students?.length) { S.choice = local; S.choice.meta.src = 'local'; return; }
  const srv = S.choiceSrv || (await store.get(store.KEY_CHOICE_SRV).catch(() => null))?.data;
  if (!srv?.parts?.length || !S.sel) { S.choice = null; return; }
  const merged = mergeChoice(srv.parts, S.sel);
  attachNames(merged);
  merged.meta.year = srv.meta?.year || merged.meta.year;
  merged.meta.src = 'server';
  S.choice = merged;
}

function attachNames(choice) {
  const grade = choice.meta.grades?.[0];
  const list = S.roster?.students || [];
  const rg = S.roster?.meta?.grade;
  for (const st of choice.students) {
    if (st.nm) continue;
    const hit = list.find(s => s.c % 100 === st.cls && s.no === st.no && (!rg || !grade || rg === grade));
    st.nm = hit ? hit.nm : '';
  }
}

async function loadChoiceSrv(serverVersion) {
  const cached = await store.get(store.KEY_CHOICE_SRV);
  const use = async d => {
    S.choiceSrv = d;
    await buildChoice();
    if (!$('app').classList.contains('hidden')) {
      $('m-sel').textContent = choiceLabel(S.choice);
      if (S.mode === 'sel') { fillSelStudents(); selPaint(); }
    }
  };
  if (cached?.data) { S.choiceVersion = cached.version; await use(cached.data); }
  if (serverVersion === undefined) return;
  if (cached?.data && serverVersion && cached.version === serverVersion) return;
  try {
    const res = await api.fetchChoice(S.key);
    if (!res.ok || !res.data?.parts) return;
    S.choiceVersion = res.version;
    await store.set(store.KEY_CHOICE_SRV, { data: res.data, version: res.version });
    await use(res.data);
  } catch { /* 캐시가 있으면 그대로 씁니다 */ }
}

async function loadSel(serverVersion) {
  const cached = await store.get(store.KEY_SEL);
  const use = async d => {
    S.sel = d;
    await buildChoice();
    if (!$('app').classList.contains('hidden')) {
      $('c-mode-sel').classList.remove('hidden');
      $('m-sel').textContent = choiceLabel(S.choice);
      if (S.mode === 'sel') { fillSelStudents(); selPaint(); }
    }
  };
  if (cached?.data) { S.selVersion = cached.version; await use(cached.data); }
  if (serverVersion === undefined) return;   /* 캐시만 붙이는 호출 */
  if (cached?.data && serverVersion && cached.version === serverVersion) return;
  try {
    const res = await api.fetchSel(S.key);
    if (!res.ok || !res.data?.fields) return;
    S.selVersion = res.version;
    await store.set(store.KEY_SEL, { data: res.data, version: res.version });
    await use(res.data);
  } catch { /* 캐시가 있으면 그대로 씁니다 */ }
}

/* 관리자가 5개년 자료를 새로 올렸으면 저장만 하지 않고 지금 화면에도 바로 바꿔 끼웁니다.
   정시·선택 자료는 즉시 바뀌는데 5개년만 다음 접속까지 옛것이면 두 자료가 어긋납니다. */
async function refresh() {
  try {
    const res = await api.fetchData(S.key);
    await store.set(store.KEY_DATA, { enc: res.data, version: res.version });
    S.history = decode(res.data);
    S.version = res.version;
    S.index = null; S.school = null;
    if (!$('app').classList.contains('hidden')) {
      S.index = buildIndex(S.history);
      showApp(S.mode);
      toast('5개년 자료가 새 버전으로 바뀌었습니다.');
    }
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
  catch (e) {
    /* 키가 틀린 경우만 링크를 지웁니다. 서버 응답이 잠시 손상된 것뿐이면 다음 접속에 다시 시도합니다. */
    if (e.auth) await store.del(store.KEY_LINK);
    screenBlocked(e.auth ? e.message : `자료를 받지 못했습니다 (${e.message}). 잠시 뒤 새로고침해 주세요.`);
    return;
  }

  S.roster = await store.get(store.KEY_ROSTER);
  S.mock = await store.get(store.KEY_MOCK);
  if (!S.roster?.students?.length) S.roster = null;
  if (!S.mock?.students?.length) S.mock = null;
  /* 프로그램이 새로워졌는데 명단은 예전 판으로 읽혀 남아 있으면 — 다시 올리라고 알립니다. */
  if (S.roster && S.roster.meta.pv !== ROSTER_PV) S.roster.meta.stale = true;
  if (S.roster || S.mock) showApp(S.roster ? 'susi' : 'jg');
  if (S.roster?.meta.stale) setTimeout(() => toast('프로그램이 새로워졌습니다 — 학생부성적표를 다시 올리면 새 표시(5등급 등)가 나옵니다.'), 800);
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

/* 탭을 손으로 누르면 탭 줄이 화면 맨 위로 오게 합니다.
   표가 길어서, 아래쪽 버튼을 누르고 나면 한참을 되올려야 했습니다. */
function toTop(el) {
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 12;
  window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
}

function selectTab(t) {
  document.querySelectorAll('#results .tab').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t === t)));
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
  let n = caseAt + d;
  while (n >= 0 && n < S.cases.length && !caseVisible(n)) n += d;
  if (n < 0 || n >= S.cases.length) return;
  caseAt = n;
  casePaint();
}
const caseHasNext = d => { let n = caseAt + d; while (n >= 0 && n < S.cases.length && !caseVisible(n)) n += d; return n >= 0 && n < S.cases.length; };

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
  $('md-prev').disabled = !caseHasNext(-1);
  $('md-next').disabled = !caseHasNext(1);
}

/* 결과 필터 — 유사 학생 탭. 선택은 세션 동안 유지되고, 학생을 바꿔 다시 그려도 그대로 적용됩니다. */
const CF = { mode: 'all', onlyOk: false };
function applyCaseFilter() {
  const p = $('p-stu');
  const bar = p.querySelector('.fbar');
  if (!bar) return;
  bar.querySelectorAll('.fc').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === CF.mode)));
  p.querySelectorAll('.stu[data-case]').forEach(c => {
    const w = c.dataset.win === '1';
    c.classList.toggle('hidden', !(CF.mode === 'all' || (CF.mode === 'ok') === w));
  });
  p.querySelector('.stugrid')?.classList.toggle('only-ok', CF.onlyOk);
  const sw = $('onlyok'); if (sw) sw.checked = CF.onlyOk;
}
/* 「크게 보기」 넘기기는 지금 보이는 카드 사이에서만 움직입니다. */
const caseVisible = i => (CF.mode === 'all' || (CF.mode === 'ok') === (S.cases[i].won.length > 0));

$('p-stu').addEventListener('click', e => {
  const fc = e.target.closest('.fc[data-f]');
  if (fc) {
    CF.mode = fc.dataset.f;
    if (CF.mode === 'ok') CF.onlyOk = true;      // 합격 있음을 누르면 합격 줄만 보기도 같이 켭니다
    if (CF.mode !== 'ok') CF.onlyOk = false;
    applyCaseFilter(); return;
  }
  if (e.target.id === 'onlyok') { CF.onlyOk = e.target.checked; applyCaseFilter(); return; }
  if (e.target.closest('.sw')) return;
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
$('f-jg').addEventListener('change', e => { if (e.target.files[0]) pickJG(e.target.files[0]); e.target.value = ''; });
$('f-sel').addEventListener('change', e => { if (e.target.files[0]) pickSel(e.target.files[0]); e.target.value = ''; });
$('f-choice').addEventListener('change', e => { if (e.target.files.length) loadChoice([...e.target.files]); e.target.value = ''; });
$('f-choice-adm').addEventListener('change', e => { if (e.target.files.length) pickChoiceAdm([...e.target.files]); e.target.value = ''; });
$('f-roster-adm').addEventListener('change', e => { if (e.target.files[0]) pickRosterAdm(e.target.files[0]); e.target.value = ''; });

/* 과목 선택 화면의 조작 */
$('selfbox').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]'); if (b) selPick(b.dataset.f);
});
$('selpicked').addEventListener('click', e => {
  const b = e.target.closest('button[data-x]'); if (b) selPick(b.dataset.x);
});
$('selq').addEventListener('input', () => {
  if (S.sel) $('selfbox').innerHTML = R.fieldList(S.sel, SEL.picked, ($('selq').value || '').trim());
});
bindChips('selgrade', b => {
  SEL.grade = +b.dataset.g; SEL.chosen.clear(); SEL.openG.clear();
  if (SEL.grade !== 2) SEL.stu = null;
  selPaint();
});
$('selcls').addEventListener('change', () => { SEL.stu = null; fillSelStudents(); runSel(); });
$('selstu').addEventListener('change', () => {
  const v = $('selstu').value;
  const [c, no] = v ? v.split('-').map(Number) : [];
  SEL.stu = v ? (S.choice?.students || []).find(x => x.cls === c && x.no === no) || null : null;
  runSel();
});
document.querySelectorAll('#seltabs .tab').forEach(t => t.addEventListener('click', () => {
  selTab(t.dataset.s); toTop($('seltabs'));
}));
$('s-pick').addEventListener('click', e => {
  const sub = e.target.closest('.sub[data-s]');
  if (sub) { const k = sub.dataset.s; SEL.chosen.has(k) ? SEL.chosen.delete(k) : SEL.chosen.add(k); return runSel(); }
  const more = e.target.closest('.more[data-m]');
  if (more) { const k = more.dataset.m; SEL.openG.has(k) ? SEL.openG.delete(k) : SEL.openG.add(k); return runSel(); }
  const tog = e.target.closest('.moretog[data-sum]');
  if (tog) { SEL.sumOpen = !SEL.sumOpen; return runSel(); }
  if (e.target.closest('#btn-univ')) { selTab('univ'); toTop($('seltabs')); }
});
$('s-univ').addEventListener('click', e => {
  const b = e.target.closest('.chip[data-uf]'); if (!b) return;
  $('s-univ').querySelectorAll('.chip[data-uf]').forEach(c => c.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true'); SEL.uFilter = b.dataset.uf; filterUnits();
});
$('s-univ').addEventListener('input', e => {
  if (e.target.id !== 'uq') return;
  SEL.uQ = e.target.value.trim().toLowerCase(); filterUnits();
});

/* 배치 탭 안의 판정 칩·검색 */
function filterPlacement() {
  const j = $('p-jg').querySelector('#plchips .chip[aria-pressed=true]')?.dataset.j || 'all';
  const q = ($('p-jg').querySelector('#plq')?.value || '').trim().toLowerCase();
  $('p-jg').querySelectorAll('tr.pl').forEach(tr => {
    tr.classList.toggle('hidden', (j !== 'all' && tr.dataset.j !== j) || (q && !tr.dataset.q.includes(q)));
  });
}
$('p-jg').addEventListener('click', e => {
  const j = e.target.closest('.chip[data-jf]');
  if (j) {
    $('p-jg').querySelectorAll('.chip[data-jf]').forEach(c => c.setAttribute('aria-pressed', 'false'));
    j.setAttribute('aria-pressed', 'true'); jgFilter = j.dataset.jf; return filterJG();
  }
  const b = e.target.closest('#plchips .chip'); if (!b || b.disabled) return;
  b.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true'); filterPlacement();
});
$('p-jg').addEventListener('input', e => {
  if (e.target.id === 'plq') filterPlacement();
  if (e.target.id === 'jgq') { jgQ = e.target.value.trim().toLowerCase(); filterJG(); }
});

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

/* 9등급 칸을 손으로 바꾸면 5등급 칸이 추정치로 따라갑니다.
   5등급은 과목 조합에 따라 같은 9등급에서도 달라지므로 정확한 환산은 없고, 올린 명단으로 맞춘 직선(5 ≈ a + b×9)을 씁니다.
   학생부 실제 값과 구분되게 「≈」를 붙이고 옅게 보여 줍니다. */
function fit5() {
  const m = S.roster?.meta; if (!m?.has5) return null;
  if (m.fit5) return m.fit5;
  const pts = S.roster.students.filter(x => x.a5 != null && x.g?.[3] != null).map(x => [x.g[3], x.a5]);
  if (pts.length < 10) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (!sxx) return null;
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return (m.fit5 = { a: my - b * mx, b });
}
function updateGpa5() {
  const el = $('gpa5'), box = $('gpa5c'); if (!el || !box) return;
  const v = numOf('gpa'), f = fit5();
  if (S.cur?.a5 != null && v != null && Math.abs(v - S.cur.g[3]) < 0.005) {
    el.textContent = S.cur.a5.toFixed(2); box.classList.remove('est'); box.title = ''; return;      // 학생부 실제 값
  }
  if (!f || v == null) { if (S.cur?.a5 == null) box.classList.add('hidden'); return; }
  const est = Math.min(5, Math.max(1, f.a + f.b * v));
  el.textContent = `≈${est.toFixed(2)}`; box.classList.remove('hidden'); box.classList.add('est');
  box.title = '추정치 — 9등급을 손으로 바꿔서, 우리 학교 명단으로 맞춘 식(5등급 ≈ ' + f.a.toFixed(2) + ' + ' + f.b.toFixed(2) + '×9등급)으로 계산한 값입니다';
}
$('gpa').addEventListener('input', updateGpa5);

bindChips('gychips', b => { selGy = +b.dataset.gy; run(); });
bindChips('modechips', b => setMode(b.dataset.mode));

document.querySelectorAll('#results .tab').forEach(t => t.addEventListener('click', () => {
  selectTab(t.dataset.t); toTop(t.closest('.tabs'));
}));

$('btn-roster').addEventListener('click', () => {
  /* 성적표는 표지에서 올립니다 — 수시·정시와 정시만 모두 같은 자리로 보냅니다. */
  if (S.mode === 'sel') $('f-choice').click();
  else screenUpload();
});
$('btn-wipe').addEventListener('click', async () => {
  if (!confirm('이 컴퓨터에 저장된 명단과 자료를 지웁니다.\n다음 접속 때 링크로 다시 받아옵니다.\n계속할까요?')) return;
  await store.clearAll();
  location.replace(location.pathname);
});

boot();
