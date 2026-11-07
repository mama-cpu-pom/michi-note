// 画面づくりの共通の道具（文字の安全な表示、日付の表示、お知らせ、写真の拡大など）

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// 入力された文字をそのまま画面に出しても壊れないようにする
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// '2026-11-07' → '2026年11月7日（土）'
function fmtDate(s, withYear = true) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${withYear ? y + '年' : ''}${m}月${d}日（${w}）`;
}

// 画面の下にふわっと出るお知らせ
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// メイン部分の中身を入れかえる
function setView(html) {
  const main = $('#main');
  main.innerHTML = html;
}

// 写真の小さい一覧（あとで loadThumbs() で中身を読みこむ）
function photoGrid(photoIds, field, placeId, editable = true) {
  return `<div class="photo-grid">
    ${photoIds.map(id => `<div class="photo">
      <img data-photo="${id}" alt="写真" data-act="zoom">
      ${editable ? `<button type="button" class="photo-del" data-act="del-photo" data-field="${field}" data-photo-id="${id}" aria-label="この写真を消す">×</button>` : ''}
    </div>`).join('')}
    ${editable ? `<label class="photo-add">
      <input type="file" accept="image/*" multiple data-act="add-photos" data-field="${field}" data-place="${placeId}">
      <span class="plus">＋</span><span>追加</span>
    </label>` : ''}
  </div>`;
}

// data-photo を持つ img に写真を読みこむ
function loadThumbs(root = document) {
  $$('img[data-photo]', root).forEach(async img => {
    const url = await Store.photoURL(img.dataset.photo);
    if (url) img.src = url;
  });
}

// 写真を画面いっぱいに出す
function zoomPhoto(src) {
  const box = $('#zoom');
  $('img', box).src = src;
  box.hidden = false;
}
function closeZoom() {
  $('#zoom').hidden = true;
  $('#zoom img').removeAttribute('src');
}

// 文字入力の自動保存。打つたびではなく、手が止まってから保存する。
// 画面を切りかえる前やアプリを閉じる前には flushSaves() で残りをすぐ保存する。
const pendingSaves = new Map();
function scheduleSave(key, fn, delay = 600) {
  const old = pendingSaves.get(key);
  if (old) clearTimeout(old.timer);
  const timer = setTimeout(() => { pendingSaves.delete(key); fn(); }, delay);
  pendingSaves.set(key, { timer, fn });
}
async function flushSaves() {
  const jobs = [...pendingSaves.values()];
  pendingSaves.clear();
  for (const j of jobs) { clearTimeout(j.timer); await j.fn(); }
}

// 「保存しました」の小さい表示
function showSaved() {
  const el = $('#saved');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(showSaved.t);
  showSaved.t = setTimeout(() => el.classList.remove('show'), 1500);
}

// テキストエリアの高さを中身に合わせる
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}
