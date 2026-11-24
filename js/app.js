import * as api from './api.js';
import { createStore, isDemo } from './store.js';

// ---------- утилиты ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const fmtLen = n => !n ? '' : n < 60 ? `${n} мин` : `${Math.floor(n / 60)} ч${n % 60 ? ' ' + (n % 60) + ' мин' : ''}`;
const fmtDate = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const nonNull = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many}`;
};

const I = {
  swipe: '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="3" width="12" height="16" rx="2"/><path d="M19 7v11a3 3 0 0 1-3 3H8"/></svg>',
  me: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
  heart: '<svg class="i" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.6-9.3C.9 7.6 3.3 4 6.9 4c2.2 0 3.7 1.2 5.1 3 1.4-1.8 2.9-3 5.1-3 3.6 0 6 3.6 4.5 7.2-2.1 4.7-9.6 9.3-9.6 9.3z"/></svg>',
  both: '<svg class="i" viewBox="0 0 24 24"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
  list: '<svg class="i" viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  gear: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  undo: '<svg class="i" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  info: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M12 20.5s-7.5-4.6-9.6-9.3C.9 7.6 3.3 4 6.9 4c2.2 0 3.7 1.2 5.1 3 1.4-1.8 2.9-3 5.1-3 3.6 0 6 3.6 4.5 7.2-2.1 4.7-9.6 9.3-9.6 9.3z"/></svg>',
  share: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
};

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
const fail = e => { console.error(e); toast(e?.message || 'Что-то пошло не так'); };

// ---------- состояние ----------
const store = createStore();
const known = new Map();                       // все встреченные фильмы (колода, поиск)
const remember = list => { list.forEach(m => m && m.id && known.set(m.id, m)); return list; };
const getMovie = id => store.movie(id) || known.get(id);

const state = {
  tab: LS.get('kv_tab', 'swipe'),
  seg: 'search',
  view: LS.get('kv_view', 'grid'),
  deck: [],
  history: [],
  loading: false,
  exhausted: false,
  filters: LS.get('kv_filters', { source: 'popular', genre: '', ratingFrom: 6, yearFrom: 1990 }),
  pages: LS.get('kv_pages', {}),
  searchQ: '',
  searchRes: null,
  searching: false,
  dragging: false,
};

if (!api.SOURCES.some(x => x.id === state.filters.source)) state.filters = { source: 'popular' };

const partnerName = () => store.partner?.name || 'Партнёр';
const TABS = [
  { id: 'swipe', label: () => 'Свайпы', title: () => 'Что смотрим?', icon: I.swipe },
  { id: 'mine', label: () => 'Мои', title: () => 'Хочу посмотреть', icon: I.me },
  { id: 'partner', label: partnerName, title: () => store.partner ? `Хочет ${partnerName()}` : 'Партнёр', icon: I.heart },
  { id: 'together', label: () => 'Общие', title: () => 'Совпадения', icon: I.both },
  { id: 'list', label: () => 'Список', title: () => 'Наши фильмы', icon: I.list },
];

// ---------- старт ----------
async function boot() {
  registerSW();
  let ok = false;
  try { ok = await store.init(); }
  catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="onb"><div class="onb-logo">😵</div><h1>Нет связи</h1><p class="lead">${h(e.message || e)}</p><button class="btn primary" onclick="location.reload()">Повторить</button></div>`;
    return;
  }
  if (ok) startApp(); else renderOnboarding();
}

function startApp() {
  if (new URLSearchParams(location.search).has('join')) history.replaceState(null, '', location.pathname);
  $('#app').innerHTML = `
    <header class="top">
      <h1 id="title"></h1>
      <div class="top-right">
        ${isDemo() ? '<span class="pill">демо</span>' : ''}
        <button class="icon-btn" id="settingsBtn" aria-label="Настройки">${I.gear}</button>
      </div>
    </header>
    <main id="view"></main>
    <nav class="tabbar" id="tabbar"></nav>`;
  $('#settingsBtn').onclick = openSettings;
  store.on(onStoreEvent);
  render();
  fillDeck();
}

function onStoreEvent(evt) {
  if (evt.newMatch) {
    const m = store.movie(evt.kp);
    if (m) showMatch(m, true);
  } else if (evt.type === 'vote' && evt.fromPartner && store.partnerVote(evt.kp) === true && store.myVote(evt.kp) === undefined) {
    const m = store.movie(evt.kp);
    if (m) toast(`${partnerName()} хочет «${m.title}»`);
  }
  if (evt.type === 'members' && evt.joined) toast(`${partnerName()} теперь с тобой в паре 💞`);
  scheduleRender();
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (state.tab === 'swipe') { renderTabbar(); if (!state.dragging) renderDeck(); }
    else render();
  });
}

function setTab(id) {
  state.tab = id;
  LS.set('kv_tab', id);
  render();
  $('#view').scrollTop = 0;
}

