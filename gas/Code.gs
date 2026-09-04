/**
 * 과천여자고등학교 진학상담 프로그램 — 데이터 서버
 *
 * 이 스크립트가 붙어 있는 스프레드시트에 5개년 지원결과를 보관하고,
 * 올바른 열쇠를 가진 요청에만 내어 줍니다.
 *
 * 처음 한 번 [설치] 함수를 실행하면 필요한 시트와 열쇠가 자동으로 만들어집니다.
 */

var SHEET_설정 = '설정';
var SHEET_데이터 = '데이터';
var SHEET_임시 = '임시';
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
    설정.getRange(1, 1, 1, 2).setFontWeight('bold');
    설정.getRange(2, 1, 2, 1).setFontWeight('bold');
    설정.getRange(2, 2, 2, 1).setFontFamily('Roboto Mono');
  }

  if (!ss.getSheetByName(SHEET_데이터)) ss.insertSheet(SHEET_데이터).hideSheet();
  if (!ss.getSheetByName(SHEET_임시)) ss.insertSheet(SHEET_임시).hideSheet();

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
    if (String(v[i][0]).trim() === 항목) { sh.getRange(i + 1, 2).setValue(값); return; }
  }
  sh.appendRow([항목, 값]);
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
      return 응답({ ok: true, version: 버전, 요약: 값읽기('자료요약'), 갱신: 값읽기('최종갱신') });
    }

    var text = 데이터읽기();
    if (!text) return 응답({ ok: false, error: '아직 등록된 자료가 없습니다. 관리자 화면에서 먼저 올려 주세요.' });

    return 원문응답('{"ok":true,"version":' + JSON.stringify(버전) + ',"data":' + text + '}');
  } catch (err) {
    return 응답({ ok: false, error: String(err) });
  }
}

function 데이터읽기() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_데이터);
  if (!sh || sh.getLastRow() === 0) return '';
  var rows = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(rows[i][0]);
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
      });
    }

    lock.waitLock(30000);

    if (body.action === 'begin') {
      임시.clear();
      return 응답({ ok: true });
    }

    if (body.action === 'chunk') {
      임시.getRange(body.seq + 1, 1).setValue(body.data);
      return 응답({ ok: true, seq: body.seq });
    }

    if (body.action === 'commit') {
      var n = 임시.getLastRow();
      if (n === 0) return 응답({ ok: false, error: '받은 자료가 없습니다.' });

      var rows = 임시.getRange(1, 1, n, 1).getValues();
      var parts = [];
      for (var i = 0; i < rows.length; i++) parts.push(rows[i][0]);
      var text = parts.join('');

      // 온전한 자료인지 확인한 뒤에만 교체합니다.
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (err) { return 응답({ ok: false, error: '자료가 온전하지 않습니다. 다시 올려 주세요.' }); }

      var 데이터 = ss.getSheetByName(SHEET_데이터);
      데이터.clear();
      var 조각 = [];
      for (var p = 0; p < text.length; p += 조각크기) 조각.push([text.slice(p, p + 조각크기)]);
      데이터.getRange(1, 1, 조각.length, 1).setValues(조각);
      임시.clear();

      var m = body.meta || (parsed && parsed.meta) || {};
      var 요약 = (m.years ? m.years[0] + '~' + m.years[m.years.length - 1] + '학년도 · ' : '')
        + '지원 ' + (m.nApps || parsed.apps.length) + '건 · 학생 ' + (m.nPersons || parsed.persons.length) + '명';

      값쓰기('버전', String(Date.now()));
      값쓰기('최종갱신', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'));
      값쓰기('자료요약', 요약);

      return 응답({ ok: true, 요약: 요약 });
    }

    return 응답({ ok: false, error: '알 수 없는 요청입니다.' });
  } catch (err) {
    return 응답({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
