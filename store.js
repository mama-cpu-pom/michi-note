// データの係（このアプリでデータを読み書きするのは、このファイルだけ）
//
// ・場所のデータは「places」という1つの箱にまとめて入れる。
//   「行きたい」「行った」は別の箱にせず、場所の status（状態）で持つ。
// ・写真は大きいので「photos」という箱に別に入れ、場所には写真の番号（id）だけを書く。
// ・どの画面も、表示するたびに Store.list() / Store.get() で最新のデータを読む。
//   画面ごとにデータのコピーを持たないので、画面どうしでずれることがない。

const Store = (() => {
  const DB_NAME = 'michinote2';   // 前のアプリ（michinote）とは別の保存場所
  const DB_VERSION = 1;
  let dbPromise = null;
  let places = [];                // 起動時に読みこんだ場所データ（保存のたびに同時に更新する）

  // ---------- IndexedDB の基本 ----------

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('places')) db.createObjectStore('places', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function done(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('abort'));
    });
  }

  async function getAll(name) {
    const db = await open();
    const t = db.transaction(name);
    const req = t.objectStore(name).getAll();
    await done(t);
    return req.result;
  }

  async function putOne(name, item) {
    const db = await open();
    const t = db.transaction(name, 'readwrite');
    t.objectStore(name).put(item);
    await done(t);
  }

  async function deleteMany(name, ids) {
    if (!ids.length) return;
    const db = await open();
    const t = db.transaction(name, 'readwrite');
    ids.forEach(id => t.objectStore(name).delete(id));
    await done(t);
  }

  // ---------- 小さな道具 ----------

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 今日の日付を「2026-11-07」の形で
  function today() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // 足りない項目を空で補う（古いバックアップを読んだときなどのため）
  function normalize(p) {
    return {
      id: p.id || newId(),
      name: p.name || '（名前なし）',
      status: p.status === 'went' ? 'went' : 'want',
      research: p.research || '',        // 下調べメモ
      visits: Array.isArray(p.visits) ? p.visits.slice() : [],  // 行った日（'2026-11-07' の形）
      wentAdded: p.wentAdded || null,    // 「行った！」で自動で入れた日（「行きたいに戻す」で消すため）
      routePhotos: Array.isArray(p.routePhotos) ? p.routePhotos.slice() : [],   // ルートのスクショ
      parking: p.parking || '',          // 駐車場の注意点
      road: p.road || '',                // 道の注意点
      buildingPhotos: Array.isArray(p.buildingPhotos) ? p.buildingPhotos.slice() : [],  // 建物の写真
      shops: Array.isArray(p.shops) ? p.shops.slice() : [],     // ショップリスト
      impression: p.impression || '',    // 感想メモ
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: p.updatedAt || new Date().toISOString(),
    };
  }

  function copy(p) { return p ? JSON.parse(JSON.stringify(p)) : null; }

  // 最後に行った日
  function lastVisit(p) {
    return p.visits.length ? p.visits.slice().sort().pop() : '';
  }

  // ---------- 読む ----------

  async function load() {
    places = (await getAll('places')).map(normalize);
  }

  // status を 'want' / 'went' で指定すると、その状態の場所だけ返す
  function list(status) {
    let out = places.filter(p => !status || p.status === status);
    if (status === 'went') {
      out.sort((a, b) => lastVisit(b).localeCompare(lastVisit(a)) || b.updatedAt.localeCompare(a.updatedAt));
    } else {
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return out.map(copy);
  }

  function get(id) {
    return copy(places.find(p => p.id === id));
  }

  // ---------- 書く ----------

  // 場所の一部を書きかえて保存する（ここを必ず通る）
  async function update(id, changes) {
    const i = places.findIndex(p => p.id === id);
    if (i < 0) throw new Error('not found');
    const next = normalize({ ...places[i], ...changes, id, updatedAt: new Date().toISOString() });
    await putOne('places', next);
    places[i] = next;
    return copy(next);
  }

  async function add(name) {
    const p = normalize({ id: newId(), name: name.trim() });
    await putOne('places', p);
    places.push(p);
    return copy(p);
  }

  async function remove(id) {
    const p = places.find(x => x.id === id);
    if (!p) return;
    await deleteMany('places', [id]);
    await deleteMany('photos', [...p.routePhotos, ...p.buildingPhotos]);
    places = places.filter(x => x.id !== id);
  }

  // 「行った！」：状態を「行った」にして、今日の日付を入れる
  async function markWent(id) {
    const p = get(id);
    const d = today();
    const added = !p.visits.includes(d);
    return update(id, {
      status: 'went',
      visits: added ? [...p.visits, d] : p.visits,
      wentAdded: added ? d : null,
    });
  }

  // 「行きたいに戻す」：「行った！」で自動で入れた日だけ消す（自分で書いた記録は消さない）
  async function backToWant(id) {
    const p = get(id);
    let visits = p.visits;
    if (p.wentAdded) {
      const i = visits.lastIndexOf(p.wentAdded);
      if (i >= 0) visits = visits.filter((_, k) => k !== i);
    }
    return update(id, { status: 'want', visits, wentAdded: null });
  }

  // 「また行った」：日付を1つ追加する
  async function addVisit(id, date) {
    const p = get(id);
    return update(id, { visits: [...p.visits, date || today()], wentAdded: null });
  }

  // ---------- 写真 ----------

  // 写真を長い辺1600pxまでに縮めて、JPEGにする
  async function shrink(file, maxSide = 1600, quality = 0.8) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
      canvas.width = canvas.height = 0; // メモリを早めに返す
      return blob || file;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // 写真を保存して、場所の routePhotos か buildingPhotos に番号を足す
  async function addPhotos(placeId, field, files) {
    const ids = [];
    for (const file of files) {
      const blob = await shrink(file);
      const id = 'ph' + newId();
      await putOne('photos', { id, blob, createdAt: new Date().toISOString() });
      ids.push(id);
    }
    const p = get(placeId);
    return update(placeId, { [field]: [...p[field], ...ids] });
  }

  async function removePhoto(placeId, field, photoId) {
    const p = get(placeId);
    const result = await update(placeId, { [field]: p[field].filter(x => x !== photoId) });
    await deleteMany('photos', [photoId]);
    forgetURL(photoId);
    return result;
  }

  // 写真を画面に出すためのURL（同じ写真は使い回す）
  const urlCache = new Map();
  async function photoURL(photoId) {
    if (urlCache.has(photoId)) return urlCache.get(photoId);
    const db = await open();
    const t = db.transaction('photos');
    const req = t.objectStore('photos').get(photoId);
    await done(t);
    if (!req.result) return '';
    const url = URL.createObjectURL(req.result.blob);
    urlCache.set(photoId, url);
    return url;
  }
  function forgetURL(photoId) {
    const url = urlCache.get(photoId);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(photoId);
  }
  function forgetAllURLs() {
    [...urlCache.keys()].forEach(forgetURL);
  }

  // ---------- バックアップ ----------

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // 写真も文字にして1つのファイルにする。
  // 写真を1枚ずつ文字にしてつなげるので、写真が多くてもスマホのメモリを使いすぎない。
  async function exportBackup() {
    const photos = await getAll('photos');
    const parts = [
      '{"app":"michinote2","version":1,"exportedAt":' + JSON.stringify(new Date().toISOString()) +
      ',"places":' + JSON.stringify(places) + ',"photos":[',
    ];
    for (let i = 0; i < photos.length; i++) {
      const ph = photos[i];
      parts.push((i ? ',' : '') + JSON.stringify({ id: ph.id, createdAt: ph.createdAt, data: await blobToDataURL(ph.blob) }));
    }
    parts.push(']}');
    return { blob: new Blob(parts, { type: 'application/json' }), placeCount: places.length, photoCount: photos.length };
  }

  // バックアップを読みこんで、いまのデータと置きかえる
  async function importBackup(file) {
    let json;
    try { json = JSON.parse(await file.text()); } catch { throw new Error('format'); }
    if (!json || json.app !== 'michinote2' || !Array.isArray(json.places)) throw new Error('format');
    const newPlaces = json.places.map(normalize);
    const newPhotos = [];
    for (const ph of json.photos || []) {
      const blob = await (await fetch(ph.data)).blob();
      newPhotos.push({ id: ph.id, createdAt: ph.createdAt, blob });
    }
    const db = await open();
    const t = db.transaction(['places', 'photos'], 'readwrite');
    t.objectStore('places').clear();
    t.objectStore('photos').clear();
    newPlaces.forEach(p => t.objectStore('places').put(p));
    newPhotos.forEach(ph => t.objectStore('photos').put(ph));
    await done(t);
    forgetAllURLs();
    places = newPlaces;
    return { placeCount: newPlaces.length, photoCount: newPhotos.length };
  }

  return {
    load, list, get, lastVisit, today,
    add, update, remove, markWent, backToWant, addVisit,
    addPhotos, removePhoto, photoURL,
    exportBackup, importBackup,
  };
})();
