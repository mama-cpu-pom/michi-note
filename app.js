// 画面（ホーム・行きたい・行った・場所のページ・設定）と、画面の切りかえ
//
// どの画面も、表示するたびに Store から最新のデータを読んで作り直す。
// 場所をタップすると、どの画面からでも同じ「場所のページ」（#/place/番号）が開く。

// ===================== 画面の切りかえ =====================

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id] = h.split('/');
  return { page: page || 'home', id };
}

let lastPage = '';
async function render() {
  await flushSaves();
  const { page, id } = route();
  const keepScroll = page === lastPage && page === 'place';
  const y = window.scrollY;

  if (page === 'want') renderWant();
  else if (page === 'went') renderWent();
  else if (page === 'settings') renderSettings();
  else if (page === 'place') renderPlace(id);
  else renderHome();

  // 下のタブの色
  const tab = page === 'place' ? '' : page;
  $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === (tab || 'home')  && page !== 'place'));

  loadThumbs($('#main'));
  $$('textarea', $('#main')).forEach(autoGrow);
  window.scrollTo(0, keepScroll ? y : 0);
  lastPage = page;
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

// ===================== 共通の部品 =====================

function addForm(id) {
  return `<form class="add-form" data-act="add-place" data-input="${id}">
    <input type="text" id="${id}" placeholder="行きたい場所の名前" enterkeyhint="done" autocomplete="off">
    <button type="submit" class="btn primary">追加</button>
  </form>`;
}

// おおよその距離と時間を「約15km・約30分」のように（入っていなければ空）
function tripText(p) {
  const parts = [];
  if (p.distance) parts.push(`約${p.distance}km`);
  if (p.minutes) {
    const m = Number(p.minutes);
    parts.push(m >= 60 && Number.isInteger(m) ? `約${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}` : `約${p.minutes}分`);
  }
  return parts.join('・');
}
function tripLine(p) {
  const t = tripText(p);
  return t ? `<span class="row-trip">${esc(t)}</span>` : '';
}

// 「行きたい」の1行
function wantRow(p) {
  return `<li class="row">
    <a class="row-body" href="#/place/${p.id}">
      <span class="row-title">${esc(p.name)}</span>
      ${tripLine(p)}
      ${p.research ? `<span class="row-sub">${esc(p.research.split('\n')[0])}</span>` : ''}
    </a>
    <button type="button" class="btn went-btn" data-act="went" data-id="${p.id}">行った！</button>
  </li>`;
}

// 「行った」の1行
function wentRow(p) {
  const last = Store.lastVisit(p);
  const thumb = p.buildingPhotos[0] || p.routePhotos[0];
  return `<li class="row">
    <a class="row-body with-thumb" href="#/place/${p.id}">
      ${thumb ? `<img class="thumb" data-photo="${thumb}" alt="">` : '<span class="thumb empty">🚗</span>'}
      <span class="row-text">
        <span class="row-title">${esc(p.name)}</span>
        ${tripLine(p)}
        <span class="row-sub">${p.visits.length}回　${last ? '最後に行った日：' + fmtDate(last) : ''}</span>
      </span>
    </a>
  </li>`;
}

// ===================== ホーム =====================

function renderHome() {
  const want = Store.list('want');
  const went = Store.list('went');
  setView(`
    <header class="page-head"><h1>みちノート</h1></header>
    <section class="card">
      <h2>行きたい場所を追加</h2>
      ${addForm('home-new')}
    </section>
    <section class="card">
      <h2>行きたい場所 <span class="count">${want.length}か所</span></h2>
      ${want.length
        ? `<ul class="rows">${want.slice(0, 5).map(wantRow).join('')}</ul>
           ${want.length > 5 ? `<a class="more" href="#/want">すべて見る（${want.length}か所）</a>` : ''}`
        : '<p class="empty-msg">まだありません。上の欄に名前を入れて追加してください。</p>'}
    </section>
    <section class="card">
      <h2>最近行った場所 <span class="count">${went.length}か所</span></h2>
      ${went.length
        ? `<ul class="rows">${went.slice(0, 3).map(wentRow).join('')}</ul>
           ${went.length > 3 ? `<a class="more" href="#/went">すべて見る（${went.length}か所）</a>` : ''}`
        : '<p class="empty-msg">「行った！」を押した場所がここに出ます。</p>'}
    </section>
  `);
}

// ===================== 行きたい場所 =====================

function renderWant() {
  const want = Store.list('want');
  setView(`
    <header class="page-head"><h1>行きたい場所</h1></header>
    <section class="card">${addForm('want-new')}</section>
    <section class="card">
      ${want.length
        ? `<ul class="rows">${want.map(wantRow).join('')}</ul>`
        : '<p class="empty-msg">まだありません。名前だけで追加できます。</p>'}
    </section>
    <p class="hint">名前をタップすると、下調べメモを書いたり、名前を直したりできます。</p>
  `);
}

