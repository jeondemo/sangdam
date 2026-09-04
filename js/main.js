import * as store from './store.js';
import { parseHistory, parseRoster, gradeWeights } from './parse.js';
import { buildIndex, findSimilar, summarize, aggregateUniv, aggregateTrack, aggregateJeongsi, baseline, csatAvg } from './match.js';
import * as R from './render.js';

const $ = id => document.getElementById(id);
const state = { history: null, roster: null, index: null, base: null, cur: null, weights: null };

/* ── 파일 불러오기 ───────────────────────────────────── */

async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: 'array', cellDates: false });
}

async function handleFile(file, kind) {
  const status = $('setup-status');
  status.textContent = `${file.name} 읽는 중…`;
  status.className = 'setup-status';
  try {
    const wb = await readWorkbook(file);
    if (kind === 'history') {
      const data = parseHistory(wb, XLSX);
      if (!data.apps.length) throw new Error('지원 기록을 찾지 못했습니다. 수시/정시 시트가 있는 파일인지 확인해 주세요.');
      await store.set(store.KEY_HISTORY, data);
      state.history = data;
    } else {
      const data = parseRoster(wb, XLSX);
      if (!data.students.length) throw new Error('학생 명단을 찾지 못했습니다. 학생부성적표 파일인지 확인해 주세요.');
      await store.set(store.KEY_ROSTER, data);
      state.roster = data;
    }
    status.textContent = '';
    boot();
  } catch (e) {
    status.textContent = '읽지 못했습니다 — ' + e.message;
    status.className = 'setup-status err';
  }
}

/* ── 데이터 상태 ─────────────────────────────────────── */

function renderDataStatus() {
  const h = state.history, r = state.roster;
  $('ds-history').innerHTML = h
    ? `<b class="ok">불러옴</b> · ${h.meta.years[0]}~${h.meta.years[h.meta.years.length - 1]}학년도 · 학생 ${h.meta.nPersons.toLocaleString()}명 · 지원 ${h.meta.nApps.toLocaleString()}건`
    : '<b class="warn">없음</b> · 필수';
  $('ds-roster').innerHTML = r
    ? `<b class="ok">불러옴</b> · ${r.meta.n}명`
    : '<b class="mut">없음</b> · 없어도 직접 입력으로 사용 가능';
  $('hd-status').textContent = h
    ? `${h.meta.years[0]}~${h.meta.years[h.meta.years.length - 1]}학년도 · 지원 ${h.meta.nApps.toLocaleString()}건${r ? ` · 재학생 ${r.meta.n}명` : ''}`
    : '데이터 없음';
}

/* ── 학생 선택 ───────────────────────────────────────── */

function fillClasses() {
  const list = state.roster?.students || [];
  const classes = [...new Set(list.map(s => s.c))].sort((a, b) => a - b);
  $('cls').innerHTML = '<option value="">전체 학급</option>'
    + classes.map(c => `<option value="${c}">${c}반</option>`).join('');
}

function fillStudents() {
  const list = state.roster?.students || [];
  const c = $('cls').value, q = ($('q').value || '').trim();
  const f = list.filter(s => (!c || String(s.c) === c) && (!q || s.nm.includes(q)));
  $('stu').innerHTML = '<option value="">직접 입력</option>'
    + f.map(s => `<option value="${s.c}-${s.no}">${s.c}-${String(s.no).padStart(2, '0')} ${s.nm} · ${s.g[3].toFixed(2)}</option>`).join('');
  if (state.cur && f.some(s => s.c === state.cur.c && s.no === state.cur.no)) {
    $('stu').value = `${state.cur.c}-${state.cur.no}`;
  }
}

function onStudentChange() {
  const v = $('stu').value;
  if (!v) {
    state.cur = null;
    $('stucard').classList.add('hidden');
    $('gpanote').textContent = '';
    return;
  }
  const [c, no] = v.split('-').map(Number);
  state.cur = (state.roster?.students || []).find(s => s.c === c && s.no === no) || null;
  if (!state.cur) return;
  $('stucard').innerHTML = R.studentCard(state.cur, state.roster.meta.n);
  $('stucard').classList.remove('hidden');
  $('gpa').value = state.cur.g[3].toFixed(2);
  $('gpanote').textContent = '';
  run();
}

/* ── 분석 ────────────────────────────────────────────── */

const numOf = id => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };

let selGy = -1, includeVoc = false;

