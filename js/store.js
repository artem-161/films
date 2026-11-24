// Хранилище пары: Supabase (общий режим) или localStorage (демо).
import { CONFIG } from './config.js';
import { MOCK } from './api.js';

const SESSION_KEY = 'kv_session';
export const isDemo = () => !(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const writeSession = s => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now();

class BaseStore {
  constructor() {
    this.couple = null;
    this.me = null;
    this.partner = null;
    this.members = [];
    this.movies = new Map();   // kp_id -> { data, manual, added_by, created_at }
    this.votes = new Map();    // `${kp}:${member}` -> { liked, at }
    this.watched = new Map();  // kp_id -> { watched_at, ratings }
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) { this.listeners.forEach(fn => { try { fn(evt); } catch (e) { console.error(e); } }); }

  setMembers(list, myId) {
    this.members = list;
    this.me = list.find(m => m.id === myId) || null;
    this.partner = list.find(m => m.id !== myId) || null;
  }

  getVote(kp, memberId) { return memberId ? this.votes.get(kp + ':' + memberId) : undefined; }
  myVote(kp) { return this.getVote(kp, this.me?.id)?.liked; }
  partnerVote(kp) { return this.getVote(kp, this.partner?.id)?.liked; }
  isMatch(kp) { return this.myVote(kp) === true && this.partnerVote(kp) === true; }
  movie(kp) { return this.movies.get(kp)?.data; }
  isWatched(kp) { return this.watched.has(kp); }

  likedBy(memberId) {
    if (!memberId) return [];
    return [...this.movies.keys()]
      .filter(kp => this.getVote(kp, memberId)?.liked === true && !this.isWatched(kp))
      .sort((a, b) => (this.getVote(b, memberId).at > this.getVote(a, memberId).at ? 1 : -1))
      .map(kp => this.movie(kp));
  }
  matches() {
    return [...this.movies.keys()]
      .filter(kp => this.isMatch(kp) && !this.isWatched(kp))
      .sort((a, b) => {
        const t = kp => [this.getVote(kp, this.me.id).at, this.getVote(kp, this.partner.id).at].sort()[1];
        return t(b) > t(a) ? 1 : -1;
      })
      .map(kp => this.movie(kp));
  }
  // что партнёр хочет, а я ещё не оценил — показываем в колоде первым
  pendingForMe() {
    if (!this.partner) return [];
    return [...this.movies.keys()]
      .filter(kp => this.partnerVote(kp) === true && this.myVote(kp) === undefined && !this.isWatched(kp))
      .map(kp => this.movie(kp));
  }
  pool() {
    return [...this.movies.entries()]
      .filter(([kp, m]) => !this.isWatched(kp) && (m.manual || this.myVote(kp) === true || this.partnerVote(kp) === true))
      .sort((a, b) => (b[1].created_at > a[1].created_at ? 1 : -1))
      .map(([, m]) => m.data);
  }
  watchedList() {
    return [...this.watched.entries()]
      .sort((a, b) => (b[1].watched_at > a[1].watched_at ? 1 : -1))
      .map(([kp, w]) => ({ ...this.movie(kp), watched: w }));
  }
}

// ======================= Supabase =======================

class SupabaseStore extends BaseStore {
  async init() {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    this.sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const s = readSession();
    if (!s) return false;
    return this.open(s.coupleId, s.memberId);
  }

  async open(coupleId, memberId) {
    const { data: couple, error } = await this.sb.from('couples').select('*').eq('id', coupleId).maybeSingle();
    if (error) throw error;
    if (!couple) { clearSession(); return false; }
    this.couple = couple;
    await this.loadAll();
    this.setMembers(this.members, memberId);
    if (!this.me) { clearSession(); return false; }
    writeSession({ coupleId, memberId });
    this.subscribe();
    return true;
  }

  async fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from(table).select('*').eq('couple_id', this.couple.id).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  async loadAll() {
    const [members, movies, votes, watched] = await Promise.all(['members', 'movies', 'votes', 'watched'].map(t => this.fetchAll(t)));
    this.members = members.sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    this.movies = new Map(movies.map(m => [m.kp_id, m]));
    this.votes = new Map(votes.map(v => [v.kp_id + ':' + v.member_id, { liked: v.liked, at: v.created_at }]));
    this.watched = new Map(watched.map(w => [w.kp_id, w]));
  }

  subscribe() {
    if (this.channel) this.sb.removeChannel(this.channel);
    const filter = `couple_id=eq.${this.couple.id}`;
    const ch = this.sb.channel('couple-' + this.couple.id);
    const on = (table, fn) => ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, fn);
    on('members', p => {
      if (p.eventType === 'DELETE') return;
      const list = this.members.filter(m => m.id !== p.new.id).concat(p.new);
      this.setMembers(list, this.me.id);
      this.emit({ type: 'members', joined: p.eventType === 'INSERT' && p.new.id !== this.me.id });
    });
    on('movies', p => {
      if (p.eventType === 'DELETE') this.movies.delete(p.old.kp_id);
      else this.movies.set(p.new.kp_id, p.new);
      this.emit({ type: 'movies', kp: (p.new || p.old).kp_id, row: p.new });
    });
    on('votes', p => {
      const row = p.eventType === 'DELETE' ? p.old : p.new;
      const key = row.kp_id + ':' + row.member_id;
      const before = this.isMatch(row.kp_id);
      if (p.eventType === 'DELETE') this.votes.delete(key);
      else this.votes.set(key, { liked: row.liked, at: row.created_at });
      const fromPartner = row.member_id !== this.me.id;
      this.emit({ type: 'vote', kp: row.kp_id, fromPartner, newMatch: fromPartner && !before && this.isMatch(row.kp_id) });
    });
    on('watched', p => {
      if (p.eventType === 'DELETE') this.watched.delete(p.old.kp_id);
      else this.watched.set(p.new.kp_id, p.new);
      this.emit({ type: 'watched', kp: (p.new || p.old).kp_id });
    });
    ch.subscribe(status => { if (status === 'SUBSCRIBED' && this._wasDisconnected) this.resync(); if (status !== 'SUBSCRIBED') this._wasDisconnected = true; });
    this.channel = ch;
  }

  async resync() {
    this._wasDisconnected = false;
    const myId = this.me.id;
    await this.loadAll();
    this.setMembers(this.members, myId);
    this.emit({ type: 'sync' });
  }

  // ---- пара ----
  async createCouple(name) {
    const { data: couple, error } = await this.sb.from('couples').insert({ code: genCode() }).select().single();
    if (error) throw error;
    const { data: member, error: e2 } = await this.sb.from('members').insert({ couple_id: couple.id, name }).select().single();
    if (e2) throw e2;
    return this.open(couple.id, member.id);
  }
  async findCouple(code) {
    const { data: couple, error } = await this.sb.from('couples').select('*').eq('code', code.trim().toUpperCase()).maybeSingle();
    if (error) throw error;
    if (!couple) return null;
    const { data: members } = await this.sb.from('members').select('*').eq('couple_id', couple.id).order('created_at');
    return { couple, members: members || [] };
  }
  async joinCouple(coupleId, name) {
    const { data: member, error } = await this.sb.from('members').insert({ couple_id: coupleId, name }).select().single();
    if (error) throw error;
    return this.open(coupleId, member.id);
  }
  async rename(name) {
    this.me.name = name;
    await this.sb.from('members').update({ name }).eq('id', this.me.id);
  }
  leave() { if (this.channel) this.sb.removeChannel(this.channel); clearSession(); }

  // ---- данные ----
  async ensureMovie(m, { manual = false } = {}) {
    const ex = this.movies.get(m.id);
    if (ex && (!manual || ex.manual)) return;
    const row = { couple_id: this.couple.id, kp_id: m.id, data: ex?.data || m, manual: manual || !!ex?.manual,
                  added_by: ex?.added_by ?? (manual ? this.me.id : null), created_at: ex?.created_at || now() };
    this.movies.set(m.id, row);
    const { error } = await this.sb.from('movies').upsert(row, { onConflict: 'couple_id,kp_id' });
    if (error) throw error;
  }
  async updateMovieData(kp, data) {
    const ex = this.movies.get(kp);
    if (!ex) return;
    ex.data = { ...ex.data, ...data };
    await this.sb.from('movies').update({ data: ex.data }).eq('couple_id', this.couple.id).eq('kp_id', kp);
  }
  async setVote(m, liked) {
    this.votes.set(m.id + ':' + this.me.id, { liked, at: now() });
    await this.ensureMovie(m);
    const { error } = await this.sb.from('votes').upsert(
      { couple_id: this.couple.id, kp_id: m.id, member_id: this.me.id, liked, created_at: now() },
      { onConflict: 'couple_id,kp_id,member_id' });
    if (error) throw error;
  }
  async clearVote(kp) {
    this.votes.delete(kp + ':' + this.me.id);
    await this.sb.from('votes').delete().eq('couple_id', this.couple.id).eq('kp_id', kp).eq('member_id', this.me.id);
  }
  async addManual(m) {
    await this.ensureMovie(m, { manual: true });
    await this.setVote(m, true);
  }
  async setWatched(m, rating) {
    await this.ensureMovie(m);
    const ex = this.watched.get(m.id);
    const ratings = { ...(ex?.ratings || {}) };
    if (rating) ratings[this.me.id] = rating;
    const row = { couple_id: this.couple.id, kp_id: m.id, watched_at: ex?.watched_at || now(), ratings };
    this.watched.set(m.id, row);
    const { error } = await this.sb.from('watched').upsert(row, { onConflict: 'couple_id,kp_id' });
    if (error) throw error;
  }
  async unwatch(kp) {
    this.watched.delete(kp);
    await this.sb.from('watched').delete().eq('couple_id', this.couple.id).eq('kp_id', kp);
  }
}