// ===================== 行った場所 =====================

function renderWent() {
  const went = Store.list('went');
  setView(`
    <header class="page-head"><h1>行った場所</h1></header>
    ${went.length
      ? `<section class="card"><ul class="rows">${went.map(wentRow).join('')}</ul></section>
         <p class="hint">場所をタップすると、記録を見たり書き足したりできます。</p>`
      : '<section class="card"><p class="empty-msg">まだありません。行きたい場所で「行った！」を押すと、ここに移ります。</p></section>'}
  `);
}

// ===================== 場所のページ（見る・書く・直すを全部ここで） =====================

function memoBox(p, field, title, placeholder) {
  return `<section class="card">
    <h2>${title}</h2>
    <textarea data-field="${field}" data-id="${p.id}" placeholder="${placeholder}" rows="3">${esc(p[field])}</textarea>
  </section>`;
}

function renderPlace(id) {
  const p = Store.get(id);
  if (!p) {
    setView(`<section class="card"><p class="empty-msg">この場所は見つかりませんでした（削除されたかもしれません）。</p>
      <a class="btn wide" href="#/home">ホームへ</a></section>`);
    return;
  }
  const went = p.status === 'went';
  const visits = p.visits.map((d, i) => ({ d, i })).sort((a, b) => b.d.localeCompare(a.d));

  setView(`
    <div class="place-top">
      <button type="button" class="back" data-act="back">‹ 戻る</button>
      <span id="saved" class="saved">保存しました ✓</span>
    </div>

    <section class="card">
      <span class="badge ${went ? 'went' : 'want'}">${went ? '行った' : '行きたい'}</span>
      <label class="label" for="place-name">場所の名前</label>
      <input type="text" id="place-name" class="name-input" data-field="name" data-id="${p.id}" value="${esc(p.name)}" autocomplete="off">
      ${went
        ? `<div class="btn-row">
             <button type="button" class="btn primary" data-act="again" data-id="${p.id}">また行った！（今日）</button>
           </div>
           <button type="button" class="link-btn" data-act="back-to-want" data-id="${p.id}">間違えて押したので「行きたい」に戻す</button>`
        : `<button type="button" class="btn primary big wide" data-act="went" data-id="${p.id}">行った！</button>`}
    </section>

    <section class="card">
      <h2>距離と時間（おおよそ）</h2>
      <div class="trip-inputs">
        <label>距離<span class="unit-input"><input type="text" inputmode="decimal" data-field="distance" data-id="${p.id}" value="${esc(p.distance)}" placeholder="15" autocomplete="off"><span>km</span></span></label>
        <label>時間<span class="unit-input"><input type="text" inputmode="numeric" data-field="minutes" data-id="${p.id}" value="${esc(p.minutes)}" placeholder="30" autocomplete="off"><span>分</span></span></label>
      </div>
      <p class="hint-in">一覧に「約15km・約30分」のように出ます。</p>
    </section>

    ${went ? `
    <section class="card">
      <h2>行った日 <span class="count">${p.visits.length}回</span></h2>
      ${visits.length ? `<ul class="visits">
        ${visits.map(({ d, i }) => `<li>
          <input type="date" value="${d}" data-act="edit-visit" data-index="${i}" data-id="${p.id}" aria-label="行った日">
          <span class="visit-label">${fmtDate(d)}</span>
          <button type="button" class="small-del" data-act="del-visit" data-index="${i}" data-id="${p.id}" aria-label="この日を消す">消す</button>
        </li>`).join('')}
      </ul>
      <p class="hint-in">日付をタップすると直せます。</p>` : '<p class="empty-msg">行った日がありません。</p>'}
    </section>

    <section class="card">
      <h2>ルート</h2>
      <p class="hint-in">Googleマップのタイムラインのスクショを貼れます（何枚でもOK）。</p>
      ${photoGrid(p.routePhotos, 'routePhotos', p.id)}
    </section>

    ${memoBox(p, 'parking', '駐車場の注意点', '例：入口が狭い、2階がすいてる')}
    ${memoBox(p, 'road', '道の注意点', '例：右折入場NG、手前の交差点がややこしい')}

    <section class="card">
      <h2>建物の感想</h2>
      <h3>写真</h3>
      ${photoGrid(p.buildingPhotos, 'buildingPhotos', p.id)}
      <h3>ショップリスト</h3>
      ${p.shops.length ? `<ul class="shops">
        ${p.shops.map((s, i) => `<li><span>${esc(s)}</span>
          <button type="button" class="small-del" data-act="del-shop" data-index="${i}" data-id="${p.id}" aria-label="${esc(s)}を消す">消す</button></li>`).join('')}
      </ul>` : ''}
      <form class="add-form" data-act="add-shop" data-id="${p.id}">
        <input type="text" id="shop-new" placeholder="お店の名前" enterkeyhint="done" autocomplete="off">
        <button type="submit" class="btn">追加</button>
      </form>
      <h3>感想メモ</h3>
      <textarea data-field="impression" data-id="${p.id}" placeholder="例：フードコートが広くて休憩しやすい" rows="3">${esc(p.impression)}</textarea>
    </section>
    ` : ''}

    ${memoBox(p, 'research', '下調べメモ', '例：駐車場は2か所ある。平日は無料')}

    <section class="danger-zone">
      <button type="button" class="btn danger wide" data-act="delete-place" data-id="${p.id}">この場所を削除する</button>
    </section>
  `);
}