function run() {
  if (!state.index) return;
  const gpa = numOf('gpa');
  if (gpa == null) {
    $('results').classList.add('hidden');
    $('placeholder').classList.remove('hidden');
    return;
  }
  const my = { k: numOf('c_k'), m: numOf('c_m'), e: numOf('c_e'), s1: numOf('c_s1'), s2: numOf('c_s2') };
  const myAvg = csatAvg(my);
  const opts = {
    gpa, myCsatAvg: myAvg,
    topN: +$('topn').value,
    minYear: (state.history.meta.years[state.history.meta.years.length - 1] + 1) - (+$('yrs').value),
    gy: selGy,
    includeVocational: includeVoc,
  };
  const { sel, rows } = findSimilar(state.index, opts);
  if (!sel.length) {
    $('results').classList.add('hidden');
    $('placeholder').classList.remove('hidden');
    $('placeholder').innerHTML = '조건에 맞는 과거 학생이 없습니다. 연도 범위나 계열 조건을 넓혀 보세요.';
    return;
  }
  const sum = summarize(sel, rows);

  $('stats').innerHTML = R.statBar(sel, sum);
  $('headline').innerHTML = R.headline(sum, sel, gpa, myAvg, state.cur?.nm);
  $('p-stu').innerHTML = R.similarStudents(sel, rows);
  $('p-univ').innerHTML = R.univTable(aggregateUniv(sum.su));
  $('p-track').innerHTML = R.trackTable(aggregateTrack(sum.su), sum);
  $('p-jg').innerHTML = R.jeongsiTable(aggregateJeongsi(sum.jg), sum);
  R.enableSort($('results'));

  $('c-stu').textContent = sel.length;
  $('c-univ').textContent = aggregateUniv(sum.su).length;
  $('c-jg').textContent = sum.jg.length;

  $('placeholder').classList.add('hidden');
  $('results').classList.remove('hidden');
}

/* ── 부팅 ────────────────────────────────────────────── */

function boot() {
  renderDataStatus();
  $('btn-close-setup').classList.toggle('hidden', !state.history);
  if (!state.history) {
    $('setup').classList.remove('hidden');
    $('app').classList.add('hidden');
    return;
  }
  state.index = buildIndex(state.history);
  state.base = baseline(state.history);
  $('baseline').innerHTML = R.baselinePanel(state.base);

  if (state.roster) {
    state.weights = gradeWeights(state.roster.students);
    $('picker').classList.remove('hidden');
    fillClasses();
    fillStudents();
  } else {
    $('picker').classList.add('hidden');
  }

  $('setup').classList.add('hidden');
  $('app').classList.remove('hidden');
  if (numOf('gpa') != null) run();
}

/* ── 이벤트 ──────────────────────────────────────────── */

function bindChips(id, cb) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    [...e.currentTarget.children].forEach(c => c.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    cb(b);
    run();
  });
}

function init() {
  $('f-history').addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0], 'history'); e.target.value = ''; });
  $('f-roster').addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0], 'roster'); e.target.value = ''; });

  $('btn-data').addEventListener('click', () => {
    $('setup').classList.remove('hidden');
    $('app').classList.add('hidden');
    $('btn-close-setup').classList.toggle('hidden', !state.history);
  });
  $('btn-close-setup').addEventListener('click', () => {
    if (!state.history) return;
    $('setup').classList.add('hidden');
    $('app').classList.remove('hidden');
  });

  $('btn-clear').addEventListener('click', async () => {
    if (!confirm('이 브라우저에 저장된 데이터를 모두 지웁니다. 계속할까요?')) return;
    await store.clearAll();
    state.history = null; state.roster = null; state.index = null; state.cur = null;
    boot();
  });

  $('cls').addEventListener('change', fillStudents);
  $('q').addEventListener('input', fillStudents);
  $('stu').addEventListener('change', onStudentChange);

  $('gpa').addEventListener('input', () => {
    const cur = state.cur;
    $('gpanote').textContent = (cur && Math.abs((parseFloat($('gpa').value) || 0) - cur.g[3]) > 0.004)
      ? `· ${cur.nm} 실제 ${cur.g[3].toFixed(2)}` : '';
  });

  let timer = null;
  ['gpa', 'c_k', 'c_m', 'c_e', 'c_s1', 'c_s2', 'topn', 'yrs'].forEach(id =>
    $(id).addEventListener('input', () => {
      if (!$('autorun').checked) return;
      clearTimeout(timer);
      timer = setTimeout(run, 350);
    }));
  $('go').addEventListener('click', () => run());

  bindChips('gychips', b => { selGy = +b.dataset.gy; });
  bindChips('catchips', b => { includeVoc = b.dataset.cat === '-1'; });

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', 'false'));
    t.setAttribute('aria-selected', 'true');
    ['stu', 'univ', 'track', 'jg'].forEach(k =>
      $('p-' + k).classList.toggle('hidden', k !== t.dataset.t));
  }));

  store.loadAll().then(({ history, roster }) => {
    state.history = history;
    state.roster = roster;
    boot();
  });
}

init();
