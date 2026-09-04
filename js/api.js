/* Google Apps Script 웹앱과의 통신.
   조회는 GET 한 번. 업로드는 조각내어 여러 번 POST 합니다.
   POST 는 Content-Type 을 text/plain 으로 보냅니다 — 그래야 브라우저가
   사전 확인(preflight)을 생략하고, GAS 가 처리할 수 있습니다. */

import { GAS_URL } from '../config.js';

function url(params) {
  const u = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

async function post(body) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '알 수 없는 오류');
  return json;
}

/* 자료 버전만 확인 — 캐시가 최신인지 판단할 때 씁니다. */
export async function fetchVersion(key) {
  const res = await fetch(url({ k: key, mode: 'version' }));
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '접근 권한이 없습니다.');
  return json;
}

/* 5개년 자료 전체 내려받기 */
export async function fetchData(key, onProgress) {
  onProgress?.('자료를 받는 중');
  const res = await fetch(url({ k: key }));
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '접근 권한이 없습니다.');
  return json;
}

/* 관리자 — 새 자료 올리기. 40,000자씩 잘라 보냅니다. */
const CHUNK = 40000;

export async function uploadData(adminKey, encoded, onProgress) {
  const text = JSON.stringify(encoded);
  const parts = [];
  for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));

  await post({ action: 'begin', admin: adminKey, total: parts.length });
  for (let i = 0; i < parts.length; i++) {
    await post({ action: 'chunk', admin: adminKey, seq: i, data: parts[i] });
    onProgress?.(i + 1, parts.length);
  }
  return post({ action: 'commit', admin: adminKey, meta: encoded.meta });
}

/* 관리자 — 현재 상태 확인 */
export async function adminStatus(adminKey) {
  return post({ action: 'status', admin: adminKey });
}
