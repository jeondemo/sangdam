import { GAS_URL, SCHOOL, ROSTER_STEPS } from '../config.js';
import * as store from './store.js';
import * as api from './api.js';
import { encode, decode } from './codec.js';
import { parseHistory, parseRoster } from './parse.js';
import { buildIndex, findSimilar, summarize, aggregateUniv, aggregateTrack, aggregateJeongsi, csatAvg } from './match.js';
import * as R from './render.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const S = { key: null, admin: null, history: null, index: null, roster: null, cur: null, version: null };

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
  const el0 = $('cv-feats');
  if (!S.history) { if (el0) el0.innerHTML = ''; return; }
  const m = S.history.meta;
  const yr = m?.years?.length ? `${m.years[0]}~${m.years[m.years.length - 1]}학년도` : '자료 없음';
  const rows = [
    ['5개년', yr],
    [`${(m?.nApps || 0).toLocaleString()}건`, '수시·정시 지원'],
    ['유사 사례', '내신·수능 기준'],
    ['카드 배분', '전형별 실적'],
    ['수능최저', '충족 여부'],
  ];
  const el = $('cv-feats');
  if (el) el.innerHTML = rows.map(([a, b]) => `<div class="cv-feat"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('');
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
  cover(`<div class="cv-main">${LEFT()}
    <div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">1</span><h2>5개년 지원결과</h2>
          <span class="p-tag">불러옴</span></div>
        <div class="p-hint">${esc(S.history.meta.years[0])}~${esc(S.history.meta.years[S.history.meta.years.length - 1])}학년도 ·
          지원 ${S.history.meta.nApps.toLocaleString()}건 · 학생 ${S.history.meta.nPersons.toLocaleString()}명<br>
          이 자료는 자동으로 들어옵니다. 따로 올리실 것 없습니다.</div>
      </div>
      <div class="cv-panel">
        <div class="p-head"><span class="p-num">2</span><h2>학생 명단 올리기</h2></div>
        <div class="p-hint">3학년 학생부성적표를 올리면 학급·이름으로 학생을 골라 상담할 수 있습니다.</div>
        ${HOWTO}
        <div class="dropzone" id="dz">
          <strong>파일을 끌어다 놓거나 클릭해서 선택</strong>
          <div class="dz-hint">○○○○년 학생부성적표 … 3학년.xlsx</div>
          <div class="dz-tags"><span class="dz-tag">학급·번호·이름</span>
            <span class="dz-tag">학년별 내신</span><span class="dz-tag">과목별 등급</span></div>
        </div>
        <label class="opt"><input type="checkbox" id="keep" checked>
          <span><span class="t">이 컴퓨터에 명단 저장</span>
          <span class="d">다음부터 이 화면 없이 바로 상담 화면으로 들어갑니다.<br>
          공용 PC에서는 체크를 해제하세요.</span></span></label>
        ${err ? `<div class="cv-err">${esc(err)}</div>` : ''}
        <div class="cv-safe">${SHIELD} 명단은 이 브라우저 안에서만 열립니다</div>
      </div>
    </div>
  </div>`, [['d-gold', `${new Date().getFullYear() + 1}학년도`], ['d-green', '명단은 서버로 전송되지 않습니다']]);

  const dz = $('dz');
  dz.addEventListener('click', () => $('f-roster').click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('over');
    if (e.dataTransfer.files[0]) loadRoster(e.dataTransfer.files[0]);
  });
}

/* ── 명단 ──────────────────────────────────────────── */

async function loadRoster(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const data = parseRoster(wb, XLSX);
    if (!data.students.length) throw new Error('학생을 찾지 못했습니다. 학생부성적표 파일이 맞는지 확인해 주세요.');
    S.roster = data;
    if ($('keep')?.checked) await store.set(store.KEY_ROSTER, data);
    else await store.clearRoster();
    showApp();
  } catch (e) {
    screenUpload('읽지 못했습니다 — ' + e.message);
  }
}

/* ── 상담 화면 ─────────────────────────────────────── */

function showApp() {
  $('cover').classList.add('hidden');
  $('app').classList.remove('hidden');
  S.index = buildIndex(S.history);

  const m = S.history.meta;
  $('sb-scope').innerHTML =
    `<div class="row"><span>5개년 자료</span><b>지원 ${m.nApps.toLocaleString()}건</b></div>` +
    (S.roster ? `<div class="row"><span>재학생 명단</span><b class="off">${S.roster.meta.n}명</b></div>` : '');

  $('btn-roster').textContent = S.roster ? '명단 다시 올리기' : '학생 명단 올리기';
  fillClasses();
  fillStudents();
  if (numOf('gpa') != null) run();
}

function fillClasses() {
  const list = S.roster?.students || [];
  const cs = [...new Set(list.map(s => s.c))].sort((a, b) => a - b);
  $('cls').innerHTML = '<option value="">전체 학급</option>' + cs.map(c => `<option value="${c}">${c}반</option>`).join('');
}

function fillStudents() {
  const list = S.roster?.students || [];
  const c = $('cls').value, q = ($('q').value || '').trim();
  const f = list.filter(s => (!c || String(s.c) === c) && (!q || s.nm.includes(q)));
  $('stu').innerHTML = '<option value="">직접 입력</option>' + f.map(s =>
    `<option value="${s.c}-${s.no}">${esc(s.c + '-' + String(s.no).padStart(2, '0') + ' ' + s.nm + ' · ' + s.g[3].toFixed(2))}</option>`).join('');
  if (S.cur && f.some(s => s.c === S.cur.c && s.no === S.cur.no)) $('stu').value = `${S.cur.c}-${S.cur.no}`;
}

function onStudentChange() {
  const v = $('stu').value;
  if (!v) { S.cur = null; $('stucard').classList.add('hidden'); $('gpanote').textContent = ''; return; }
  const [c, no] = v.split('-').map(Number);
  S.cur = (S.roster?.students || []).find(s => s.c === c && s.no === no) || null;
  if (!S.cur) return;
  $('stucard').innerHTML = R.studentCard(S.cur, S.roster.meta.n);
  $('stucard').classList.remove('hidden');
  $('gpa').value = S.cur.g[3].toFixed(2);
  $('gpanote').textContent = '';
  run();
}

const numOf = id => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
let selGy = -1, includeVoc = false;

function run() {
  if (!S.index) return;
  const gpa = numOf('gpa');
  if (gpa == null) { $('results').classList.add('hidden'); $('placeholder').classList.remove('hidden'); return; }

  const my = { k: numOf('c_k'), m: numOf('c_m'), e: numOf('c_e'), s1: numOf('c_s1'), s2: numOf('c_s2') };
  const myAvg = csatAvg(my);
  const years = S.history.meta.years;
  const { sel, rows } = findSimilar(S.index, {
    gpa, myCsatAvg: myAvg, topN: +$('topn').value,
    minYear: years[years.length - 1] + 1 - (+$('yrs').value),
    gy: selGy, includeVocational: includeVoc,
  });
  if (!sel.length) {
    $('results').classList.add('hidden');
    $('placeholder').classList.remove('hidden');
    $('placeholder').innerHTML = '조건에 맞는 졸업생이 없습니다. 연도 범위나 계열 조건을 넓혀 보세요.';
    return;
  }

  const sum = summarize(sel, rows);
  const [lo, hi] = sum.gpaRange;
  $('rtitle').textContent = S.cur ? `${S.cur.nm} · 유사 사례` : '유사 사례';
  $('rnote').textContent = `내신 ${lo.toFixed(2)}~${hi.toFixed(2)} 구간 졸업생 ${sel.length}명 기준`;
  $('stats').innerHTML = R.statBar(sel, sum);
  $('headline').innerHTML = R.headline(sum, sel, gpa, myAvg, S.cur?.nm);
  $('p-stu').innerHTML = R.similarStudents(sel, rows);
  const uni = aggregateUniv(sum.su);
  $('p-univ').innerHTML = R.univTable(uni);
  $('p-track').innerHTML = R.trackTable(aggregateTrack(sum.su), sum);
  $('p-jg').innerHTML = R.jeongsiTable(aggregateJeongsi(sum.jg), sum);
  R.enableSort($('results'));
  $('c-stu').textContent = sel.length;
  $('c-univ').textContent = uni.length;
  $('c-jg').textContent = sum.jg.length;
  $('placeholder').classList.add('hidden');
  $('results').classList.remove('hidden');
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
      ${msg ? `<div class="cv-panel"><div class="p-hint" style="color:#e5ebfa">${msg}</div></div>` : ''}
    </div>
  </div>`, [['d-gold', '관리자']]);

  $('a-pick').addEventListener('click', () => $('f-history').click());
  $('a-send').addEventListener('click', sendHistory);
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
    const res = await api.uploadData(S.admin, pending, (i, n) => {
      $('a-parsed').textContent = `보내는 중 ${i}/${n}`;
    });
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
    }).catch(() => {});
    return true;
  }
  screenLoading('5개년 지원결과를 불러오는 중', 55);
  const res = await api.fetchData(S.key);
  S.history = decode(res.data);
  S.version = res.version;
  await store.set(store.KEY_DATA, { enc: res.data, version: res.version });
  return true;
}