function renderTabbar() {
  const pending = store.pendingForMe().length;
  const matches = store.partner ? store.matches().length : 0;
  $('#tabbar').innerHTML = TABS.map(t => {
    const badge = t.id === 'partner' && pending ? pending : t.id === 'together' && matches ? matches : 0;
    return `<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">
      ${t.icon}<span class="l">${h(t.label())}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
  }).join('');
  $$('#tabbar .tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $('#title').textContent = TABS.find(t => t.id === state.tab).title();
}

function render() {
  renderTabbar();
  const view = $('#view');
  view.classList.toggle('no-scroll', state.tab === 'swipe');
  ({ swipe: renderSwipe, mine: () => renderLiked('mine'), partner: () => renderLiked('partner'), together: renderTogether, list: renderList })[state.tab]();
}

// =====================================================================
//                               СВАЙПЫ
// =====================================================================

function renderSwipe() {
  const f = state.filters;
  $('#view').innerHTML = `
    <div class="swipe">
      <div class="chips">
        ${api.SOURCES.map(s => `<button class="chip ${f.source === s.id ? 'active' : ''}" data-src="${s.id}">${h(s.label)}</button>`).join('')}
      </div>
      <div class="deck" id="deck"></div>
      <div class="actions">
        <button class="act small" id="undoBtn" aria-label="Вернуть прошлую карточку">${I.undo}</button>
        <button class="act nope" id="nopeBtn" aria-label="Не хочу">${I.x}</button>
        <button class="act like" id="likeBtn" aria-label="Хочу">${I.heartFill}</button>
        <button class="act small" id="infoBtn" aria-label="Подробнее">${I.info}</button>
      </div>
    </div>`;
  $$('.chip[data-src]').forEach(b => b.onclick = () => setSource(b.dataset.src));
  $('.chip.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#likeBtn').onclick = () => swipeOut(true);
  $('#nopeBtn').onclick = () => swipeOut(false);
  $('#undoBtn').onclick = undo;
  $('#infoBtn').onclick = () => state.deck[0] && openMovie(state.deck[0].id);
  renderDeck();
}

function setSource(src) {
  state.filters = { ...state.filters, source: src };
  LS.set('kv_filters', state.filters);
  resetDeck();
}

function resetDeck() {
  state.deck = [];
  state.exhausted = false;
  if (state.tab === 'swipe') renderSwipe();
  fillDeck();
}

const sourceKey = () => state.filters.source;

async function fillDeck() {
  if (state.loading) return;
  state.loading = true;
  if (!state.deck.length && state.tab === 'swipe') renderDeck();
  try {
    let guard = 0, added = 0;
    const seen = new Set(state.deck.map(m => m.id));
    while (state.deck.length < 8 && guard++ < 6) {
      const key = sourceKey();
      const page = (state.pages[key] || 0) + 1;
      const { items, totalPages } = await api.deckPage(state.filters, page);
      if (key !== sourceKey()) return;               // фильтр сменили во время загрузки
      remember(items);
      const last = page >= totalPages || !items.length;
      state.pages[key] = last ? 0 : page;
      LS.set('kv_pages', state.pages);
      for (const m of items) {
        if (seen.has(m.id) || store.myVote(m.id) !== undefined || store.isWatched(m.id)) continue;
        seen.add(m.id);
        state.deck.push(m);
        added++;
      }
      if (last) { if (!added) state.exhausted = true; break; }
    }
  } catch (e) { fail(e); }
  finally {
    state.loading = false;
    if (state.tab === 'swipe' && !state.dragging) renderDeck();
  }
}

function renderDeck() {
  const deck = $('#deck');
  if (!deck) return;
  // убираем уже оценённое, а предложения партнёра ставим в начало
  state.deck = state.deck.filter(m => store.myVote(m.id) === undefined && !store.isWatched(m.id));
  const inDeck = new Set(state.deck.map(m => m.id));
  const pending = store.pendingForMe().filter(m => m && !inDeck.has(m.id));
  if (pending.length) state.deck.unshift(...pending);

  $('#undoBtn').disabled = !state.history.length;
  const top = state.deck.slice(0, 3);
  $('#likeBtn').disabled = $('#nopeBtn').disabled = $('#infoBtn').disabled = !top.length;

  if (!top.length) {
    deck.innerHTML = state.loading
      ? '<div class="deck-empty"><div class="spinner"></div>Подбираю фильмы…</div>'
      : `<div class="deck-empty"><div class="big">🎞️</div><b>Карточки закончились</b>
         <span>${state.exhausted ? 'В этой подборке вы всё оценили. Выбери другую сверху.' : 'Загрузить ещё?'}</span>
         <button class="btn small primary" id="moreBtn">${state.exhausted ? 'Начать подборку заново' : 'Ещё фильмов'}</button></div>`;
    const more = $('#moreBtn');
    if (more) more.onclick = () => { state.exhausted = false; fillDeck(); };
    return;
  }
  deck.innerHTML = top.map((m, i) => cardHTML(m, i)).reverse().join('');
  bindSwipe(deck.querySelector('.card.top'));
}

function posterHTML(src, alt = '') {
  return src
    ? `<img src="${h(src)}" alt="${h(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:'🎬'}))">`
    : '<div class="noimg">🎬</div>';
}

function ratingsHTML(m) {
  const out = [];
  if (m.kp) out.push(`<span class="rt kp">КП ${m.kp.toFixed(1)}</span>`);
  if (m.imdb) out.push(`<span class="rt">IMDb ${m.imdb.toFixed(1)}</span>`);
  return out.length ? `<div class="ratings">${out.join('')}</div>` : '';
}

function yearsOf(m) {
  if (!api.isSeries(m) || !m.startYear) return m.year;
  if (m.endYear && m.endYear !== m.startYear) return `${m.startYear}–${m.endYear}`;
  return m.completed === false ? `${m.startYear}–…` : m.startYear;
}
function metaLine(m, { genres = 2, countries = 0 } = {}) {
  const parts = [yearsOf(m)];
  if (api.isSeries(m)) {
    if (m.seasons) parts.push(plural(m.seasons, 'сезон', 'сезона', 'сезонов'));
    if (m.episodes) parts.push(plural(m.episodes, 'серия', 'серии', 'серий'));
  }
  if (genres) parts.push(m.genres?.slice(0, genres).join(', '));
  if (countries) parts.push(m.countries?.slice(0, countries).join(', '));
  if (!api.isSeries(m)) parts.push(fmtLen(m.length));
  return parts.filter(Boolean).join(' · ');
}
const typeBadge = (m, cls = '') => `<span class="type-badge ${api.isSeries(m) ? 'series' : ''} ${cls}">${api.typeLabel(m)}</span>`;

// подгружаем сезоны/серии для сериала и дорисовываем строки
const seasonsLoading = new Set();
function ensureSeasons(m) {
  if (!api.isSeries(m) || m.seasons || seasonsLoading.has(m.id)) return;
  seasonsLoading.add(m.id);
  api.seasons(m.id).then(info => {
    if (!info) return;
    Object.assign(m, info);
    remember([m]);
    if (store.movies.has(m.id)) store.updateMovieData(m.id, info);
    $$(`[data-meta="${m.id}"]`).forEach(el => el.textContent = metaLine(m, { genres: el.tagName === 'SMALL' ? 1 : 2 }));
    $$(`[data-meta-sheet="${m.id}"]`).forEach(el => el.textContent = metaLine(m, { genres: 0, countries: 2 }));
  }).catch(e => console.warn(e)).finally(() => seasonsLoading.delete(m.id));
}

function cardHTML(m, i) {
  const row = store.movies.get(m.id);
  const suggested = row?.manual && row.added_by && row.added_by !== store.me.id;
  const partnerWants = store.partnerVote(m.id) === true;
  if (i < 2) ensureSeasons(m);
  return `<div class="card ${i === 0 ? 'top' : i === 1 ? 'behind' : 'behind2'}" data-id="${m.id}">
    ${posterHTML(m.posterBig || m.poster, m.title).replace('loading="lazy"', 'loading="eager"')}
    ${suggested ? `<div class="suggested">💌 Предложено: ${h(partnerName())}</div>` : partnerWants ? `<div class="suggested">💌 ${h(partnerName())} хочет</div>` : ''}
    ${typeBadge(m, 'on-card')}
    <div class="stamp like">ХОЧУ</div><div class="stamp nope">НЕТ</div>
    <div class="card-info">
      <h2>${h(m.title)}</h2>
      <div class="sub" data-meta="${m.id}">${h(metaLine(m))}</div>
      ${ratingsHTML(m)}
      ${m.description ? `<div class="desc">${h(m.description)}</div>` : ''}
    </div>
  </div>`;
}

function bindSwipe(card) {
  if (!card) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false, pid = null;
  const like = card.querySelector('.stamp.like'), nope = card.querySelector('.stamp.nope');
  const next = card.previousElementSibling;   // карточка под верхней

  card.addEventListener('pointerdown', e => {
    active = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    state.dragging = true;
    card.setPointerCapture(pid);
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', e => {
    if (!active || e.pointerId !== pid) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px, ${dy * 0.4}px) rotate(${dx / 18}deg)`;
    like.style.opacity = Math.max(0, Math.min(1, dx / 90));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    if (next) {
      const p = Math.min(1, Math.abs(dx) / 120);
      next.style.transition = 'none';
      next.style.transform = `scale(${0.95 + 0.05 * p}) translateY(${14 - 14 * p}px)`;
    }
  });
  const end = e => {
    if (!active || e.pointerId !== pid) return;
    active = false;
    state.dragging = false;
    const w = card.offsetWidth || 300;
    if (Math.abs(dx) > Math.min(110, w * 0.3)) return swipeOut(dx > 0, dx, dy);
    card.style.transition = '';
    card.style.transform = '';
    like.style.opacity = nope.style.opacity = 0;
    if (next) { next.style.transition = ''; next.style.transform = ''; }
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && e.type === 'pointerup') openMovie(+card.dataset.id);
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

let flying = false;
function swipeOut(liked, dx = 0, dy = 0) {
  const card = $('#deck .card.top');
  if (!card || flying) return;
  flying = true;
  const dir = liked ? 1 : -1;
  card.style.transition = 'transform .32s ease-out, opacity .32s';
  card.querySelector(liked ? '.stamp.like' : '.stamp.nope').style.opacity = 1;
  card.style.transform = `translate(${dir * window.innerWidth * 1.2}px, ${dy * 0.4 + 40}px) rotate(${dir * 28}deg)`;
  card.style.opacity = '0.6';
  setTimeout(() => { flying = false; decide(liked); }, 230);
}

function decide(liked) {
  const m = state.deck.shift();
  if (!m) return;
  state.history.push(m);
  if (state.history.length > 30) state.history.shift();
  store.setVote(m, liked).catch(fail);
  const match = liked && store.partnerVote(m.id) === true;
  renderTabbar();
  renderDeck();
  if (match) showMatch(m);
  if (liked) enrich(m);
  if (state.deck.length < 5) fillDeck();
}

function undo() {
  const m = state.history.pop();
  if (!m) return;
  store.clearVote(m.id).catch(fail);
  state.deck.unshift(m);
  renderTabbar();
  renderDeck();
}

// подтягиваем длительность и описание для лайкнутых (нужно рулетке)
async function enrich(m) {
  if (api.isSeries(m) && !m.seasons) {
    api.seasons(m.id).then(info => info && store.updateMovieData(m.id, info)).catch(() => {});
  }
  if ((m.length || api.isSeries(m)) && m.description && m.countries?.length) return;
  try {
    const d = await api.details(m.id);
    if (!d) return;
    const extra = nonNull({ length: d.length, description: d.description, countries: d.countries, imdb: d.imdb, kp: d.kp, posterBig: d.posterBig, type: d.type, startYear: d.startYear, endYear: d.endYear, completed: d.completed });
    remember([{ ...m, ...extra }]);
    await store.updateMovieData(m.id, extra);
  } catch (e) { console.warn('enrich', e); }
}

// =====================================================================
//                               СПИСКИ
// =====================================================================

function tileHTML(m, opts = {}) {
  if (!m) return '';
  let tag = '';
  if (opts.kind === 'partner') {
    const v = store.myVote(m.id);
    tag = store.isMatch(m.id) ? '<span class="tag both">♥ вместе</span>' : v === undefined ? '<span class="tag new">оцени</span>' : v === false ? '<span class="tag">ты против</span>' : '';
  } else if (opts.kind === 'mine' && store.isMatch(m.id)) {
    tag = '<span class="tag both">♥ вместе</span>';
  } else if (opts.kind === 'pool') {
    const dot = v => v === true ? 'y' : v === false ? 'n' : '';
    const ini = s => h((s || '?')[0].toUpperCase());
    tag = `<div class="dots"><span class="dot ${dot(store.myVote(m.id))}">${ini(store.me.name)}</span>${store.partner ? `<span class="dot ${dot(store.partnerVote(m.id))}">${ini(store.partner.name)}</span>` : ''}</div>`;
  }
  const add = opts.kind === 'search'
    ? (store.myVote(m.id) === true ? '<span class="add done">✓</span>' : `<span class="add" data-add="${m.id}" role="button" aria-label="Добавить">+</span>`)
    : '';
  return `<button class="tile" data-open="${m.id}">
    <div class="pic">${posterHTML(m.poster || m.posterBig, m.title)}${tag}${add}
      ${m.kp ? `<span class="rt kp kpr">${m.kp.toFixed(1)}</span>` : ''}${typeBadge(m, 'on-pic')}</div>
    <div class="tile-text">
      <b>${h(m.title)}</b>
      <small data-meta="${m.id}">${h(metaLine(m, { genres: 1 }))}</small>
      <div class="tile-badges">${typeBadge(m)}${m.kp ? `<span class="rt kp">КП ${m.kp.toFixed(1)}</span>` : ''}${m.imdb ? `<span class="rt">IMDb ${m.imdb.toFixed(1)}</span>` : ''}</div>
    </div>
  </button>`;
}

function bindTiles(root) {
  $$('[data-add]', root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const m = getMovie(+b.dataset.add);
    if (!m) return;
    store.addManual(m).then(() => enrich(m)).catch(fail);
    b.className = 'add done'; b.textContent = '✓'; b.removeAttribute('data-add');
    toast(store.partner ? `Добавлено — ${partnerName()} увидит его в колоде` : 'Добавлено в твой список');
    renderTabbar();
  });
  $$('[data-open]', root).forEach(b => b.onclick = () => openMovie(+b.dataset.open));
  $$('[data-view]', root).forEach(b => b.onclick = () => {
    state.view = b.dataset.view; LS.set('kv_view', state.view);
    const y = $('#view').scrollTop; render(); $('#view').scrollTop = y;
  });
}

