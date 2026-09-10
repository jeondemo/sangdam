/**
 * 과천여자고등학교 진학상담 프로그램 — 데이터 서버
 *
 * 이 스크립트가 붙어 있는 스프레드시트에 지원결과(학년도별 수시·정시)를 보관하고,
 * 올바른 열쇠를 가진 요청에만 내어 줍니다.
 *
 * 처음 한 번 [설치] 함수를 실행하면 필요한 시트와 열쇠가 자동으로 만들어집니다.
 */

var SHEET_설정 = '설정';
var SHEET_데이터 = '데이터';
var SHEET_임시 = '임시';
var SHEET_배치 = '배치';     // 정시 배치기준표 (대학 공개 입시결과)
var SHEET_정시 = '정시';     // 정시 지원가능 자료 (대학 공개 정시 결과 + 반영 방식)
var SHEET_선택 = '선택';     // 선택과목 자료 (대학 공개 권장과목 + 우리 학교 편제)
var SHEET_결과 = '선택결과'; // 학년별 선택 결과 (학급·번호·과목만 — 이름은 브라우저에서 지우고 보냅니다)
var 조각크기 = 40000;   // 셀 하나에 5만 자까지 들어갑니다. 여유를 둡니다.

/* ────────────────────────────────────────────────
   처음 한 번만 실행하세요.
   실행이 끝나면 「설정」 시트에 열쇠가 적힙니다.
   ──────────────────────────────────────────────── */
function 설치() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var 설정 = ss.getSheetByName(SHEET_설정) || ss.insertSheet(SHEET_설정);

  if (설정.getLastRow() === 0) {
    설정.getRange(1, 1, 6, 2).setValues([
      ['항목', '값'],
      ['교사용키', 열쇠만들기()],
      ['관리자키', 열쇠만들기()],
      ['최종갱신', ''],
      ['자료요약', ''],
      ['버전', '0'],
    ]);
    설정.setColumnWidth(1, 120);
    설정.setColumnWidth(2, 420);
    설정.getRange(2, 2, 5, 1).setNumberFormat('@');   // 값 칸은 글자로 고정
    설정.getRange(1, 1, 1, 2).setFontWeight('bold');
    설정.getRange(2, 1, 2, 1).setFontWeight('bold');
    설정.getRange(2, 2, 2, 1).setFontFamily('Roboto Mono');
  }

  if (!ss.getSheetByName(SHEET_데이터)) ss.insertSheet(SHEET_데이터).hideSheet();
  if (!ss.getSheetByName(SHEET_임시)) ss.insertSheet(SHEET_임시).hideSheet();
  if (!ss.getSheetByName(SHEET_배치)) ss.insertSheet(SHEET_배치).hideSheet();
  if (!ss.getSheetByName(SHEET_정시)) ss.insertSheet(SHEET_정시).hideSheet();
  if (!ss.getSheetByName(SHEET_선택)) ss.insertSheet(SHEET_선택).hideSheet();
  if (!ss.getSheetByName(SHEET_결과)) ss.insertSheet(SHEET_결과).hideSheet();
  if (!값읽기('배치버전')) { 값쓰기('배치버전', '0'); 값쓰기('배치요약', ''); }
  if (!값읽기('정시버전')) { 값쓰기('정시버전', '0'); 값쓰기('정시요약', ''); }
  if (!값읽기('선택버전')) { 값쓰기('선택버전', '0'); 값쓰기('선택요약', ''); }
  if (!값읽기('결과버전')) { 값쓰기('결과버전', '0'); 값쓰기('결과요약', ''); }

  var 결과 = '설치 완료\n교사용키 : ' + 값읽기('교사용키') + '\n관리자키 : ' + 값읽기('관리자키');
  Logger.log(결과);
  console.log(결과);
  return 결과;   // 편집기 실행 로그에 표시됩니다
}

/* 스프레드시트를 열면 메뉴가 생깁니다. 거기서 실행해도 됩니다. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('진학상담')
    .addItem('설치 / 열쇠 확인', '설치')
    .addToUi();
}

function 열쇠만들기() {
  var 글자 = 'abcdefghijkmnpqrstuvwxyz23456789';
  var s = '';
  for (var i = 0; i < 20; i++) s += 글자.charAt(Math.floor(Math.random() * 글자.length));
  return s;
}

/* ────────────────────────────────────────────────
   설정 읽고 쓰기
   ──────────────────────────────────────────────── */
function 설정시트() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_설정);
}

function 값읽기(항목) {
  var sh = 설정시트();
  if (!sh) return '';
  var v = sh.getDataRange().getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() === 항목) return String(v[i][1]).trim();
  }
  return '';
}

