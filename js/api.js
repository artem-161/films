// Кинопоиск (kinopoiskapiunofficial.tech) + встроенный набор для демо-режима.
import { CONFIG } from './config.js';

const BASE = 'https://kinopoiskapiunofficial.tech';
const CACHE_PREFIX = 'kp_cache:';
const DAY = 24 * 3600 * 1000;

export const getKey = () => localStorage.getItem('kp_key') || CONFIG.KP_API_KEY || '';
export const hasKey = () => !!getKey();

export const SOURCES = [
  { id: 'popular', label: 'Популярное', collection: 'TOP_POPULAR_MOVIES' },
  { id: 'top250', label: 'Топ-250', collection: 'TOP_250_MOVIES' },
  { id: 'series', label: 'Сериалы', collection: 'POPULAR_SERIES' },
  { id: 'dorama', label: 'Дорамы', query: { countries: 49, type: 'TV_SERIES', order: 'NUM_VOTE' } },
];

export const isSeries = m => !!m && ['TV_SERIES', 'MINI_SERIES', 'TV_SHOW'].includes(m.type);
export const typeLabel = m => ({ TV_SERIES: 'Сериал', MINI_SERIES: 'Мини-сериал', TV_SHOW: 'ТВ-шоу' }[m?.type] || 'Фильм');

const FALLBACK_GENRES = [
  [13, 'комедия'], [4, 'мелодрама'], [2, 'драма'], [1, 'триллер'], [6, 'фантастика'],
  [11, 'боевик'], [5, 'детектив'], [3, 'криминал'], [7, 'приключения'], [12, 'фэнтези'],
  [17, 'ужасы'], [18, 'мультфильм'], [19, 'семейный'], [8, 'биография'], [14, 'военный'],
].map(([id, genre]) => ({ id, genre }));

function cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > ttl) return null;
    return v;
  } catch { return null; }
}
function cacheSet(key, v) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v })); }
  catch {
    // переполнено — чистим кэш Кинопоиска целиком
    Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
  }
}

async function kp(path, ttl = DAY) {
  const cached = cacheGet(path, ttl);
  if (cached) return cached;
  let r;
  try {
    r = await fetch(BASE + path, { headers: { 'X-API-KEY': getKey(), 'Content-Type': 'application/json' } });
  } catch {
    throw new Error('Нет связи с Кинопоиском');
  }
  if (r.status === 401) throw new Error('Неверный ключ Кинопоиска');
  if (r.status === 402 || r.status === 429) throw new Error('Лимит запросов Кинопоиска на сегодня исчерпан');
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Кинопоиск ответил ошибкой ' + r.status);
  const v = await r.json();
  cacheSet(path, v);
  return v;
}