// ===================== 設定（バックアップ） =====================

let backupFile = null;

function renderSettings() {
  const all = Store.list();
  setView(`
    <header class="page-head"><h1>設定</h1></header>
    <section class="card">
      <h2>バックアップを書き出す</h2>
      <p>場所の記録と写真を、まとめて1つのファイルにします。ときどき書き出して「ファイル」アプリやiCloud Driveに保存しておくと安心です。</p>
      <p class="hint-in">いまの場所：${all.length}か所</p>
      <button type="button" class="btn primary wide" data-act="export">バックアップを作る</button>
      <div id="export-result"></div>
    </section>
    <section class="card">
      <h2>バックアップを読み込む</h2>
      <p>書き出したファイルを選ぶと、その時の状態に戻ります。<strong>いまのデータは置きかわります。</strong></p>
      <label class="btn wide file-btn">
        <input type="file" accept=".json,application/json" data-act="import">
        ファイルを選んで読み込む
      </label>
    </section>
    <section class="card">
      <h2>このアプリについて</h2>
      <p class="hint-in">記録と写真は、このスマホの中だけに保存されます。インターネットには送られません。いつもホーム画面のアイコンから開いてください（Safariで直接開くと、別の保存場所になります）。</p>
    </section>
  `);
}

function backupName() {
  return `みちノート_バックアップ_${Store.today()}.json`;
}

// ===================== ボタンなどを押したとき =====================

const ACTIONS = {
  async back() {
    if (history.state && history.state.inApp) history.back();
    else go('#/home');
  },

  async went(el) {
    const p = await Store.markWent(el.dataset.id);
    toast(`「${p.name}」を行った場所に移しました`);
    render();
  },

  async again(el) {
    const p = await Store.addVisit(el.dataset.id);
    toast(`行った日を追加しました（${p.visits.length}回目）`);
    render();
  },

  async 'back-to-want'(el) {
    if (!confirm('「行きたい」に戻しますか？\n（「行った！」で自動で入った日付だけ消えます。書いた記録はそのまま残ります）')) return;
    await Store.backToWant(el.dataset.id);
    toast('「行きたい」に戻しました');
    render();
  },

  async 'del-visit'(el) {
    const p = Store.get(el.dataset.id);
    const i = Number(el.dataset.index);
    if (!confirm(`${fmtDate(p.visits[i])} を消しますか？`)) return;
    await Store.update(p.id, { visits: p.visits.filter((_, k) => k !== i), wentAdded: null });
    render();
  },

  async 'del-shop'(el) {
    const p = Store.get(el.dataset.id);
    const i = Number(el.dataset.index);
    if (!confirm(`「${p.shops[i]}」を消しますか？`)) return;
    await Store.update(p.id, { shops: p.shops.filter((_, k) => k !== i) });
    render();
  },

  async 'del-photo'(el) {
    if (!confirm('この写真を消しますか？')) return;
    await Store.removePhoto(route().id, el.dataset.field, el.dataset.photoId);
    render();
  },

  async 'delete-place'(el) {
    const p = Store.get(el.dataset.id);
    if (!confirm(`「${p.name}」を削除しますか？\n記録と写真もすべて消えて、元に戻せません。`)) return;
    await Store.remove(p.id);
    toast('削除しました');
    go(p.status === 'went' ? '#/went' : '#/want');
  },

  zoom(el) {
    if (el.src) zoomPhoto(el.src);
  },

  async export(el) {
    el.disabled = true;
    el.textContent = '作っています…';
    try {
      const { blob, placeCount, photoCount } = await Store.exportBackup();
      backupFile = new File([blob], backupName(), { type: 'application/json' });
      const url = URL.createObjectURL(backupFile);
      const canShare = navigator.canShare && navigator.canShare({ files: [backupFile] });
      $('#export-result').innerHTML = `
        <p class="ok">できました（場所${placeCount}か所・写真${photoCount}枚・${(blob.size / 1024 / 1024).toFixed(1)}MB）</p>
        ${canShare ? '<button type="button" class="btn primary wide" data-act="share-backup">保存先を選ぶ（「ファイルに保存」）</button>' : ''}
        <a class="btn wide" href="${url}" download="${backupName()}">ダウンロードする</a>`;
    } catch (e) {
      console.error(e);
      toast('バックアップを作れませんでした');
    } finally {
      el.disabled = false;
      el.textContent = 'バックアップを作る';
    }
  },

  async 'share-backup'() {
    try {
      await navigator.share({ files: [backupFile], title: backupFile.name });
    } catch (e) {
      if (e.name !== 'AbortError') toast('うまく開けませんでした。「ダウンロードする」を試してください');
    }
  },
};