function gridHTML(list, kind) {
  return `<div class="${state.view === 'list' ? 'rows' : 'grid'}">${list.map(m => tileHTML(m, { kind })).join('')}</div>`;
}
function countRow(text) {
  return `<div class="count-row"><div class="count">${text}</div>
    <div class="vt glass" role="group" aria-label="Вид">
      <button data-view="grid" class="${state.view === 'grid' ? 'active' : ''}" aria-label="Сеткой"><svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></button>
      <button data-view="list" class="${state.view === 'list' ? 'active' : ''}" aria-label="Списком"><svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="5" height="7" rx="1.5"/><path d="M12 6h8M12 9h5"/><rect x="4" y="13" width="5" height="7" rx="1.5"/><path d="M12 15h8M12 18h5"/></svg></button>
    </div></div>`;
}

function inviteHTML() {
  return `<div class="invite">
    <div style="font-size:42px">💌</div>
    <h3 style="margin:8px 0 4px">Позови вторую половинку</h3>
    <div style="color:var(--muted);font-size:15px">Отправь ссылку или код. Когда партнёр присоединится, тут появятся его фильмы, а во вкладке «Общие» — совпадения.</div>
    <div class="code">${h(store.couple.code)}</div>
    ${isDemo() ? '<div class="hint" style="margin:0">В демо-режиме приглашение не работает: сначала подключи Supabase.</div>' : `<button class="btn primary" id="inviteBtn">${I.share} Отправить приглашение</button>`}
  </div>`;
}