function 값쓰기(항목, 값) {
  var sh = 설정시트();
  var v = sh.getDataRange().getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() === 항목) {
      // 글자로 고정합니다. 그렇지 않으면 시트가 날짜·숫자로 바꿔 버립니다.
      sh.getRange(i + 1, 2).setNumberFormat('@').setValue(값);
      return;
    }
  }
  sh.appendRow([항목, 값]);
  sh.getRange(sh.getLastRow(), 2).setNumberFormat('@');
}

function 응답(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function 원문응답(text) {
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ────────────────────────────────────────────────
   교사용 — 자료 내려주기
   ──────────────────────────────────────────────── */
function doGet(e) {
  try {
    var k = (e && e.parameter && e.parameter.k) || '';
    var 교사용키 = 값읽기('교사용키');

    if (!교사용키) return 응답({ ok: false, error: '서버 설정이 끝나지 않았습니다. 관리자에게 문의하세요.' });
    if (k !== 교사용키) return 응답({ ok: false, error: '접근 권한이 없습니다.' });

    var 버전 = 값읽기('버전');

    if (e.parameter.mode === 'version') {
      return 응답({ ok: true, version: 버전, 요약: 값읽기('자료요약'), 갱신: 값읽기('최종갱신'), cutVersion: 값읽기('배치버전'), selVersion: 값읽기('선택버전'), jgVersion: 값읽기('정시버전'), choiceVersion: 값읽기('결과버전') });
    }

    if (e.parameter.mode === 'cut') {
      var cut = 시트읽기(SHEET_배치);
      if (!cut) return 응답({ ok: false, error: '배치기준표가 아직 없습니다.' });
      return 원문응답('{"ok":true,"version":' + JSON.stringify(값읽기('배치버전')) + ',"data":' + cut + '}');
    }

    if (e.parameter.mode === 'jg') {
      var jg = 시트읽기(SHEET_정시);
      if (!jg) return 응답({ ok: false, error: '정시 자료가 아직 없습니다.' });
      return 원문응답('{"ok":true,"version":' + JSON.stringify(값읽기('정시버전')) + ',"data":' + jg + '}');
    }

    if (e.parameter.mode === 'choice') {
      var ch = 시트읽기(SHEET_결과);
      if (!ch) return 응답({ ok: false, error: '선택 결과가 아직 없습니다.' });
      return 원문응답('{"ok":true,"version":' + JSON.stringify(값읽기('결과버전')) + ',"data":' + ch + '}');
    }

    if (e.parameter.mode === 'sel') {
      var sel = 시트읽기(SHEET_선택);
      if (!sel) return 응답({ ok: false, error: '선택과목 자료가 아직 없습니다.' });
      return 원문응답('{"ok":true,"version":' + JSON.stringify(값읽기('선택버전')) + ',"data":' + sel + '}');
    }

    var text = 데이터읽기();
    if (!text) return 응답({ ok: false, error: '아직 등록된 자료가 없습니다. 관리자 화면에서 먼저 올려 주세요.' });

    return 원문응답('{"ok":true,"version":' + JSON.stringify(버전) + ',"data":' + text + '}');
  } catch (err) {
    return 응답({ ok: false, error: String(err) });
  }
}

function 데이터읽기() { return 시트읽기(SHEET_데이터); }

/* 조각이 「=」로 시작하면 시트가 수식으로 해석해 깨집니다. 저장할 때 앞에 「#」을 붙이고 읽을 때 뗍니다.
   예전에 저장된(「#」 없는) 조각도 그대로 읽힙니다 — JSON 은 「#」으로 시작하지 않으니 구분됩니다. */
function 조각담기(text) { return '#' + text; }
function 조각풀기(v) {
  var t = (v === null || v === undefined) ? '' : String(v);
  return t.charAt(0) === '#' ? t.slice(1) : t;
}

function 시트읽기(이름) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(이름);
  if (!sh || sh.getLastRow() === 0) return '';
  var rows = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(조각풀기(rows[i][0]));
  return out.join('');
}

/* ────────────────────────────────────────────────
   관리자 — 새 자료 올리기
   ──────────────────────────────────────────────── */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    var 관리자키 = 값읽기('관리자키');

    if (!관리자키 || body.admin !== 관리자키) {
      return 응답({ ok: false, error: '관리자 권한이 없습니다.' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var 임시 = ss.getSheetByName(SHEET_임시);

    if (body.action === 'status') {
      return 응답({
        ok: true, 버전: 값읽기('버전'), 요약: 값읽기('자료요약'), 갱신: 값읽기('최종갱신'),
        배치요약: 값읽기('배치요약'), 배치갱신: 값읽기('배치갱신'),
        선택요약: 값읽기('선택요약'), 선택갱신: 값읽기('선택갱신'),
        결과요약: 값읽기('결과요약'), 결과갱신: 값읽기('결과갱신'),
        정시요약: 값읽기('정시요약'), 정시갱신: 값읽기('정시갱신'), 정시SHA: 값읽기('정시SHA'),
      });
    }

    lock.waitLock(30000);

    if (body.action === 'begin') {
      임시.clear();
      return 응답({ ok: true });
    }

    if (body.action === 'chunk') {
      임시.getRange(body.seq + 1, 1).setValue(조각담기(body.data));
      return 응답({ ok: true, seq: body.seq });
    }

    if (body.action === 'commit') {
      var n = 임시.getLastRow();
      if (n === 0) return 응답({ ok: false, error: '받은 자료가 없습니다.' });

      var rows = 임시.getRange(1, 1, n, 1).getValues();
      var parts = [];
      for (var i = 0; i < rows.length; i++) parts.push(조각풀기(rows[i][0]));
      var text = parts.join('');

      // 온전한 자료인지 확인한 뒤에만 교체합니다.
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (err) { return 응답({ ok: false, error: '자료가 온전하지 않습니다. 다시 올려 주세요.' }); }

      var 대상이름 = body.kind === 'cut' ? SHEET_배치
        : (body.kind === 'sel' ? SHEET_선택 : (body.kind === 'jg' ? SHEET_정시
          : (body.kind === 'choice' ? SHEET_결과 : SHEET_데이터)));

      /* 요약은 시트를 지우기 전에 다 만들어 둡니다 — 여기서 실패하면 옛 자료가 그대로 남습니다. */
      var m = body.meta || (parsed && parsed.meta) || {};
      var 요약, 접두;
      if (body.kind === 'cut') {
        접두 = '배치';
        요약 = (m.nUniv || 0) + '개 대학 · ' + (m.n || (parsed.rows || []).length) + '개 모집단위'
          + (m.years && m.years.length ? ' · ' + m.years[m.years.length - 1] + '학년도' : '');
      } else if (body.kind === 'jg') {
        접두 = '정시';
        요약 = (m.nUniv || 0) + '개 대학 · ' + (m.n || 0) + '개 모집단위' + (m.year ? ' · ' + m.year + '학년도' : '');
      } else if (body.kind === 'choice') {
        접두 = '결과';
        요약 = (m.year ? m.year + '학년도 · ' : '') + (m.n || 0) + '명 · '
          + (m.sems || []).map(function (k) { return String(k).replace(/^(\d)-(\d)$/, '$1학년 $2학기'); }).join(' / ');
      } else if (body.kind === 'sel') {
        접두 = '선택';
        요약 = (m.nField || (parsed.order || []).length) + '개 학문분야 · 권장과목 '
          + (m.nRec || 0) + '건 · 우리 학교 ' + (m.nSub || 0) + '과목';
      } else {
        접두 = '';
        요약 = (m.years ? m.years[0] + '~' + m.years[m.years.length - 1] + '학년도 · ' : '')
          + '지원 ' + (m.nApps || (parsed.apps || []).length) + '건 · 학생 ' + (m.nPersons || (parsed.persons || []).length) + '명';
      }

      var 데이터 = ss.getSheetByName(대상이름) || ss.insertSheet(대상이름).hideSheet();
      데이터.clear();
      var 조각 = [];
      for (var p = 0; p < text.length; p += 조각크기) 조각.push([조각담기(text.slice(p, p + 조각크기))]);
      데이터.getRange(1, 1, 조각.length, 1).setValues(조각);
      임시.clear();

      /* 자료를 다 쓴 직후에 버전을 올립니다. 그래야 교사 화면이 새 자료와 새 버전을 같이 받습니다. */
      var 지금 = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
      if (접두) {
        값쓰기(접두 + '버전', String(Date.now()));
        값쓰기(접두 + '갱신', 지금);
        값쓰기(접두 + '요약', 요약);
        if (body.kind === 'jg') 값쓰기('정시SHA', String(body.sha || ''));   // 같은 파일을 두 번 받지 않으려고 남깁니다
      } else {
        값쓰기('버전', String(Date.now()));
        값쓰기('최종갱신', 지금);
        값쓰기('자료요약', 요약);
      }
      return 응답({ ok: true, 요약: 요약 });
    }

    return 응답({ ok: false, error: '알 수 없는 요청입니다.' });
  } catch (err) {
    return 응답({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
