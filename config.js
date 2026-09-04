/* ────────────────────────────────────────────────────────────
   설정 — 이 파일 한 줄만 고치면 됩니다.

   GAS_URL 에 Apps Script 웹앱 주소를 넣으세요.
   Apps Script 편집기 → 배포 → 새 배포 → 웹 앱 →
   「액세스 권한: 모든 사용자」로 배포한 뒤 나오는 주소입니다.
   .../exec 로 끝나야 합니다.

   ※ 이 주소는 공개되어도 됩니다. 열쇠가 없으면 자료를 내주지 않습니다.
   ※ 열쇠(교사용키·관리자키)는 이 파일에 넣지 마세요. 스프레드시트에만 둡니다.
   ──────────────────────────────────────────────────────────── */

export const GAS_URL = 'https://script.google.com/macros/s/https://script.google.com/macros/s/AKfycbzxy7GmMQSLAatWCKaxDMrwzFXSSOPxJFk4NKskGwgchR3Ma8mwS0fDYeYimOLdRSCBew/exec/exec';

/* 학교 표기 — 다른 학교에서 쓸 때만 고치면 됩니다. */
export const SCHOOL = {
  ko: '과천여자고등학교',
  en: 'GWACHEON WOMANS HIGH SCHOOL',
  since: 'SINCE · 1974',
  motto: ['CREATING TOMORROW,', 'TOGETHER'],
  title: ['과천여자고등학교', '진학상담 프로그램'],
  titleEn: 'COLLEGE ADMISSION COUNSELING',
};

/* 학생 명단 파일을 어디서 받는지 — 화면에 그대로 표시됩니다. */
export const ROSTER_STEPS = [
  '김영일 컨설팅 로그인', '진학관리', '성적분석', '학생부분석(기본분석)',
  '본인 학급', '반영학기(등록학기까지)', '보기', '하단 다운로드로 엑셀파일 받기',
];