function renderLiked(kind) {
  const view = $('#view');
  if (kind === 'partner' && !store.partner) {
    view.innerHTML = `<div class="pad">${inviteHTML()}</div>`;
    const b = $('#inviteBtn'); if (b) b.onclick = shareInvite;
    return;
  }
  const list = store.likedBy(kind === 'mine' ? store.me.id : store.partner.id);
  if (!list.length) {
    view.innerHTML = kind === 'mine'
      ? `<div class="empty"><div class="big">🍿</div><h3>Пока пусто</h3>Свайпай вправо то, что хочешь посмотреть, или найди фильм во вкладке «Список».</div>`
      : `<div class="empty"><div class="big">💭</div><h3>У ${h(partnerName())} пока пусто</h3>Фильмы, которые понравятся партнёру, появятся здесь.</div>`;
    return;
  }
  const unrated = kind === 'partner' ? list.filter(m => store.myVote(m.id) === undefined).length : 0;
  const matches = list.filter(m => store.isMatch(m.id)).length;
  const info = [plural(list.length, 'фильм', 'фильма', 'фильмов')];
  if (matches && store.partner) info.push(`совпадений: ${matches}`);
  if (unrated) info.push(`без твоей оценки: ${unrated}`);
  view.innerHTML = `<div class="pad">${countRow(info.join(' · '))}${gridHTML(list, kind)}</div>`;
  bindTiles(view);
}