async function refresh() {
  try {
    const res = await api.fetchData(S.key);
    await store.set(store.KEY_DATA, { enc: res.data, version: res.version });
  } catch (e) { /* 조용히 넘어갑니다. 다음 접속 때 다시 시도합니다. */ }
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

  if (!GAS_URL.includes('/exec')) {
    screenBlocked('config.js 에 Apps Script 주소가 아직 설정되지 않았습니다.');
    return;
  }

  try {
    await loadHistory();
  } catch (e) {
    await store.del(store.KEY_LINK);
    screenBlocked(e.message);
    return;
  }

  S.roster = await store.get(store.KEY_ROSTER);
  if (S.roster?.students?.length) showApp();
  else screenUpload();
}

/* ── 이벤트 ────────────────────────────────────────── */

function bindChips(id, cb) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    [...e.currentTarget.children].forEach(c => c.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true'); cb(b); run();
  });
}

$('f-roster').addEventListener('change', e => { if (e.target.files[0]) loadRoster(e.target.files[0]); e.target.value = ''; });
$('f-history').addEventListener('change', e => { if (e.target.files[0]) pickHistory(e.target.files[0]); e.target.value = ''; });

$('cls').addEventListener('change', fillStudents);
$('q').addEventListener('input', fillStudents);
$('stu').addEventListener('change', onStudentChange);
$('gpa').addEventListener('input', () => {
  $('gpanote').textContent = (S.cur && Math.abs((parseFloat($('gpa').value) || 0) - S.cur.g[3]) > 0.004)
    ? `· ${S.cur.nm} 실제 ${S.cur.g[3].toFixed(2)}` : '';
});

let timer = null;
['gpa', 'c_k', 'c_m', 'c_e', 'c_s1', 'c_s2', 'topn', 'yrs'].forEach(id =>
  $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); }));

bindChips('gychips', b => { selGy = +b.dataset.gy; });
bindChips('catchips', b => { includeVoc = b.dataset.cat === '-1'; });

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', 'false'));
  t.setAttribute('aria-selected', 'true');
  ['stu', 'univ', 'track', 'jg'].forEach(k => $('p-' + k).classList.toggle('hidden', k !== t.dataset.t));
}));

$('btn-roster').addEventListener('click', () => screenUpload());
$('btn-wipe').addEventListener('click', async () => {
  if (!confirm('이 컴퓨터에 저장된 명단과 자료를 지웁니다.\n다음 접속 때 링크로 다시 받아옵니다.\n계속할까요?')) return;
  await store.clearAll();
  location.replace(location.pathname);
});

boot();
