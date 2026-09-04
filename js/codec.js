/* 전송·저장용 압축 인코딩.
   지원 기록 7,400여 건을 객체 배열 그대로 주고받으면 3MB가 넘습니다.
   대학·학과·전형 이름을 사전으로 빼고 각 행을 숫자 배열로 바꾸면 1/4로 줄어듭니다. */

const RES = ['합격', '추합', '불합'];
const MIN = ['충족', '미충족'];
const FST = ['1차합격', '1차불합'];
const GRP = ['가군', '나군', '다군', '추가', '전문대'];

const idx = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? -1 : i; };
const val = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : null);

function table(values) {
  const uniq = [...new Set(values.filter(v => v != null && v !== ''))].sort();
  const map = new Map(uniq.map((v, i) => [v, i]));
  return { list: uniq, map };
}

export function encode(history) {
  const U = table(history.apps.map(a => a.univ));
  const D = table(history.apps.map(a => a.dept));
  const T = table(history.apps.map(a => a.type));
  const K = table(history.apps.map(a => a.track));
  const P = table(history.apps.map(a => a.pk));

  const apps = history.apps.map(a => [
    P.map.get(a.pk) ?? -1,
    a.y,
    a.ph,
    a.cat,
    K.map.get(a.track) ?? -1,
    T.map.get(a.type) ?? -1,
    U.map.get(a.univ) ?? -1,
    D.map.get(a.dept) ?? -1,
    a.gy,
    idx(FST, a.first),
    idx(RES, a.res),
    idx(MIN, a.min),
    idx(GRP, a.grp),
    a.wait || '',
  ]);

  const C = ['k', 'm', 'e', 's1', 's2', 'h', 'pk', 'pm', 'ps1', 'ps2', 'sk', 'sm', 'ss1', 'ss2'];
  const persons = history.persons.map(p => [
    P.map.get(p.pk) ?? -1,
    p.y,
    p.g || [],
    p.gj || [],
    p.csat ? C.map(k => p.csat[k]) : [],
  ]);

  return {
    v: 1,
    univ: U.list, dept: D.list, type: T.list, track: K.list, pkey: P.list,
    apps, persons,
    mincond: history.mincond || {},
    meta: history.meta,
  };
}

export function decode(enc) {
  const { univ, dept, type, track, pkey } = enc;
  const C = ['k', 'm', 'e', 's1', 's2', 'h', 'pk', 'pm', 'ps1', 'ps2', 'sk', 'sm', 'ss1', 'ss2'];

  const apps = enc.apps.map(r => ({
    pk: pkey[r[0]] ?? '',
    y: r[1], ph: r[2], cat: r[3],
    track: track[r[4]] ?? null,
    type: type[r[5]] ?? null,
    univ: univ[r[6]] ?? '',
    dept: dept[r[7]] ?? null,
    gy: r[8],
    first: val(FST, r[9]),
    res: val(RES, r[10]),
    min: val(MIN, r[11]),
    grp: val(GRP, r[12]),
    wait: r[13] || null,
  }));

  const persons = enc.persons.map(r => {
    const csat = {};
    let has = false;
    (r[4] || []).forEach((v, i) => { csat[C[i]] = v ?? null; if (v != null) has = true; });
    return {
      pk: pkey[r[0]] ?? '',
      y: r[1],
      g: r[2] && r[2].length ? r[2] : null,
      gj: r[3] && r[3].length ? r[3] : null,
      csat: has ? csat : null,
    };
  });

  return { persons, apps, mincond: enc.mincond || {}, meta: enc.meta };
}