function renderTogether() {
  const view = $('#view');
  if (!store.partner) {
    view.innerHTML = `<div class="pad">${inviteHTML()}</div>`;
    const b = $('#inviteBtn'); if (b) b.onclick = shareInvite;
    return;
  }
  const list = store.matches();
  view.innerHTML = `<div class="pad">
    <button class="roulette-card" id="rouletteBtn">
      <div class="big">🎲</div>
      <div><b>Выбери за нас</b><span>${list.length ? `Случайный фильм из ${plural(list.length, 'совпадения', 'совпадений', 'совпадений')}` : 'Случайный фильм из наших лайков'}</span></div>
    </button>
    ${list.length
      ? `${countRow(`${plural(list.length, 'фильм', 'фильма', 'фильмов')}, которые хотите оба`)}${gridHTML(list, 'together')}`
      : `<div class="empty" style="padding-top:20px"><div class="big">💞</div><h3>Совпадений пока нет</h3>Свайпайте оба: когда вам понравится один и тот же фильм, он окажется здесь.</div>`}
  </div>`;
  $('#rouletteBtn').onclick = openRoulette;
  bindTiles(view);
}

function renderList() {
  const view = $('#view');
  const segs = [['search', 'Поиск'], ['watched', 'Просмотрено']];
  if (!segs.some(([id]) => id === state.seg)) state.seg = 'search';
  view.innerHTML = `
    <div class="seg glass">${segs.map(([id, l]) => `<button data-seg="${id}" class="${state.seg === id ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="pad" id="segBody"></div>`;
  $$('[data-seg]').forEach(b => b.onclick = () => { state.seg = b.dataset.seg; renderList(); });
  const body = $('#segBody');

  if (state.seg === 'search') {
    body.innerHTML = `
      <form class="searchbar" id="searchForm">
        <input class="field" id="searchIn" type="search" enterkeyhint="search" placeholder="Название фильма" value="${h(state.searchQ)}" autocomplete="off">
        <button class="btn small primary" type="submit">Найти</button>
      </form>
      <div id="searchRes"></div>`;
    const res = $('#searchRes');
    if (state.searching) res.innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>';
    else if (state.searchRes && !state.searchRes.length) res.innerHTML = '<div class="empty">Ничего не нашлось 🤷</div>';
    else if (state.searchRes) res.innerHTML = countRow(`Найдено: ${state.searchRes.length}`) + gridHTML(state.searchRes, 'search');
    else res.innerHTML = `<div class="empty" style="padding-top:24px"><div class="big">🔎</div>Найди фильм, который давно хотел посмотреть, и нажми «+». ${store.partner ? `${h(partnerName())} увидит его первым в своей колоде.` : ''}</div>`;
    bindTiles(res);
    $('#searchForm').onsubmit = async e => {
      e.preventDefault();
      const q = $('#searchIn').value.trim();
      if (!q) return;
      $('#searchIn').blur();
      state.searchQ = q; state.searching = true; renderList();
      try { state.searchRes = remember(await api.search(q)); }
      catch (err) { fail(err); state.searchRes = null; }
      state.searching = false;
      if (state.tab === 'list' && state.seg === 'search') renderList();
    };
  }

  if (state.seg === 'watched') {
    const list = store.watchedList();
    body.innerHTML = list.length
      ? `<div class="count">${plural(list.length, 'фильм', 'фильма', 'фильмов')} посмотрели вместе</div>` + list.map(m => `
        <button class="watched-row" data-open="${m.id}">
          ${m.poster ? `<img src="${h(m.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
          <div class="meta"><b>${h(m.title)}</b><small>${fmtDate(m.watched.watched_at)}</small>${scoresHTML(m.watched)}</div>
        </button>`).join('')
      : `<div class="empty"><div class="big">🎬</div><h3>Ещё ничего не отмечено</h3>Открой фильм и нажми «Посмотрели», чтобы он ушёл из списков и попал сюда с вашими оценками.</div>`;
    bindTiles(body);
  }
}

function scoresHTML(w) {
  const r = w?.ratings || {};
  const parts = store.members.filter(mb => r[mb.id]).map(mb => `<span class="score">${h(mb.id === store.me.id ? 'Ты' : mb.name)} <b>${r[mb.id]}</b></span>`);
  return parts.length ? `<div class="scores">${parts.join('')}</div>` : '';
}

// =====================================================================
//                          КАРТОЧКА ФИЛЬМА
// =====================================================================

let openMovieId = null;

function openMovie(id) {
  const m = getMovie(id);
  if (!m) return;
  openMovieId = id;
  const sh = openSheet('', () => { openMovieId = null; });
  paintMovie(sh, m);
  if (!m.description || !m.length || !m.countries?.length) {
    api.details(id).then(d => {
      if (!d) return;
      const extra = nonNull(d);
      const merged = { ...m, ...extra, poster: m.poster || extra.poster };
      remember([merged]);
      if (store.movies.has(id)) store.updateMovieData(id, nonNull({ length: d.length, description: d.description, countries: d.countries, imdb: d.imdb }));
      if (openMovieId === id && sh.isConnected) paintMovie(sh, getMovie(id) || merged);
    }).catch(e => console.warn(e));
  }
}

function voteLabel(v, self = false) {
  return v === true ? `<span class="y">♥ ${self ? 'Хочу' : 'Хочет'}</span>` : v === false ? `<span class="n">✕ ${self ? 'Не хочу' : 'Не хочет'}</span>` : '<span class="u">Ещё не оценивал(а)</span>';
}

function paintMovie(sh, m) {
  const body = $('.sheet-body', sh);
  const my = store.myVote(m.id);
  const w = store.watched.get(m.id);
  const meta = metaLine(m, { genres: 0, countries: 2 });
  ensureSeasons(m);
  body.innerHTML = `
    <div class="mv-hero">
      <div class="poster">${posterHTML(m.posterBig || m.poster, m.title)}</div>
      <div class="mv-head">
        ${typeBadge(m)}
        <h2>${h(m.title)}</h2>
        ${m.original ? `<div class="mv-orig">${h(m.original)}</div>` : ''}
        <div class="mv-meta" data-meta-sheet="${m.id}">${h(meta)}</div>
        ${ratingsHTML(m)}
        ${store.isMatch(m.id) ? '<div class="ratings"><span class="rt" style="background:var(--like)">♥ Совпадение</span></div>' : ''}
      </div>
    </div>
    ${m.genres?.length ? `<div class="genres">${m.genres.map(g => `<span>${h(g)}</span>`).join('')}</div>` : ''}
    ${m.description ? `<p class="mv-desc">${h(m.description)}</p>` : '<p class="mv-desc" style="color:var(--muted)">Описание загружается…</p>'}
    <div class="who">
      <div><small>Ты</small>${voteLabel(my, true)}</div>
      <div><small>${h(partnerName())}</small>${store.partner ? voteLabel(store.partnerVote(m.id)) : '<span class="u">Ещё не в паре</span>'}</div>
    </div>
    ${w ? `<h3>Посмотрели ${fmtDate(w.watched_at)}</h3>${scoresHTML(w) || '<div class="count">Оценок пока нет</div>'}
      <div class="stack" style="margin-top:12px">
        <button class="btn" data-act="rate">⭐ ${w.ratings?.[store.me.id] ? 'Изменить мою оценку' : 'Поставить оценку'}</button>
        <button class="btn ghost" data-act="unwatch">Вернуть в списки</button>
      </div>`
    : `<div class="vote-row">
        <button class="btn ${my === false ? 'on-nope' : ''}" data-act="nope">✕ Не хочу</button>
        <button class="btn ${my === true ? 'on-like' : ''}" data-act="like">♥ Хочу</button>
      </div>
      <div class="stack"><button class="btn" data-act="watched">🎬 Посмотрели</button></div>`}
    <div class="stack" style="margin-top:10px">
      <a class="btn ghost" href="${api.kpUrl(m.id)}" target="_blank" rel="noopener">Открыть на Кинопоиске ↗</a>
    </div>`;

  const after = () => { render(); if (sh.isConnected) paintMovie(sh, getMovie(m.id) || m); };
  $$('[data-act]', body).forEach(b => b.onclick = async () => {
    const act = b.dataset.act;
    try {
      if (act === 'like' || act === 'nope') {
        const liked = act === 'like';
        if (my === liked) await store.clearVote(m.id);
        else {
          const p = store.setVote(m, liked);
          if (liked && store.partnerVote(m.id) === true) showMatch(m);
          if (liked) enrich(m);
          await p;
        }
        state.deck = state.deck.filter(d => d.id !== m.id);
        after();
      }
      if (act === 'watched' || act === 'rate') return paintRate(sh, m);
      if (act === 'unwatch') { await store.unwatch(m.id); after(); toast('Фильм вернулся в списки'); }
    } catch (e) { fail(e); }
  });
}

function paintRate(sh, m) {
  const body = $('.sheet-body', sh);
  const cur = store.watched.get(m.id)?.ratings?.[store.me.id];
  body.innerHTML = `
    <h2>Как тебе «${h(m.title)}»?</h2>
    <div class="count">Оценка видна вам обоим. ${h(partnerName())} поставит свою у себя.</div>
    <div class="rate-grid">${Array.from({ length: 10 }, (_, i) => `<button data-r="${i + 1}" class="${cur === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
    <button class="btn ghost" data-r="0">${store.watched.has(m.id) ? 'Назад' : 'Посмотрели, оценю позже'}</button>`;
  $$('[data-r]', body).forEach(b => b.onclick = async () => {
    const r = +b.dataset.r;
    try {
      if (r || !store.watched.has(m.id)) await store.setWatched(m, r || null);
      if (r) toast(r >= 8 ? 'Отличный вечер 🍿' : 'Оценка сохранена');
      render();
      if (sh.isConnected) paintMovie(sh, getMovie(m.id) || m);
    } catch (e) { fail(e); }
  });
}

// =====================================================================
//                              РУЛЕТКА
// =====================================================================

function openRoulette() {
  const opts = LS.get('kv_roulette', { pool: 'matches', len: 0 });
  const sh = openSheet(`
    <h2>🎲 Что смотрим сегодня?</h2>
    <div class="opt-label">Из чего выбирать</div>
    <div class="seg in-sheet" id="rPool">
      <button data-v="matches">Общие</button><button data-v="any">Все наши лайки</button>
    </div>
    <div class="opt-label">Сколько есть времени</div>
    <div class="seg in-sheet" id="rLen">
      <button data-v="0">Любая</button><button data-v="100">до 1 ч 40</button><button data-v="125">до 2 ч</button>
    </div>
    <div class="wheel" id="wheel"><div class="noimg">🎲</div></div>
    <div class="wheel-title" id="wheelTitle"><small>Жми «Крутить»</small></div>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" id="spinBtn">Крутить</button>
    </div>`);
  const paintSeg = () => {
    $$('#rPool button', sh).forEach(b => b.classList.toggle('active', b.dataset.v === opts.pool));
    $$('#rLen button', sh).forEach(b => b.classList.toggle('active', +b.dataset.v === opts.len));
  };
  $$('#rPool button', sh).forEach(b => b.onclick = () => { opts.pool = b.dataset.v; LS.set('kv_roulette', opts); paintSeg(); });
  $$('#rLen button', sh).forEach(b => b.onclick = () => { opts.len = +b.dataset.v; LS.set('kv_roulette', opts); paintSeg(); });
  paintSeg();

  let spinning = false;
  $('#spinBtn', sh).onclick = () => {
    if (spinning) return;
    let list = opts.pool === 'matches' ? store.matches()
      : [...new Map([...store.likedBy(store.me.id), ...store.likedBy(store.partner?.id)].map(m => [m.id, m])).values()];
    if (opts.len) list = list.filter(m => !m.length || m.length <= opts.len);
    const wheel = $('#wheel', sh), title = $('#wheelTitle', sh);
    if (!list.length) {
      title.innerHTML = `<small>${opts.pool === 'matches' ? 'Нет подходящих совпадений. Попробуй «Все наши лайки».' : 'Подходящих фильмов нет. Полайкайте карточки!'}</small>`;
      return;
    }
    spinning = true;
    wheel.className = 'wheel spinning';
    const pick = list[Math.floor(Math.random() * list.length)];
    const steps = Math.min(22, 8 + list.length * 2);
    let i = 0;
    const tick = () => {
      const m = i < steps - 1 ? list[Math.floor(Math.random() * list.length)] : pick;
      wheel.innerHTML = posterHTML(m.poster || m.posterBig, m.title);
      title.innerHTML = `<b>${h(m.title)}</b>`;
      i++;
      if (i < steps) setTimeout(tick, 50 + Math.pow(i / steps, 3) * 380);
      else {
        spinning = false;
        wheel.className = 'wheel landed';
        title.innerHTML = `<b>${h(pick.title)}</b><small>${h([pick.year, fmtLen(pick.length), pick.genres?.slice(0, 2).join(', ')].filter(Boolean).join(' · '))}</small>`;
        $('#spinBtn', sh).textContent = 'Ещё раз';
        if (!$('#goBtn', sh)) {
          const go = document.createElement('button');
          go.className = 'btn'; go.id = 'goBtn'; go.textContent = 'Подробнее';
          $('#spinBtn', sh).parentElement.prepend(go);
        }
        $('#goBtn', sh).onclick = () => { closeSheet(); setTimeout(() => openMovie(pick.id), 320); };
      }
    };
    tick();
  };
}

// =====================================================================
//                               МЭТЧ
// =====================================================================

function showMatch(m, fromPartner = false) {
  document.querySelector('.match')?.remove();
  const el = document.createElement('div');
  el.className = 'match';
  el.innerHTML = `
    <h1>Это мэтч!</h1>
    ${m.posterBig || m.poster ? `<img src="${h(m.posterBig || m.poster)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph">🎬</div>'}
    <p>${fromPartner ? `${h(partnerName())} тоже хочет` : 'Вы оба хотите'} посмотреть «<b>${h(m.title)}</b>»</p>
    <div class="row"><button class="btn ghost" data-x>Дальше</button><button class="btn primary" data-o>Подробнее</button></div>
    <div class="hearts">${Array.from({ length: 14 }, () => `<span style="left:${Math.random() * 100}%;animation-delay:${Math.random() * 0.9}s">${Math.random() > .5 ? '❤️' : '🍿'}</span>`).join('')}</div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  $('[data-x]', el).onclick = close;
  $('[data-o]', el).onclick = () => { close(); openMovie(m.id); };
}

// =====================================================================
//                             ШТОРКА
// =====================================================================

let sheetOnClose = null;
function openSheet(html, onClose) {
  closeSheet(true);
  const root = $('#sheetRoot');
  root.innerHTML = `<div class="backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="grabber"></div>
      <button class="close" aria-label="Закрыть">${I.x}</button>
      <div class="sheet-body">${html}</div>
    </div>`;
  const sh = $('.sheet', root), bd = $('.backdrop', root);
  sheetOnClose = onClose || null;
  requestAnimationFrame(() => { sh.classList.add('open'); bd.classList.add('open'); });
  bd.onclick = () => closeSheet();
  $('.close', sh).onclick = () => closeSheet();
  // закрытие свайпом вниз за верх шторки
  let sy = null;
  sh.addEventListener('touchstart', e => { sy = sh.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (sy == null) return;
    const d = e.touches[0].clientY - sy;
    if (d > 0) { sh.style.transition = 'none'; sh.style.transform = `translateY(${d}px)`; }
  }, { passive: true });
  sh.addEventListener('touchend', e => {
    if (sy == null) return;
    const d = e.changedTouches[0].clientY - sy;
    sh.style.transition = ''; sh.style.transform = '';
    sy = null;
    if (d > 110) closeSheet();
  });
  return sh;
}

function closeSheet(instant = false) {
  const root = $('#sheetRoot');
  if (!root.firstChild) return;
  const cb = sheetOnClose; sheetOnClose = null;
  cb?.();
  if (instant) { root.innerHTML = ''; return; }
  $('.sheet', root)?.classList.remove('open');
  $('.backdrop', root)?.classList.remove('open');
  const old = [...root.children];
  setTimeout(() => old.forEach(n => n.remove()), 300);
}

// =====================================================================
//                     НАСТРОЙКИ И ПРИГЛАШЕНИЕ
// =====================================================================

const inviteUrl = () => `${location.origin}${location.pathname}?join=${store.couple.code}`;

async function shareInvite() {
  const url = inviteUrl();
  const text = `Давай выбирать кино вместе 🍿 Код пары: ${store.couple.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Кино на вечер', text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Ссылка скопирована'); }
  } catch (e) { if (e.name !== 'AbortError') fail(e); }
}

function openSettings() {
  const sh = openSheet(`
    <h2>Настройки</h2>
    <label class="lbl">Твоё имя</label>
    <div class="row"><input class="field" id="nameIn" maxlength="20" value="${h(store.me.name)}"><button class="btn small" id="nameSave">OK</button></div>

    <label class="lbl">Пара</label>
    <div class="invite" style="margin:0;padding:16px">
      <div style="color:var(--muted);font-size:14px">${store.partner ? `Ты и ${h(partnerName())}` : 'Партнёр ещё не присоединился'}</div>
      <div class="code" style="margin:10px 0">${h(store.couple.code)}</div>
      ${isDemo() ? '' : `<button class="btn" id="shareBtn">${I.share} Поделиться приглашением</button>`}
    </div>

    <div class="stack" style="margin-top:20px">
      <button class="btn ghost" id="leaveBtn" style="color:var(--like)">${isDemo() ? 'Сбросить демо' : 'Выйти из пары на этом телефоне'}</button>
    </div>
`);

  $('#nameSave', sh).onclick = async () => {
    const v = $('#nameIn', sh).value.trim();
    if (!v) return;
    try { await store.rename(v); toast('Имя сохранено'); render(); } catch (e) { fail(e); }
  };
  const sb = $('#shareBtn', sh); if (sb) sb.onclick = shareInvite;
  $('#leaveBtn', sh).onclick = () => {
    const msg = isDemo() ? 'Удалить все демо-данные?' : 'Выйти из пары на этом устройстве? Данные останутся в базе, вернуться можно по коду пары.';
    if (!confirm(msg)) return;
    store.leave();
    localStorage.removeItem('kv_pages');
    location.reload();
  };
}

// =====================================================================
//                            ОНБОРДИНГ
// =====================================================================

function renderOnboarding() {
  const joinCode = isDemo() ? '' : (new URLSearchParams(location.search).get('join') || '');
  const app = $('#app');
  app.innerHTML = `<div class="onb">
    <div class="onb-logo">🍿</div>
    <h1>Кино на вечер</h1>
    <p class="lead">Свайпайте фильмы вдвоём, приложение найдёт совпадения и поможет выбрать.</p>
    <label class="lbl">Как тебя зовут?</label>
    <input class="field" id="nameIn" maxlength="20" placeholder="Имя" autocomplete="given-name">
    <div id="onbBody"></div>
    ${isDemo() ? '<div class="hint">Сейчас демо-режим: Supabase не подключён, данные хранятся только на этом устройстве, а партнёр имитируется. Инструкция по настройке — в README.</div>' : ''}
  </div>`;
  const body = $('#onbBody');
  const name = () => $('#nameIn').value.trim();
  const needName = () => { if (name()) return true; $('#nameIn').focus(); toast('Напиши своё имя'); return false; };
  const busy = (btn, on) => { btn.disabled = on; };

  const paintStart = () => {
    body.innerHTML = `
      ${joinCode ? '' : `<div style="height:16px"></div><button class="btn primary" id="createBtn">Создать нашу пару</button>`}
      ${isDemo() ? '' : `
        <div class="or">${joinCode ? 'тебя пригласили' : 'или'}</div>
        <div class="row">
          <input class="field" id="codeIn" placeholder="Код пары" value="${h(joinCode)}" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.1em">
          <button class="btn small ${joinCode ? 'primary' : ''}" id="joinBtn">Войти</button>
        </div>`}`;
    const cb = $('#createBtn');
    if (cb) cb.onclick = async () => {
      if (!needName()) return;
      busy(cb, true);
      try { await store.createCouple(name()); startApp(); } catch (e) { fail(e); busy(cb, false); }
    };
    const jb = $('#joinBtn');
    if (jb) jb.onclick = async () => {
      const code = $('#codeIn').value.trim();
      if (!code) return toast('Введи код пары');
      busy(jb, true);
      try {
        const found = await store.findCouple(code);
        if (!found) { toast('Пара с таким кодом не найдена'); busy(jb, false); return; }
        paintPick(found);
      } catch (e) { fail(e); busy(jb, false); }
    };
  };

  const paintPick = ({ couple, members }) => {
    body.innerHTML = `
      <div class="or">кто ты в этой паре?</div>
      <div class="member-pick">
        ${members.map(mb => `<button class="btn" data-mid="${mb.id}">Я — ${h(mb.name)}</button>`).join('')}
        ${members.length < 2 ? '<button class="btn primary" id="newMember">Я новый участник</button>' : ''}
        <button class="btn ghost" id="backBtn">Назад</button>
      </div>`;
    $$('[data-mid]', body).forEach(b => b.onclick = async () => {
      busy(b, true);
      try { if (await store.open(couple.id, b.dataset.mid)) startApp(); } catch (e) { fail(e); busy(b, false); }
    });
    const nm = $('#newMember');
    if (nm) nm.onclick = async () => {
      if (!needName()) return;
      busy(nm, true);
      try { await store.joinCouple(couple.id, name()); startApp(); } catch (e) { fail(e); busy(nm, false); }
    };
    $('#backBtn').onclick = paintStart;
  };

  paintStart();
}

// ---------- service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}

boot();
