/* Google Apps Script 웹앱과의 통신.
   조회는 GET 한 번. 업로드는 조각내어 여러 번 POST 합니다.
   POST 는 Content-Type 을 text/plain 으로 보냅니다 — 그래야 브라우저가
   사전 확인(preflight)을 생략하고, GAS 가 처리할 수 있습니다. */

import { GAS_URL } from '../config.js';
import * as CFG from '../config.js';

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
  if (!json.ok) throw authError(json.error);
  return json;
}

/* 서버가 「키가 틀리다」고 답한 것과, 네트워크·응답 손상은 다르게 다뤄야 합니다.
   앞의 것만 링크 키를 지우는 이유가 됩니다. */
function authError(msg) {
  const e = new Error(msg || '접근 권한이 없습니다.');
  e.auth = true;
  return e;
}

/* 지원결과 자료 전체 내려받기 */
export async function fetchData(key, onProgress) {
  onProgress?.('자료를 받는 중');
  const res = await fetch(url({ k: key }));
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const json = await res.json();
  if (!json.ok) throw authError(json.error);
  return json;
}

/* 관리자 — 새 자료 올리기. 40,000자씩 잘라 보냅니다. */
const CHUNK = 40000;

export async function uploadData(adminKey, encoded, onProgress, kind = 'data', extra = {}) {
  const text = JSON.stringify(encoded);
  const parts = [];
  for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));

  await post({ action: 'begin', admin: adminKey, total: parts.length, kind });
  for (let i = 0; i < parts.length; i++) {
    await post({ action: 'chunk', admin: adminKey, seq: i, data: parts[i], kind });
    onProgress?.(i + 1, parts.length);
  }
  return post({ action: 'commit', admin: adminKey, meta: encoded.meta, kind, ...extra });
}

/* 정시 배치기준표 내려받기 (없으면 ok:false — 정상입니다) */
export async function fetchCut(key) {
  const res = await fetch(url({ k: key, mode: 'cut' }));
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  return res.json();
}

/* 정시 지원가능 자료 — 없어도 프로그램은 돌아갑니다. */
export async function fetchJG(key) {
  const res = await fetch(url({ k: key, mode: 'jg' }));
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  return res.json();
}

/* 선택과목 자료 — 없어도 프로그램은 돌아갑니다. */
export async function fetchSel(key) {
  const res = await fetch(url({ k: key, mode: 'sel' }));
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  return res.json();
}

/* 학년별 선택 결과(학급·번호·과목만, 이름 없음) — 없어도 프로그램은 돌아갑니다. */
export async function fetchChoice(key) {
  const res = await fetch(url({ k: key, mode: 'choice' }));
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  return res.json();
}

/* ── 정시 자료 자동 받기 ────────────────────────────
   제작자 저장소에서 최신 파일을 확인하고 내려받습니다. 관리자 화면에서만 씁니다. */

const REPO = () => CFG.JG_REPO || 'SearchUnivMajor/SearchUnivMajorPossibility';

export async function jgLatest() {
  const res = await fetch(`https://api.github.com/repos/${REPO()}/contents/`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`저장소를 읽지 못했습니다 (${res.status})`);
  const list = await res.json();
  const f = (Array.isArray(list) ? list : []).find(x => /\.xlsb$/i.test(x.name || ''));
  if (!f) throw new Error('저장소에서 .xlsb 파일을 찾지 못했습니다.');
  return { name: f.name, sha: f.sha, size: f.size, url: f.download_url };
}

export async function jgDownload(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`파일을 받지 못했습니다 (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    onProgress?.(got, total);
  }
  const out = new Uint8Array(got); let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/* 관리자 — 현재 상태 확인 */
export async function adminStatus(adminKey) {
  return post({ action: 'status', admin: adminKey });
}