const num = v => {
  if (v == null || v === 'null' || String(v).includes('%')) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const parseLen = v => {
  if (v == null) return null;
  if (typeof v === 'number') return v || null;
  const m = String(v).match(/^(\d+):(\d+)$/);
  if (m) return +m[1] * 60 + +m[2];
  return num(v);
};

export function norm(x) {
  return {
    id: x.kinopoiskId ?? x.filmId,
    title: x.nameRu || x.nameEn || x.nameOriginal || 'Без названия',
    original: (x.nameOriginal || x.nameEn || '') !== (x.nameRu || '') ? (x.nameOriginal || x.nameEn || '') : '',
    year: parseInt(x.year) || null,
    poster: x.posterUrlPreview || x.posterUrl || '',
    posterBig: x.posterUrl || x.posterUrlPreview || '',
    kp: num(x.ratingKinopoisk ?? x.rating),
    imdb: num(x.ratingImdb),
    genres: (x.genres || []).map(g => g.genre).filter(Boolean),
    countries: (x.countries || []).map(c => c.country).filter(Boolean),
    length: parseLen(x.filmLength),
    description: x.description || x.shortDescription || '',
    type: x.type || 'FILM',
    startYear: x.startYear || null,
    endYear: x.endYear || null,
    completed: x.completed ?? null,
  };
}

// ---------- публичное API ----------

export async function deckPage(filters, page) {
  if (!hasKey()) return mockPage(filters, page);
  const src = SOURCES.find(s => s.id === filters.source) || SOURCES[0];
  const res = src.collection
    ? await kp(`/api/v2.2/films/collections?type=${src.collection}&page=${page}`)
    : await kp(`/api/v2.2/films?${new URLSearchParams({ ...src.query, page })}`);
  let items = (res?.items || []).map(norm).filter(m => m.id);
  if (src.id === 'dorama') items = items.filter(m => !m.genres.some(g => ['мультфильм', 'аниме', 'детский'].includes(g)));
  return { items, totalPages: res?.totalPages || 1 };
}

// количество сезонов и серий для сериала
export async function seasons(id) {
  if (!hasKey()) return null;
  const res = await kp(`/api/v2.2/films/${id}/seasons`, 3 * DAY);
  if (!res?.items?.length) return null;
  return { seasons: res.items.length, episodes: res.items.reduce((n, s) => n + (s.episodes?.length || 0), 0) };
}

export async function details(id) {
  if (!hasKey()) return MOCK.find(m => m.id === id) || null;
  const res = await kp(`/api/v2.2/films/${id}`, 7 * DAY);
  return res ? norm(res) : null;
}

export async function search(query) {
  query = query.trim();
  if (!query) return [];
  if (!hasKey()) {
    const q = query.toLowerCase();
    return MOCK.filter(m => (m.title + ' ' + m.original).toLowerCase().includes(q));
  }
  const res = await kp(`/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}&page=1`, DAY);
  return (res?.films || []).map(norm).filter(m => m.id);
}

export async function genres() {
  if (!hasKey()) return FALLBACK_GENRES;
  try {
    const res = await kp('/api/v2.2/films/filters', 30 * DAY);
    const list = (res?.genres || []).filter(g => g.genre);
    return list.length ? list : FALLBACK_GENRES;
  } catch { return FALLBACK_GENRES; }
}

export const kpUrl = id => `https://www.kinopoisk.ru/film/${id}/`;

// ---------- демо-набор ----------

const mk = (id, title, original, year, len, kpR, imdb, genres, countries, description) =>
  ({ id, title, original, year, length: len, kp: kpR, imdb, genres, countries, description,
     poster: '', posterBig: '', type: 'FILM' });  // id в демо приблизительные, поэтому без постеров

export const MOCK = [
  mk(326, 'Побег из Шоушенка', 'The Shawshank Redemption', 1994, 142, 9.1, 9.3, ['драма'], ['США'], 'Банкир, осуждённый за двойное убийство, годами строит свой тихий план в стенах тюрьмы.'),
  mk(435, 'Зелёная миля', 'The Green Mile', 1999, 189, 9.1, 8.6, ['драма', 'фэнтези', 'криминал'], ['США'], 'Надзиратель блока смертников встречает заключённого с необъяснимым даром.'),
  mk(448, 'Форрест Гамп', 'Forrest Gump', 1994, 142, 8.9, 8.8, ['драма', 'комедия', 'мелодрама'], ['США'], 'Простодушный парень проходит через полвека американской истории и любит одну девушку.'),
  mk(535341, '1+1', 'Intouchables', 2011, 112, 8.8, 8.5, ['драма', 'комедия', 'биография'], ['Франция'], 'Парализованный аристократ нанимает в сиделки парня из пригорода — и жизнь обоих меняется.'),
  mk(258687, 'Интерстеллар', 'Interstellar', 2014, 169, 8.7, 8.7, ['фантастика', 'драма', 'приключения'], ['США', 'Великобритания'], 'Экспедиция уходит через червоточину искать новый дом для человечества.'),
  mk(447301, 'Начало', 'Inception', 2010, 148, 8.7, 8.8, ['фантастика', 'боевик', 'триллер'], ['США', 'Великобритания'], 'Команда воров проникает в сны, чтобы не украсть идею, а внедрить её.'),
  mk(301, 'Матрица', 'The Matrix', 1999, 136, 8.5, 8.7, ['фантастика', 'боевик'], ['США'], 'Хакер узнаёт, что привычный мир — симуляция, и выбирает красную таблетку.'),
  mk(342, 'Криминальное чтиво', 'Pulp Fiction', 1994, 154, 8.6, 8.9, ['криминал', 'драма'], ['США'], 'Несколько переплетённых историй о бандитах, боксёре и одном чемоданчике.'),
  mk(361, 'Бойцовский клуб', 'Fight Club', 1999, 139, 8.7, 8.8, ['триллер', 'драма', 'криминал'], ['США', 'Германия'], 'Офисный клерк с бессонницей и харизматичный продавец мыла основывают подпольный клуб.'),
  mk(41519, 'Брат', '', 1997, 100, 8.3, 7.8, ['драма', 'криминал', 'боевик'], ['Россия'], 'Демобилизованный Данила приезжает в Петербург к старшему брату.'),
  mk(42664, 'Иван Васильевич меняет профессию', '', 1973, 88, 8.8, 8.2, ['комедия', 'фантастика'], ['СССР'], 'Машина времени меняет местами управдома и Ивана Грозного.'),
  mk(1143242, 'Джентльмены', 'The Gentlemen', 2019, 113, 8.6, 7.8, ['криминал', 'комедия', 'боевик'], ['Великобритания', 'США'], 'Американец, построивший марихуановую империю в Лондоне, решает продать бизнес.'),
  mk(462682, 'Волк с Уолл-стрит', 'The Wolf of Wall Street', 2013, 180, 8.0, 8.2, ['драма', 'криминал', 'биография', 'комедия'], ['США'], 'Взлёт и падение брокера, сделавшего состояние на мошенничестве.'),
  mk(841700, 'Ла-Ла Ленд', 'La La Land', 2016, 128, 7.9, 8.0, ['мюзикл', 'мелодрама', 'драма'], ['США'], 'Джазовый пианист и начинающая актриса влюбляются в Лос-Анджелесе.'),
  mk(1048334, 'Джокер', 'Joker', 2019, 122, 8.0, 8.4, ['триллер', 'драма', 'криминал'], ['США', 'Канада'], 'Неудачливый комик постепенно превращается в главного злодея Готэма.'),
  mk(679486, 'Престиж', 'The Prestige', 2006, 125, 8.5, 8.5, ['триллер', 'драма', 'детектив'], ['США', 'Великобритания'], 'Два иллюзиониста ведут смертельно опасное соперничество.'),
  mk(4374, 'Пираты Карибского моря: Проклятие Черной жемчужины', 'Pirates of the Caribbean', 2003, 143, 8.3, 8.1, ['приключения', 'фэнтези', 'боевик'], ['США'], 'Кузнец объединяется с эксцентричным пиратом, чтобы спасти похищенную девушку.'),
  mk(2360, 'Король Лев', 'The Lion King', 1994, 88, 8.8, 8.5, ['мультфильм', 'драма', 'приключения'], ['США'], 'Львёнок Симба бежит из дома и должен вернуться, чтобы занять своё место.'),
  mk(474, 'Амели', "Le Fabuleux destin d'Amélie Poulain", 2001, 122, 7.9, 8.3, ['мелодрама', 'комедия'], ['Франция', 'Германия'], 'Застенчивая официантка с Монмартра тайно устраивает счастье окружающих.'),
  mk(8124, 'Отступники', 'The Departed', 2006, 151, 8.5, 8.5, ['триллер', 'драма', 'криминал'], ['США', 'Гонконг'], 'Полицейский внедрён в банду, а человек банды — в полицию.'),
  mk(2213, 'Титаник', 'Titanic', 1997, 194, 8.4, 7.9, ['мелодрама', 'драма', 'история'], ['США'], 'Роман пассажиров разных классов на борту обречённого лайнера.'),
  mk(5492, 'Ешь, молись, люби', 'Eat Pray Love', 2010, 133, 6.7, 5.8, ['мелодрама', 'драма'], ['США'], 'После развода героиня отправляется в год странствий по Италии, Индии и Бали.'),
  mk(395787, 'Однажды в... Голливуде', 'Once Upon a Time in Hollywood', 2019, 161, 7.6, 7.6, ['драма', 'комедия'], ['США', 'Великобритания'], 'Стареющий актёр и его каскадёр пытаются удержаться в меняющемся Голливуде 1969-го.'),
  mk(1236063, 'Достать ножи', 'Knives Out', 2019, 130, 7.9, 7.9, ['детектив', 'комедия', 'криминал'], ['США'], 'Знаменитый детектив расследует смерть писателя в доме его эксцентричной семьи.'),
];

function mockPage(filters, page) {
  let list = MOCK;
  if (filters.source === 'series' || filters.source === 'dorama') list = [];
  if (filters.source === 'love') list = MOCK.filter(m => m.genres.includes('мелодрама'));
  if (filters.source === 'family') list = MOCK.filter(m => m.genres.some(g => ['мультфильм', 'приключения', 'комедия'].includes(g)));
  if (filters.source === 'top250') list = MOCK.filter(m => m.kp >= 8.5);
  const size = 10;
  return Promise.resolve({ items: list.slice((page - 1) * size, page * size), totalPages: Math.max(1, Math.ceil(list.length / size)) });
}