// ======================= Демо (localStorage) =======================

const DEMO_KEY = 'kv_demo_db';

class DemoStore extends BaseStore {
  async init() {
    const db = this.read();
    if (!db) return false;
    this.hydrate(db);
    return true;
  }
  read() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { return null; } }
  persist() {
    localStorage.setItem(DEMO_KEY, JSON.stringify({
      couple: this.couple, members: this.members, myId: this.me.id,
      movies: [...this.movies.entries()], votes: [...this.votes.entries()], watched: [...this.watched.entries()],
    }));
  }
  hydrate(db) {
    this.couple = db.couple;
    this.movies = new Map(db.movies);
    this.votes = new Map(db.votes);
    this.watched = new Map(db.watched);
    this.setMembers(db.members, db.myId);
  }
  async createCouple(name) {
    const me = { id: uuid(), name, created_at: now() };
    const partner = { id: uuid(), name: 'Она (демо)', created_at: now() };
    this.couple = { id: uuid(), code: 'DEMO' + genCode().slice(0, 4) };
    this.setMembers([me, partner], me.id);
    // партнёр уже предложил пару фильмов
    for (const m of [MOCK[13], MOCK[18], MOCK[21]]) {
      this.movies.set(m.id, { data: m, manual: true, added_by: partner.id, created_at: now() });
      this.votes.set(m.id + ':' + partner.id, { liked: true, at: now() });
    }
    this.persist();
    return true;
  }
  async findCouple() { return null; }
  async rename(name) { this.me.name = name; this.persist(); }
  leave() { localStorage.removeItem(DEMO_KEY); }

  async ensureMovie(m, { manual = false } = {}) {
    const ex = this.movies.get(m.id);
    if (ex && (!manual || ex.manual)) return;
    this.movies.set(m.id, { data: ex?.data || m, manual: manual || !!ex?.manual, added_by: ex?.added_by ?? (manual ? this.me.id : null), created_at: ex?.created_at || now() });
    this.persist();
  }
  async updateMovieData(kp, data) {
    const ex = this.movies.get(kp);
    if (!ex) return;
    ex.data = { ...ex.data, ...data };
    this.persist();
  }
  async setVote(m, liked) {
    this.votes.set(m.id + ':' + this.me.id, { liked, at: now() });
    this.ensureMovie(m);
    // имитация партнёра: иногда ей тоже нравится
    if (liked && this.partnerVote(m.id) === undefined && Math.random() < 0.45) {
      this.votes.set(m.id + ':' + this.partner.id, { liked: true, at: now() });
    }
    this.persist();
  }
  async clearVote(kp) { this.votes.delete(kp + ':' + this.me.id); this.persist(); }
  async addManual(m) { await this.ensureMovie(m, { manual: true }); await this.setVote(m, true); }
  async setWatched(m, rating) {
    await this.ensureMovie(m);
    const ex = this.watched.get(m.id);
    const ratings = { ...(ex?.ratings || {}) };
    if (rating) ratings[this.me.id] = rating;
    this.watched.set(m.id, { watched_at: ex?.watched_at || now(), ratings });
    this.persist();
  }
  async unwatch(kp) { this.watched.delete(kp); this.persist(); }
}

export function createStore() { return isDemo() ? new DemoStore() : new SupabaseStore(); }