// ===================== 入力のしかけ =====================

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM' || el.tagName === 'INPUT') return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); flushSaves().then(() => fn(el)); }
});

// 追加のフォーム（場所の追加・お店の追加）
document.addEventListener('submit', async e => {
  const form = e.target;
  e.preventDefault();
  if (form.dataset.act === 'add-place') {
    const input = $('#' + form.dataset.input);
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    await Store.add(name);
    toast(`「${name}」を追加しました`);
    render();
  }
  if (form.dataset.act === 'add-shop') {
    const input = $('#shop-new');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const p = Store.get(form.dataset.id);
    await Store.update(p.id, { shops: [...p.shops, name] });
    await render();
    $('#shop-new').focus();
  }
});

// 文字の入力（名前・メモ）は、手が止まったら自動で保存
document.addEventListener('input', e => {
  const el = e.target;
  if (el.tagName === 'TEXTAREA') autoGrow(el);
  if (!el.dataset.field || !el.dataset.id || el.type === 'file') return;
  const { id, field } = el.dataset;
  scheduleSave(id + ':' + field, async () => {
    let value = el.value;
    if (field === 'name') {
      value = value.trim();
      if (!value) return; // 名前を空にはしない
    }
    if (field === 'distance' || field === 'minutes') {
      // 全角の数字（１５）を半角（15）にして、数字と小数点以外は取りのぞく
      value = value.replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[^0-9.]/g, '');
    }
    await Store.update(id, { [field]: value });
    showSaved();
  });
});

// 入力欄から離れたら、すぐ保存
document.addEventListener('focusout', e => {
  if (e.target.dataset && e.target.dataset.field) flushSaves();
});

// 写真の追加・日付の変更・バックアップの読み込み
document.addEventListener('change', async e => {
  const el = e.target;
  const act = el.dataset.act;

  if (act === 'add-photos' && el.files.length) {
    const files = [...el.files];
    toast(`写真を保存しています…（${files.length}枚）`);
    try {
      await Store.addPhotos(el.dataset.place, el.dataset.field, files);
      toast(`写真を${files.length}枚追加しました`);
    } catch (err) {
      console.error(err);
      toast('写真を保存できませんでした');
    }
    render();
  }

  if (act === 'edit-visit') {
    const p = Store.get(el.dataset.id);
    if (!el.value) { render(); return; }
    const visits = p.visits.slice();
    visits[Number(el.dataset.index)] = el.value;
    await Store.update(p.id, { visits, wentAdded: null });
    showSaved();
    render();
  }

  if (act === 'import' && el.files.length) {
    const file = el.files[0];
    el.value = '';
    if (!confirm(`「${file.name}」を読み込みますか？\nいまのデータは、このバックアップの内容に置きかわります。`)) return;
    try {
      const { placeCount, photoCount } = await Store.importBackup(file);
      toast(`読み込みました（場所${placeCount}か所・写真${photoCount}枚）`);
      go('#/home');
    } catch (err) {
      console.error(err);
      toast(err.message === 'format' ? 'みちノートのバックアップファイルではないようです' : '読み込めませんでした');
    }
  }
});

// 写真の拡大を閉じる
$('#zoom').addEventListener('click', closeZoom);

// アプリを閉じる・裏に回すときは、書きかけを保存
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSaves(); });
window.addEventListener('pagehide', () => flushSaves());

// アプリ内で移動したことを覚えておく（「戻る」をアプリの中だけで使うため）
window.addEventListener('hashchange', () => {
  if (!history.state) history.replaceState({ inApp: true }, '');
  render();
});

// ===================== 起動 =====================

(async () => {
  try {
    await Store.load();
  } catch (e) {
    console.error(e);
    setView('<section class="card"><p>データを読み込めませんでした。アプリを開き直してみてください。</p></section>');
    return;
  }
  // スマホが勝手にデータを消さないようにお願いする（対応している場合だけ）
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
