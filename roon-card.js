/*
 * Roon Player Card
 * Custom Lovelace card: artist image rotation, cover, transport controls, lyrics (LRCLIB), status pill.
 * Optional: extra artist images and a biography from TheAudioDB (audiodb_key and/or audiodb_url).
 * No dependencies on other cards. Usage: type: custom:roon-player-card
 */
(function () {
  'use strict';

  // No installation-specific values here. Everything is passed as card options.
  const DEFAULTS = {
    player: '',                 // required: media player entity
    zone: '',                   // optional: zone name; sensor defaults to sensor.roon_<zone>_json
    sensor: '',                 // optional: bridge zone sensor (overrides the zone default)
    status_sensor: '',          // optional: bridge status sensor (default sensor.roon_bridge_status)
    roon_url: '',               // optional: image API base URL (default: image_base_url from the bridge status)
    heartbeat_timeout: 90,      // seconds without a new bridge heartbeat before fallback; 0 = off
    clock_url: '/',             // URL used for the clock sync (only the Date header is read)
    bg_aspects_main: ['12by10', '4by3'], // aspect ratios for the first artist
    bg_aspects_other: ['12by10'],        // aspect ratios for further artists
    bg_interval: 15,            // longest time per image in seconds
    bg_interval_min: 10,        // shortest time per image (used when there are many images)
    bg_cycle: 90,               // target: one pass through all images takes about this many seconds (0 = always bg_interval)
    zoom_seconds: 30,           // cover zoom hides itself after this time
    cover_fit: 'contain',       // 'contain' = whole cover, 'cover' = fill
    lyrics: true,               // false = lyrics off (same as 'nosongtext')
    lyrics_dim: 0.55,           // dimming of the image behind the lyrics
    lyrics_offset: 0.2,         // seconds: positive = lyrics earlier, negative = later
    format_attr: '',            // attribute path(s) shown as audio format; empty = auto from signal_path
    // TheAudioDB: extra artist images and biography. Without audiodb_key (and without audiodb_url) nothing is requested.
    audiodb_key: '',            // TheAudioDB API key; the card then asks theaudiodb.com directly (e.g. when the bridge is not running)
    audiodb_url: '',            // optional: cache of the bridge web server, e.g. http://<host>:<port>/audiodb (tried first)
    audiodb_images: 'extra',    // 'extra' = after the Roon images, 'fallback' = only if Roon has none, 'off'
    bio_lang: 'EN',             // biography language order, e.g. 'DE,EN' (strBiographyDE first, then strBiography)
    // Switches, e.g. options: [nobuttons, nosongtext, noaspect, nostatus]
    //   nobuttons    no player controls (volume, previous/play/next, seek): for displays without touch
    //   nobio        tapping an artist name does not open the biography
    //   nosongtext   lyrics off
    //   noaspect     do not show the aspect ratio (roon) or the image type (tadb) in the pill
    //   nosource     do not show the words Artist and Cover in the pill (the source roon/tadb and the number n/m stay)
    //   nostatus     status pill off
    //   noformat     do not show the audio format
    //   nounderline  do not underline the artist name
    //   noscroll     no marquee for title/artist/album (use "..." instead)
    //   nostale      disable the "bridge data is outdated" checks (title, status, heartbeat)
    //   debug        tap the pill to show a diagnostic panel
    options: [],
    bar_h: 112,                 // height of the bottom bar in px
    pad: 20,                    // horizontal padding of the bottom bar in px
    max_height: '85vh'          // maximum card height (any CSS length)
  };

  const LYR_LINE_H = 44;

  const ICON = {
    prev: 'M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z',
    play: 'M8,5V19L19,12L8,5Z',
    pause: 'M14,19H18V5H14M6,19H10V5H6V19Z',
    next: 'M16,18V6H18V18H16M6,18V6L14.5,12L6,18Z',
    vol: 'M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18.03,19.86 21,16.28 21,12C21,7.72 18.03,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16.02C15.5,15.29 16.5,13.77 16.5,12M3,9V15H7L12,20V4L7,9H3Z'
  };

  const svg = (size, path) =>
    '<svg viewBox="0 0 24 24" style="width:' + size + 'px;height:' + size + 'px;fill:#fff;pointer-events:none;"><path d="' + path + '"/></svg>';

  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // ---------- Helpers ----------
  function parseOpts(c) {
    let list = c.options;
    if (typeof list === 'string') list = list.split(/[\s,;]+/);
    if (!Array.isArray(list)) list = [];
    const o = {};
    list.forEach(function (x) { if (x) o[String(x).toLowerCase().replace(/[^a-z]/g, '')] = true; });
    if (o.nolyrics) o.nosongtext = true;
    if (c.lyrics === false || c.lyrics === 'false') o.nosongtext = true;
    return o;
  }

  // Status published by the bridge (JSON: status, timestamp, image_base_url, ...)
  function bridgeInfo(states, c) {
    const e = states[c.status_sensor];
    if (!e) return { exists: false, status: '', attrs: {} };
    const s = String(e.state || '').toLowerCase();
    return {
      exists: true,
      status: (s === 'unavailable' || s === 'unknown') ? '' : s,
      attrs: e.attributes || {}
    };
  }

  // Image API base URL with exactly one trailing slash. Option first, then the bridge status.
  function imageBase(c, bi) {
    const opt = String(c.roon_url || '').trim();
    const src = opt ? 'option' : (bi.attrs.image_base_url ? 'bridge' : 'none');
    const u = opt || String(bi.attrs.image_base_url || '').trim();
    return { url: u ? u.replace(/\/+$/, '') + '/' : '', src: src };
  }

  const nz = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, ''); };

  function sameTrack(a, b) {
    a = nz(a); b = nz(b);
    if (!a || !b) return false;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  // Why is the bridge data not usable? Returns '' if it is usable.
  function staleReason(states, c, o, bi, silent) {
    if (o.nostale) return '';
    if (bi.status && bi.status !== 'online') return 'bridge ' + bi.status.replace(/_/g, ' ');
    if (silent) return 'bridge silent';
    if (!c.sensor) return '';
    const player = states[c.player];
    if (!player) return '';
    const a = player.attributes || {};
    const json = (states[c.sensor] && states[c.sensor].attributes) || {};
    const np = json.now_playing || {};
    if (!np.track) return 'no track in sensor';
    if (sameTrack(np.track, a.media_title)) return '';
    if (np.length && a.media_duration && Math.abs(np.length - a.media_duration) <= 2 &&
        sameTrack(np.artist, a.media_artist)) return '';
    return 'title mismatch';
  }

  // Value at a dotted path, e.g. signal_path.sample_rate
  function getPath(obj, p) {
    return String(p).split('.').reduce(function (o, k) { return (o === undefined || o === null) ? undefined : o[k]; }, obj);
  }

  // Audio format: explicit attribute paths, or automatic from the bridge's signal_path
  function formatInfo(c, a, json, np) {
    let names = c.format_attr;
    if (typeof names === 'string') names = names.split(/[\s,;]+/).filter(Boolean);
    if (Array.isArray(names) && names.length) {
      const out = [];
      names.forEach(function (n) {
        const v = [a, json, np].map(function (src) { return getPath(src, n); })
          .filter(function (x) { return x !== undefined && x !== null && x !== ''; })[0];
        if (v !== undefined) out.push(String(v));
      });
      return out.join(' ');
    }
    const sp = json && json.signal_path;
    if (sp && sp.sample_rate && sp.bit_depth) {
      const rate = (Math.round(sp.sample_rate / 100) / 10) + 'k';
      return (sp.source_format ? String(sp.source_format).toUpperCase() + ' ' : '') + rate + ' ' + sp.bit_depth + 'Bit';
    }
    return '';
  }

  // ---------- Clock sync: display <-> Home Assistant ----------
  let clockOff = 0, clockAt = 0;
  function syncClock(url) {
    if (clockAt && Date.now() - clockAt < 600000) return;
    clockAt = Date.now();
    const t0 = Date.now();
    try {
      fetch(url || '/', { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        const d = r.headers.get('date');
        if (!d) return;
        const t1 = Date.now();
        const off = new Date(d).getTime() + 500 - (t0 + t1) / 2;
        // The Date header has 1 s resolution, so ignore offsets below 1 s
        clockOff = Math.abs(off) < 1000 ? 0 : off;
      }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  // ---------- Repair encoding errors (UTF-8 that was read as Latin-1/Windows-1252) ----------
  const CP1252 = {
    '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85, '\u2020': 0x86,
    '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A, '\u2039': 0x8B, '\u0152': 0x8C,
    '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95,
    '\u2013': 0x96, '\u2014': 0x97, '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B,
    '\u0153': 0x9C, '\u017E': 0x9E, '\u0178': 0x9F
  };
  function fixMojibake(s) {
    if (!s || !/[\u00C2-\u00F4]/.test(s)) return s;
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], code = s.charCodeAt(i);
      if (code < 256) bytes.push(code);
      else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch]);
      else return s; // real Unicode character: leave untouched
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch (e) {
      return s; // not valid UTF-8: leave unchanged
    }
  }

  // ---------- Lyrics (LRCLIB) ----------
  function parseLrc(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
      const times = [];
      let m;
      while ((m = re.exec(line)) !== null) times.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
      if (!times.length) return;
      const txt = fixMojibake(line.replace(/\[[^\]]*\]/g, '').trim());
      times.forEach(function (t) { out.push({ t: t, text: txt }); });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  function qs(o) {
    return Object.keys(o).filter(function (k) { return o[k]; })
      .map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&');
  }

  // Returns a list (possibly empty), or null on a server error (a retry happens later)
  async function fetchLyrics(artist, title, album, dur) {
    const base = 'https://lrclib.net/api/';
    const cleanTitle = title.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s+-\s+.*$/, '').trim() || title;
    let failed = false;
    try {
      const r = await fetch(base + 'get?' + qs({ artist_name: artist, track_name: title, album_name: album, duration: dur }));
      if (r.ok) {
        const j = await r.json();
        if (j && j.syncedLyrics) return parseLrc(j.syncedLyrics);
      } else if (r.status >= 500) { failed = true; }
    } catch (e) { failed = true; }
    try {
      const r = await fetch(base + 'search?' + qs({ track_name: cleanTitle, artist_name: artist }));
      if (r.ok) {
        const list = (await r.json()) || [];
        const synced = list.filter(function (x) { return x && x.syncedLyrics; });
        if (synced.length) {
          let best = synced[0];
          if (dur) {
            synced.forEach(function (x) {
              if (Math.abs((x.duration || 0) - dur) < Math.abs((best.duration || 0) - dur)) best = x;
            });
            if (Math.abs((best.duration || 0) - dur) > 8) return [];
          }
          return parseLrc(best.syncedLyrics);
        }
        return failed ? null : [];
      }
      if (r.status >= 500) failed = true;
    } catch (e) { failed = true; }
    return failed ? null : [];
  }

  // Tap detection: pointerup (touch) plus click as a fallback.
  // Some wall displays swallow `click`, so every control uses this.
  function onTap(el, fn) {
    if (!el) return;
    let sx = 0, sy = 0, st = 0, handledAt = 0;
    el.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; st = Date.now(); });
    el.addEventListener('pointerup', function (e) {
      if (Math.abs(e.clientX - sx) < 20 && Math.abs(e.clientY - sy) < 20 && Date.now() - st < 800) {
        handledAt = Date.now();
        e.stopPropagation();
        fn(e);
      }
    });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (Date.now() - handledAt < 500) return;
      fn(e);
    });
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------- TheAudioDB: artist images and biography ----------
  // Data comes from TheAudioDB (search.php?s=<artist>): from the cache of the bridge web server (audiodb_url)
  // and/or directly from theaudiodb.com (audiodb_key). Without either, nothing is requested.
  let NONWORD;
  try { NONWORD = new RegExp('[^\\p{L}\\p{N}]+', 'gu'); } catch (e) { NONWORD = /[^a-z0-9\u00c0-\u024f]+/g; }
  function nzu(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(NONWORD, '');
  }

  // Image URLs end up in url('...'): encode characters that could break out of it
  function safeUrl(u) {
    return String(u).replace(/[\s'"\\]/g, function (ch) {
      return '%' + ('0' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-2);
    });
  }

  const AD_KEEP = /^(strArtist|strArtistAlternate|strCountry|intBornYear|intFormedYear|strGenre|strArtistThumb|strArtistFanart\d?|strBiography[A-Z]{0,2})$/;
  const AD_MEM = new Map();      // key -> { rec, until }   rec = artist object, or null = unknown artist
  const AD_PENDING = new Map();  // key -> Promise
  const AD_FAIL = new Map();     // key -> time of the next attempt after an error
  const AD_PROXY_OFF = {};       // proxy URL -> true once it reported "no key configured"
  const AD_OK_MS = 30 * 86400000, AD_UNKNOWN_MS = 86400000, AD_RETRY_MS = 600000;

  function adLoadStored(k) {
    try {
      const e = JSON.parse(localStorage.getItem('roon-card:audiodb:' + k) || 'null');
      if (e && e.until > Date.now()) { AD_MEM.set(k, e); return e; }
    } catch (x) { /* storage not available */ }
    return null;
  }
  function adStore(k, e) {
    const put = function () { localStorage.setItem('roon-card:audiodb:' + k, JSON.stringify(e)); };
    try { put(); } catch (x) {
      try {   // quota full: drop the cached artists and try once more
        Object.keys(localStorage).filter(function (n) { return n.indexOf('roon-card:audiodb:') === 0; })
          .forEach(function (n) { localStorage.removeItem(n); });
        put();
      } catch (y) { /* memory cache still works */ }
    }
  }

  function audiodbEnabled(c) {
    return !!c.audiodb_key || (!!c.audiodb_url && !AD_PROXY_OFF[c.audiodb_url]);
  }

  // Spelling variants for the search request (typographic apostrophe, no apostrophe)
  function adVariants(name) {
    const v = [name];
    const a = name.replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'");
    if (a !== name) v.push(a);
    const b = a.replace(/'/g, '');
    if (b !== a) v.push(b);
    return v;
  }

  // Bridge cache first (if configured), then TheAudioDB directly (only with a key)
  async function audiodbRequest(c, name) {
    const want = nzu(name);
    const match = function (list) {
      return list.filter(function (x) { return nzu(x.strArtist) === want; })[0] ||
        list.filter(function (x) {
          return String(x.strArtistAlternate || '').split(';').some(function (n) { return nzu(n) === want; });
        })[0];
    };
    let reached = false, found = null;
    const variants = adVariants(name);
    for (let i = 0; i < variants.length && !found; i++) {
      const q = variants[i];
      let list = null;
      if (c.audiodb_url && !AD_PROXY_OFF[c.audiodb_url]) {
        try {
          const r = await fetch(c.audiodb_url + (c.audiodb_url.indexOf('?') < 0 ? '?' : '&') + 'artist=' + encodeURIComponent(q));
          if (r.status === 503) AD_PROXY_OFF[c.audiodb_url] = true;          // server has no key: stop asking
          else if (r.ok) list = ((await r.json()) || {}).artists || [];
        } catch (e) { /* proxy not reachable */ }
      }
      if (list === null && c.audiodb_key) {
        const r = await fetch('https://www.theaudiodb.com/api/v1/json/' + encodeURIComponent(c.audiodb_key) +
          '/search.php?s=' + encodeURIComponent(q));
        if (!r.ok) throw new Error('HTTP ' + r.status);
        list = ((await r.json()) || {}).artists || [];
      }
      if (list === null) continue;
      reached = true;
      found = match(list);
    }
    if (!reached) throw new Error('no source');
    if (!found) return null;
    const o = {};
    Object.keys(found).forEach(function (k) { if (AD_KEEP.test(k) && found[k]) o[k] = found[k]; });
    return o;
  }

  // -> { state: 'ok', rec } | { state: 'loading', p } | { state: 'error' } | { state: 'none' }
  function audiodbRecord(c, name) {
    const k = nzu(name);
    if (!k || !audiodbEnabled(c)) return { state: 'none' };
    const now = Date.now();
    const e = AD_MEM.get(k) || (c.audiodb_key ? adLoadStored(k) : null);
    if (e && e.until > now) return { state: 'ok', rec: e.rec };
    if (AD_PENDING.has(k)) return { state: 'loading', p: AD_PENDING.get(k) };
    if ((AD_FAIL.get(k) || 0) > now) return { state: 'error' };
    const p = audiodbRequest(c, name).then(function (rec) {
      const ent = { rec: rec, until: Date.now() + (rec ? AD_OK_MS : AD_UNKNOWN_MS) };
      AD_MEM.set(k, ent);
      if (c.audiodb_key) adStore(k, ent);
    }).catch(function () {
      AD_FAIL.set(k, Date.now() + AD_RETRY_MS);
    }).then(function () { AD_PENDING.delete(k); });
    AD_PENDING.set(k, p);
    return { state: 'loading', p: p };
  }

  // Images in the order thumb, fanart, fanart2..4
  function audiodbImages(rec) {
    const out = [];
    if (!rec) return out;
    [['strArtistThumb', 'thumb'], ['strArtistFanart', 'fanart'], ['strArtistFanart2', 'fanart'],
     ['strArtistFanart3', 'fanart'], ['strArtistFanart4', 'fanart']].forEach(function (p) {
      if (rec[p[0]] && /^https?:\/\//i.test(rec[p[0]])) out.push({ u: safeUrl(rec[p[0]]), kind: p[1] });
    });
    return out;
  }

  function parseLangs(v) {
    let l = v;
    if (typeof l === 'string') l = l.split(/[\s,;]+/);
    if (!Array.isArray(l)) l = [];
    l = l.map(function (x) { return String(x).trim().toUpperCase(); }).filter(Boolean);
    return l.length ? l : ['EN'];
  }

  // TheAudioDB: English = strBiography, others = strBiography<CODE> (a few codes differ from ISO)
  const BIO_FIELDS = { EN: ['strBiographyEN', 'strBiography'], JA: ['strBiographyJP'], ZH: ['strBiographyCN'],
    SV: ['strBiographySE'], HE: ['strBiographyIL'], NB: ['strBiographyNO'], NN: ['strBiographyNO'] };
  function pickBio(rec, langs) {
    for (let i = 0; i < langs.length; i++) {
      const fields = BIO_FIELDS[langs[i]] || ['strBiography' + langs[i]];
      for (let j = 0; j < fields.length; j++) {
        const v = rec[fields[j]];
        if (v && String(v).trim()) return { text: String(v).trim(), lang: langs[i] };
      }
    }
    return null;
  }

  // ---------- The card ----------
  class RoonPlayerCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._built = false;
      this._hass = null;
    }

    static getStubConfig() { return { player: 'media_player.example', zone: 'example' }; }

    setConfig(config) {
      if (!config || !config.player) throw new Error("Option 'player' is required");
      const cfg = Object.assign({}, DEFAULTS, config);
      // Conventions: zone "Auralic" -> sensor.roon_auralic_json, status sensor sensor.roon_bridge_status
      this._statusExplicit = !!config.status_sensor;
      const slug = String(cfg.zone || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (!cfg.sensor && slug) cfg.sensor = 'sensor.roon_' + slug + '_json';
      if (!cfg.status_sensor) cfg.status_sensor = 'sensor.roon_bridge_status';
      this._cfg = cfg;
      this._opts = parseOpts(cfg);
      this._langs = parseLangs(cfg.bio_lang);
      this._stopTimers();
      this._build();
      if (this.isConnected) this._startTimers();
      if (this._hass) this._update();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._built) this._update();
    }

    getCardSize() { return 8; }
    getGridOptions() { return { columns: 12, min_columns: 6 }; }

    connectedCallback() {
      if (this._built) { this._startTimers(); if (this._hass) this._update(); }
    }
    disconnectedCallback() { this._stopTimers(); }

    _startTimers() {
      this._stopTimers();
      this._timer = setInterval(() => this._tick(), 250);
      if (typeof ResizeObserver !== 'undefined') {
        let t = null;
        this._ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => this._marquee(), 200); });
        this._ro.observe(this);
      }
      syncClock(this._cfg.clock_url);
    }
    _stopTimers() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
    }

    _svc(name, data) {
      if (!this._hass) return;
      this._hass.callService('media_player', name, Object.assign({ entity_id: this._cfg.player }, data || {}));
    }

    // ----- DOM -----
    _build() {
      const c = this._cfg, o = this._opts;
      const mh = c.max_height;
      // Without player controls the bottom bar only needs room for the cover (72 px) plus padding
      const barH = o.nobuttons ? Math.min(Number(c.bar_h) || 112, 96) : c.bar_h;
      this.shadowRoot.innerHTML = `
<style>
  :host { display:block; container-type:inline-size; }
  ha-card { position:relative; overflow:hidden; width:100%; box-sizing:border-box; padding:0; margin:0;
    background:rgb(42,42,46); border-radius:16px; height:${mh}; height:min(${mh},100cqw);
    --bar-h:${barH}px; --pad:${c.pad}px; }
  .bg { position:absolute; top:0; left:0; right:0; bottom:var(--bar-h); overflow:hidden; z-index:1;
    cursor:pointer; touch-action:manipulation; background:rgb(22,22,22); }
  .bgl { position:absolute; top:0; left:0; right:0; bottom:0; background-size:cover; background-repeat:no-repeat;
    background-position:center top; pointer-events:none; transition:opacity 1.2s ease; opacity:0; }
  .lyr { position:absolute; top:0; left:0; right:0; bottom:0; display:none; overflow:hidden; pointer-events:none;
    background:rgba(0,0,0,${c.lyrics_dim}); }
  .lyr-in { position:absolute; left:0; right:0; top:0; transition:transform 0.35s ease; will-change:transform; }
  .rl { min-height:${LYR_LINE_H}px; padding:6px 16px; box-sizing:border-box; display:flex; align-items:center;
    justify-content:center; text-align:center; line-height:1.25; white-space:normal; overflow-wrap:anywhere;
    color:#fff; font-family:Roboto,'Helvetica Neue',Arial,sans-serif; font-size:1.25rem; font-weight:500;
    text-shadow:0 1px 4px rgba(0,0,0,0.7); transition:opacity 0.4s; opacity:0.35; }
  .pill { position:absolute; right:10px; bottom:10px; z-index:4; display:none; padding:3px 10px; border-radius:999px;
    background:rgba(0,0,0,0.55); color:#fff; font-family:Roboto,'Helvetica Neue',Arial,sans-serif;
    font-size:0.72rem; font-weight:500; letter-spacing:0.02em; pointer-events:none; }
  .dbg { position:absolute; left:8px; right:8px; top:8px; bottom:40px; z-index:3; display:none; overflow:auto;
    box-sizing:border-box; padding:10px; border-radius:8px; background:rgba(0,0,0,0.82); color:#fff;
    font:11px/1.45 ui-monospace,Menlo,Consolas,monospace; white-space:pre-wrap; word-break:break-all;
    cursor:pointer; touch-action:manipulation; }
  .bio { position:absolute; top:0; left:0; right:0; bottom:0; z-index:3; display:none; overflow-y:auto;
    box-sizing:border-box; padding:18px 20px 44px; background:rgba(0,0,0,0.86); color:#fff;
    font-family:Roboto,'Helvetica Neue',Arial,sans-serif; font-size:0.95rem; line-height:1.45;
    cursor:pointer; touch-action:pan-y; }
  .bio h3 { margin:0 0 4px; font-size:1.3rem; font-weight:700; }
  .bio p { margin:0 0 10px; }
  .bio p.m { opacity:0.65; font-size:0.8rem; }
  .zoom { position:absolute; top:0; left:0; right:0; bottom:var(--bar-h); z-index:5; display:none;
    align-items:center; justify-content:center; background:rgba(0,0,0,0.82);
    backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); cursor:pointer; touch-action:manipulation; }
  .zimg { flex:none; height:88%; aspect-ratio:1/1; border-radius:6px; background-size:cover;
    background-position:center; background-repeat:no-repeat; box-shadow:0 8px 30px rgba(0,0,0,0.7);
    animation:zin 0.2s ease-out; pointer-events:none; }
  @keyframes zin { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
  @keyframes scroll { 0%, 12% { transform:translateX(0); } 88%, 100% { transform:translateX(var(--dx)); } }
  .bar { position:absolute; bottom:0; left:0; right:0; height:var(--bar-h); background:rgb(42,42,46); z-index:6;
    box-sizing:border-box; padding:16px var(--pad) 0 var(--pad); }
  .row { display:flex; align-items:flex-start; width:100%; }
  .cover { flex:none; width:72px; height:72px; border-radius:3px; background-size:cover; background-position:center;
    background-repeat:no-repeat; box-shadow:0 1px 4px rgba(0,0,0,0.35); margin-right:14px; cursor:pointer;
    touch-action:manipulation; }
  .info { display:flex; flex-direction:column; align-items:stretch; text-align:left; flex:1; min-width:0; gap:2px;
    font-family:Roboto,'Helvetica Neue',Arial,sans-serif; -webkit-font-smoothing:antialiased; }
  .l1 { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .tw { flex:1; min-width:0; color:#fff; font-size:1.4rem; font-weight:700; line-height:1.15; letter-spacing:-0.01em;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .time { color:#fff; font-size:0.8rem; font-weight:600; white-space:nowrap; flex-shrink:0; }
  .sw { color:#fff; font-size:1.1rem; font-weight:400; line-height:1.25; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; }
  .tw span, .sw span { display:inline-block; }
  .ctl { display:flex; align-items:center; margin-top:-2px; }
  .nb .ctl { display:none; }
  .nb .seek { cursor:default; }
  .vicon { display:flex; align-items:center; flex-shrink:0; margin-left:-3px; }
  .btns { display:flex; align-items:center; gap:26px; flex-shrink:0; }
  .btn { cursor:pointer; display:flex; align-items:center; justify-content:center; padding:6px; margin:-6px;
    touch-action:manipulation; }
  .btn.last { margin-right:-12.5px; }
  .vol { -webkit-appearance:none; appearance:none; flex:1; min-width:0; height:22px; margin:0 20px 0 10px;
    background:transparent; cursor:pointer; touch-action:manipulation; }
  .vol::-webkit-slider-runnable-track { height:6px; border-radius:3px;
    background:linear-gradient(to right,#f29d38 var(--v),#cfcfcf var(--v)); }
  .vol::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; border-radius:50%;
    background:#f29d38; margin-top:-7px; border:none; }
  .vol::-moz-range-track { height:6px; border-radius:3px;
    background:linear-gradient(to right,#f29d38 var(--v),#cfcfcf var(--v)); }
  .vol::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:#f29d38; border:none; }
  .seek { position:absolute; bottom:0; left:0; right:0; height:16px; cursor:pointer; z-index:3;
    touch-action:manipulation; }
  .seek-track { position:absolute; bottom:0; left:0; right:0; height:5px; background:rgba(255,255,255,0.15);
    overflow:hidden; pointer-events:none; }
  .seek-bar { height:100%; background:#f29d38; width:0%; }
</style>
<ha-card class="${o.nobuttons ? 'nb' : ''}">
  <div class="bg" id="bg">
    <div class="bgl" id="bga"></div>
    <div class="bgl" id="bgb"></div>
    <div class="lyr" id="lyr"><div class="lyr-in" id="lyrIn"></div></div>
    <div class="dbg" id="dbg"></div>
    <div class="bio" id="bio"></div>
    <div class="pill" id="pill"></div>
  </div>
  <div class="zoom" id="zoom"><div class="zimg" id="zimg"></div></div>
  <div class="bar">
    <div class="row">
      <div class="cover" id="cover"></div>
      <div class="info">
        <div class="l1">
          <div class="tw" id="tw"><span id="title"></span></div>
          <div class="time" id="time"></div>
        </div>
        <div class="sw" id="sw"><span id="sub"></span></div>
        <div class="ctl">
          <div class="vicon">${svg(26, ICON.vol)}</div>
          <input class="vol" id="vol" type="range" min="0" max="100" value="0">
          <div class="btns">
            <div class="btn" id="prev">${svg(26, ICON.prev)}</div>
            <div class="btn" id="pp">${svg(30, ICON.play)}</div>
            <div class="btn last" id="next">${svg(26, ICON.next)}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="seek" id="seek"><div class="seek-track"><div class="seek-bar" id="sbar"></div></div></div>
  </div>
</ha-card>`;

      const $ = (id) => this.shadowRoot.getElementById(id);
      this._el = {
        bg: $('bg'), bga: $('bga'), bgb: $('bgb'), lyr: $('lyr'), lyrIn: $('lyrIn'), pill: $('pill'), dbg: $('dbg'),
        bio: $('bio'), zoom: $('zoom'), zimg: $('zimg'), cover: $('cover'), tw: $('tw'), title: $('title'),
        time: $('time'), sw: $('sw'), sub: $('sub'), vol: $('vol'), prev: $('prev'), pp: $('pp'), next: $('next'),
        seek: $('seek'), sbar: $('sbar')
      };
      this._front = this._el.bga;
      this._back = this._el.bgb;
      if (this._opts.debug) this._el.pill.style.pointerEvents = 'auto';

      // State
      this._slides = []; this._bgKey = null; this._bgIdx = 0; this._bgLast = Date.now();
      this._titleTxt = null; this._subKey = null; this._coverUrl = null; this._trackKey = null;
      this._playing = null; this._lyr = null; this._lyrBuilt = null; this._lyrIdx = -2;
      this._zoom = false; this._zoomUntil = 0; this._zoomKey = null;
      this._volHold = 0; this._volSent = null; this._pos = { base: 0, at: Date.now(), playing: false, dur: 0 };
      this._hbTs = null; this._hbAt = Date.now(); this._evalAt = 0;
      this._artFail = false; this._dbgOpen = false;
      this._bioIdx = -1; this._bioKey = null; this._adW = {};
      this._d = null;
      this._bind();
      this._built = true;
    }

    _bind() {
      const e = this._el;
      onTap(e.cover, () => this._setZoom(!this._zoom));
      onTap(e.bg, () => this._setZoom(!this._zoom));
      onTap(e.zoom, () => this._setZoom(false));
      onTap(e.prev, () => this._svc('media_previous_track'));
      onTap(e.pp, () => this._svc('media_play_pause'));
      onTap(e.next, () => this._svc('media_next_track'));
      onTap(e.seek, (ev) => {
        if (this._opts.nobuttons || !this._pos.dur) return;
        const r = e.seek.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        this._svc('media_seek', { seek_position: f * this._pos.dur });
      });

      // Biography: tap an artist name to open it, tap the panel to close it
      onTap(e.sw, (ev) => {
        const n = ev.target && ev.target.closest ? ev.target.closest('.ra') : null;
        if (n) this._toggleBio(parseInt(n.getAttribute('data-i'), 10));
      });
      onTap(e.bio, () => this._toggleBio(-1));

      // Debug panel: tap the pill to open, tap the panel to close
      const toggleDbg = () => {
        if (!this._opts.debug) return;
        this._dbgOpen = !this._dbgOpen;
        e.dbg.style.display = this._dbgOpen ? 'block' : 'none';
        this._renderDebug();
      };
      onTap(e.pill, toggleDbg);
      onTap(e.dbg, toggleDbg);

      // Volume: send on input (debounced), on change and after releasing the slider
      const vs = e.vol;
      let t = null;
      const send = () => {
        clearTimeout(t);
        const v = Math.round(Number(vs.value));
        if (v === this._volSent) return;
        this._volSent = v;
        this._volHold = Date.now() + 2000;
        this._svc('volume_set', { volume_level: v / 100 });
      };
      vs.addEventListener('input', () => {
        vs.style.setProperty('--v', vs.value + '%');
        this._volHold = Date.now() + 2000;
        clearTimeout(t);
        t = setTimeout(send, 250);
      });
      vs.addEventListener('change', send);
      vs.addEventListener('pointerup', () => setTimeout(send, 0));
      vs.addEventListener('click', (ev) => ev.stopPropagation());
    }

    _setZoom(v) {
      this._zoom = v;
      this._zoomKey = this._trackKey;
      this._zoomUntil = v ? Date.now() + Number(this._cfg.zoom_seconds) * 1000 : 0;
      this._el.zoom.style.display = v ? 'flex' : 'none';
    }

    // Has the bridge heartbeat stopped? Only the change of the timestamp counts, not its value,
    // so a wrong clock on the display does not matter.
    _heartbeat(bi) {
      const to = Number(this._cfg.heartbeat_timeout);
      const ts = bi.attrs && bi.attrs.timestamp;
      if (!to || !ts || bi.status !== 'online') {
        this._hbTs = ts || null;
        this._hbAt = Date.now();
        return false;
      }
      if (ts !== this._hbTs) { this._hbTs = ts; this._hbAt = Date.now(); }
      return Date.now() - this._hbAt > to * 1000;
    }

    // ----- Data -> DOM -----
    _update() {
      const c = this._cfg, o = this._opts, el = this._el, hass = this._hass;
      this._evalAt = Date.now();
      const pl = hass.states[c.player];
      if (!pl) { el.title.textContent = 'Player not found: ' + c.player; return; }
      const a = pl.attributes || {};
      const title = a.media_title || 'Roon ready';
      const artist = a.media_artist || '';

      // Bridge status, heartbeat and whether the bridge data can be used
      const bi = bridgeInfo(hass.states, c);
      const silent = this._heartbeat(bi);
      const reason = staleReason(hass.states, c, o, bi, silent);
      const stale = !!reason;
      const ib = imageBase(c, bi);
      const base = ib.url;
      const mixed = !!base && location.protocol === 'https:' && base.indexOf('http:') === 0;

      const json = (c.sensor && hass.states[c.sensor] && hass.states[c.sensor].attributes) || {};
      const np = stale ? {} : (json.now_playing || {});
      const album = np.album || a.media_album_name || '';
      const names = String(artist).split(' / ').map(function (x) { return x.trim(); }).filter(Boolean);
      const fmt = formatInfo(c, a, stale ? {} : json, np);

      // Images: cover first, then artist images of all artists
      const pic = a.entity_picture || '';
      const cover = (base && np.image_key) ? base + np.image_key + '?scale=fit&width=600&height=600' : pic;
      const keys = !base ? [] : ((Array.isArray(np.artist_keys) && np.artist_keys.length)
        ? np.artist_keys : (np.artist_key ? [np.artist_key] : []));
      const slides = [];
      if (cover) slides.push({ u: cover, m: 'fit', kind: 'cover' });
      keys.forEach(function (k, i) {
        (i === 0 ? c.bg_aspects_main : c.bg_aspects_other).forEach(function (asp) {
          slides.push({ u: base + k + '?aspect=' + asp, m: 'fill', kind: 'artist', ai: i, asp: asp });
        });
      });

      // TheAudioDB: extra images (requests run in the background; the card updates when the data arrives).
      // This works without the bridge too: the artist names come from the media player.
      const adInfo = [];
      let extCount = 0;
      if (audiodbEnabled(c)) {
        const mode = String(c.audiodb_images || 'extra').toLowerCase();
        const wantImg = mode === 'extra' || (mode === 'fallback' && !keys.length);
        names.slice(0, 3).forEach((n, ai) => {
          const r = audiodbRecord(c, n);
          adInfo.push(n + ': ' + r.state + (r.state === 'ok' && !r.rec ? ' (unknown)' : ''));
          if (r.state === 'loading') this._adWait(nzu(n), r.p);
          if (wantImg && r.state === 'ok') {
            audiodbImages(r.rec).forEach(function (im) {
              slides.push({ u: im.u, m: 'fill', kind: 'artist', ai: ai, asp: im.kind, ext: true });
              extCount++;
            });
          }
        });
      }

      this._d = {
        stale: stale, reason: reason, bi: bi, names: names, nKeys: Math.max(keys.length, extCount ? names.length : 0),
        fmt: fmt, base: base, baseSrc: ib.src, mixed: mixed, adInfo: adInfo.join('; '),
        noUrl: !!c.sensor && !base && !stale && !!np.image_key,
        statusMissing: this._statusExplicit && !bi.exists
      };

      // New track: close the cover zoom and the biography
      const trackKey = title + '|' + artist;
      if (trackKey !== this._trackKey) {
        this._trackKey = trackKey;
        if (this._zoom && this._zoomKey !== trackKey) this._setZoom(false);
        if (this._bioIdx >= 0) { this._bioIdx = -1; this._renderBio(); }
      }

      // Title and "Artist - Album"
      let needMarquee = false;
      if (title !== this._titleTxt) { this._titleTxt = title; el.title.textContent = title; needMarquee = true; }
      const subKey = names.join('/') + '|' + album;
      if (subKey !== this._subKey) {
        this._subKey = subKey;
        let h = names.map(function (n, i) {
          return '<span class="ra" data-i="' + i + '" style="text-underline-offset:3px;">' + esc(n) + '</span>';
        }).join(' / ');
        if (album) h += (h ? ' - ' : '') + esc(album);
        el.sub.innerHTML = h;
        needMarquee = true;
      }
      if (needMarquee) this._marquee();

      // Cover (bar and zoom)
      if (cover !== this._coverUrl) {
        this._coverUrl = cover;
        const bgi = cover ? "url('" + cover + "')" : 'none';
        el.cover.style.backgroundImage = bgi;
        el.zimg.style.backgroundImage = bgi;
      }

      // Play/pause icon
      const isPlaying = pl.state === 'playing';
      if (isPlaying !== this._playing) {
        this._playing = isPlaying;
        el.pp.innerHTML = isPlaying ? svg(30, ICON.pause) : svg(30, ICON.play);
      }

      // Volume (not while the user is touching it)
      const vol = Math.round((a.volume_level || 0) * 100);
      if (Date.now() > this._volHold) {
        el.vol.value = vol;
        el.vol.style.setProperty('--v', vol + '%');
        this._volSent = vol;
      }

      // Playback position
      this._pos = {
        base: a.media_position || 0,
        at: a.media_position_updated_at ? new Date(a.media_position_updated_at).getTime() : Date.now(),
        playing: isPlaying,
        dur: a.media_duration || 0
      };

      // Image rotation: restart when the set of images changes
      const bgKey = slides.map(function (s) { return s.u; }).join('|');
      const prevKey = this._bgKey;
      this._slides = slides;
      if (bgKey !== prevKey) {
        // Only new images added at the end (e.g. TheAudioDB data arrived later): keep the current image and timing
        const appended = !!prevKey && bgKey.indexOf(prevKey + '|') === 0;
        this._bgKey = bgKey;
        if (!appended) {
          this._bgIdx = 0;
          this._bgLast = Date.now();
          this._artFail = false;
          this._showSlide(0, true);

          // Probe the first Roon artist image once to detect an unreachable image server
          const probe = slides.filter(function (s) { return s.kind === 'artist' && !s.ext; })[0];
          if (probe) {
            const im = new Image();
            im.onerror = () => { if (bgKey === this._bgKey) { this._artFail = true; this._applyMeta(); } };
            im.src = probe.u;
          }
        }
      }

      this._updateLyrics(title, artist, album, this._pos.dur);
      if (this._bioIdx >= 0) this._renderBio();
      this._applyMeta();
    }

    // Pill and underline follow the currently shown image
    _applyMeta() {
      const o = this._opts, el = this._el, d = this._d;
      if (!d) return;
      const s = this._slides.length ? this._slides[this._bgIdx % this._slides.length] : null;
      const p = [];
      if (!o.nostatus) {
        if (s) {
          // The image source comes first: roon = Roon (image API or media player), tadb = TheAudioDB
          // nosource only leaves out the words "Artist" and "Cover": the source and the number stay
          const src = s.ext ? 'tadb' : 'roon';
          if (s.kind === 'artist') {
            p.push([src, o.nosource ? '' : 'Artist', d.nKeys > 1 ? (s.ai + 1) + '/' + d.nKeys : ''].filter(Boolean).join(' '));
            if (!o.noaspect) p.push(s.asp);
          } else {
            p.push([src, o.nosource ? '' : 'Cover'].filter(Boolean).join(' '));
          }
        }
        if (d.noUrl) p.push('no image url');
        if (d.mixed) p.push('mixed content');
        else if (this._artFail) p.push('artwork unreachable');
        if (d.stale) {
          p.push('Fallback');
          if (d.reason.indexOf('bridge') === 0) p.push(d.reason);
        }
        if (d.statusMissing) p.push('status sensor missing');
        if (d.fmt && !o.noformat) p.push(d.fmt);
      }
      let txt = p.join(' · ');
      if (o.debug && !txt) txt = 'debug';
      el.pill.textContent = txt;
      el.pill.style.display = txt ? 'block' : 'none';

      const act = (!o.nounderline && s && s.kind === 'artist' && d.names.length > 1) ? s.ai : -1;
      el.sub.querySelectorAll('.ra').forEach(function (n) {
        n.style.textDecoration = (parseInt(n.getAttribute('data-i'), 10) === act) ? 'underline' : 'none';
      });
      if (this._dbgOpen) this._renderDebug();
    }

    // Diagnostic panel (options: [debug])
    _renderDebug() {
      if (!this._dbgOpen) return;
      const d = this._d, c = this._cfg;
      if (!d) { this._el.dbg.textContent = 'no data yet'; return; }
      const a = d.bi.attrs || {};
      const cur = this._slides.length ? this._slides[this._bgIdx % this._slides.length] : null;
      const hbAge = a.timestamp ? Math.round((Date.now() - this._hbAt) / 1000) + ' s' : 'n/a';
      const lines = [
        'roon-player-card',
        '',
        'player: ' + c.player,
        'sensor: ' + (c.sensor || '(none, player-only mode)'),
        'status sensor: ' + c.status_sensor + (d.bi.exists ? '' : ' (NOT FOUND)'),
        '',
        'bridge status: ' + (d.bi.status || '(unknown)'),
        'bridge version: ' + (a.bridge_version || 'n/a'),
        'core: ' + (a.core ? a.core.name + ' ' + a.core.version : 'n/a'),
        'heartbeat age: ' + hbAge + ' (limit ' + (Number(c.heartbeat_timeout) || 'off') + ')',
        'fallback: ' + (d.stale ? 'YES, ' + d.reason : 'no'),
        '',
        'image base: ' + (d.base || '(none)') + ' [' + d.baseSrc + ']',
        'page protocol: ' + location.protocol + (d.mixed ? ' (mixed content!)' : ''),
        'artwork probe: ' + (this._artFail ? 'FAILED' : 'ok / not tested'),
        'slides: ' + this._slides.length + ' (now: ' + (this._bgIdx + 1) + ')',
        'image interval: ' + Math.round(this._interval() / 1000) + ' s',
        'current image: ' + (cur ? cur.u : '(none)'),
        'format: ' + (d.fmt || '(none)'),
        '',
        'audiodb: ' + (audiodbEnabled(c)
          ? ((c.audiodb_url ? 'cache ' + c.audiodb_url + (c.audiodb_key ? ' + ' : '') : '') + (c.audiodb_key ? 'direct' : ''))
          : 'off') + (d.adInfo ? ' | ' + d.adInfo : '')
      ];
      this._el.dbg.textContent = lines.join('\n');
    }

    // ----- Biography (TheAudioDB) -----
    _adWait(k, p) {
      if (this._adW[k]) return;
      this._adW[k] = true;
      const done = () => { delete this._adW[k]; if (this._hass && this._built) this._update(); };
      p.then(done, done);
    }

    _toggleBio(i) {
      if (!audiodbEnabled(this._cfg) || this._opts.nobio) return;
      this._bioIdx = (i < 0 || i === this._bioIdx) ? -1 : i;
      this._bioKey = null;
      this._renderBio();
    }

    _renderBio() {
      const el = this._el.bio, d = this._d, i = this._bioIdx;
      const name = (d && i >= 0) ? d.names[i] : '';
      if (!name) { el.style.display = 'none'; el.textContent = ''; this._bioKey = null; return; }
      const r = audiodbRecord(this._cfg, name);
      if (r.state === 'loading') this._adWait(nzu(name), r.p);
      const bio = (r.state === 'ok' && r.rec) ? pickBio(r.rec, this._langs) : null;
      const key = [name, r.state, bio ? bio.lang + bio.text.length : ''].join('|');
      if (key === this._bioKey) return;       // nothing changed: keep the scroll position
      this._bioKey = key;
      el.textContent = '';
      const add = function (tag, txt, cls) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        n.textContent = txt;
        el.appendChild(n);
      };
      const rec = r.rec || {};
      add('h3', rec.strArtist || name);
      const meta = [rec.strCountry, rec.strGenre,
        rec.intBornYear ? 'born ' + rec.intBornYear : (rec.intFormedYear ? 'formed ' + rec.intFormedYear : '')]
        .filter(Boolean).join(' \u00b7 ');
      if (meta) add('p', meta, 'm');
      if (bio) {
        bio.text.split(/\r?\n+/).forEach(function (par) { par = fixMojibake(par.trim()); if (par) add('p', par); });
        add('p', 'TheAudioDB \u00b7 ' + bio.lang, 'm');
      } else {
        add('p', r.state === 'loading' ? 'Loading...' : r.state === 'error' ? 'TheAudioDB not reachable'
          : 'No biography available (' + this._langs.join(', ') + ')', 'm');
      }
      el.style.display = 'block';
      el.scrollTop = 0;
    }

    // ----- Image rotation -----
    // Seconds per image: shorter with many images, so that one pass takes about bg_cycle seconds
    _interval() {
      const c = this._cfg, n = this._slides.length || 1;
      const max = Number(c.bg_interval) || 15;
      const min = Math.min(max, Number(c.bg_interval_min) || 10);
      const cyc = Number(c.bg_cycle) || 0;
      return (cyc > 0 ? Math.max(min, Math.min(max, cyc / n)) : max) * 1000;
    }

    _applyLayer(layer, s) {
      const fit = s.m === 'fit';
      layer.style.backgroundImage = "url('" + s.u + "')";
      layer.style.backgroundSize = fit ? this._cfg.cover_fit : 'cover';
      layer.style.backgroundPosition = fit ? 'center center' : 'center top';
    }

    _showSlide(idx, instant) {
      const s = this._slides[idx];
      if (!s) {
        this._front.style.opacity = 0; this._back.style.opacity = 0;
        return;
      }
      if (instant) {
        this._applyLayer(this._front, s);
        this._front.style.opacity = 1;
        this._back.style.opacity = 0;
        return;
      }
      const im = new Image();
      const key = this._bgKey;
      im.onload = () => {
        if (key !== this._bgKey) return;
        this._bgIdx = idx;
        this._applyLayer(this._back, s);
        this._back.style.opacity = 1;
        this._front.style.opacity = 0;
        const t = this._front; this._front = this._back; this._back = t;
        this._applyMeta();
      };
      im.onerror = () => { if (key === this._bgKey) this._bgIdx = idx; };
      im.src = s.u;
    }

    // ----- Marquee -----
    _marquee() {
      const el = this._el;
      [[el.tw, el.title], [el.sw, el.sub]].forEach(function (pair) {
        pair[1].style.animation = 'none';
        pair[0].style.textOverflow = 'ellipsis';
      });
      if (this._opts.noscroll) return;
      requestAnimationFrame(() => {
        [[el.tw, el.title], [el.sw, el.sub]].forEach(function (pair) {
          const w = pair[0], e = pair[1];
          const overflow = e.scrollWidth - w.clientWidth;
          if (overflow > 2) {
            const dist = overflow + 12;
            const secs = Math.max(6, (dist / 40) * 1.3);
            w.style.textOverflow = 'clip';
            e.style.setProperty('--dx', '-' + dist + 'px');
            e.style.animation = 'scroll ' + secs + 's linear infinite alternate';
          }
        });
      });
    }

    // ----- Lyrics -----
    _updateLyrics(title, artist, album, dur) {
      if (this._opts.nosongtext) { this._el.lyr.style.display = 'none'; return; }
      const first = String(artist || '').split(' / ')[0].trim();
      const key = [first, title, album, Math.round(dur)].join('|');
      const L = this._lyr;
      if (L && L.key === key && !(L.retryAt && Date.now() > L.retryAt)) return;
      const cur = { key: key, lines: null };
      this._lyr = cur;
      fetchLyrics(first, title, album, Math.round(dur)).then((lines) => {
        if (this._lyr !== cur) return;
        if (lines === null) { cur.lines = []; cur.retryAt = Date.now() + 60000; } else { cur.lines = lines; }
      }).catch(() => {
        if (this._lyr !== cur) return;
        cur.lines = []; cur.retryAt = Date.now() + 60000;
      });
    }

    _curPos() {
      const p = this._pos;
      let pos = p.base;
      if (p.playing) pos += Math.max(0, (Date.now() + clockOff - p.at) / 1000);
      return pos;
    }

    // ----- 250 ms loop: progress, lyrics, rotation, zoom timeout, heartbeat re-check -----
    _tick() {
      const el = this._el;
      const c = this._cfg;
      if (!this._hass) return;

      // Re-evaluate every 5 s even without state changes, so a silent bridge is detected
      if (Date.now() - this._evalAt > 5000) this._update();

      // Progress and time
      const dur = this._pos.dur;
      let pos = this._curPos();
      if (dur > 0 && pos > dur) pos = dur;
      const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
      el.sbar.style.width = pct + '%';
      el.time.textContent = dur > 0 ? fmtTime(pos) + ' / ' + fmtTime(dur) : '';

      // Image rotation (the interval gets shorter with many images)
      if (this._slides.length > 1 && Date.now() - this._bgLast >= this._interval()) {
        this._bgLast = Date.now();
        this._showSlide((this._bgIdx + 1) % this._slides.length, false);
      }

      // Cover zoom timeout
      if (this._zoom && Date.now() > this._zoomUntil) this._setZoom(false);

      // Lyrics
      if (this._opts.nosongtext) return;
      const L = this._lyr;
      if (!L || !L.lines || !L.lines.length) { el.lyr.style.display = 'none'; return; }
      if (this._lyrBuilt !== L) {
        el.lyrIn.innerHTML = L.lines.map(function (l) { return '<div class="rl">' + esc(l.text) + '</div>'; }).join('');
        this._lyrBuilt = L;
        this._lyrIdx = -2;
      }
      el.lyr.style.display = 'block';
      const lp = pos + (Number(c.lyrics_offset) || 0);
      let idx = -1;
      for (let i = 0; i < L.lines.length; i++) { if (L.lines[i].t <= lp) idx = i; else break; }
      if (idx === this._lyrIdx) return;
      this._lyrIdx = idx;
      const kids = el.lyrIn.children;
      for (let i = 0; i < kids.length; i++) {
        const dd = Math.abs(i - idx), k = kids[i];
        if (dd === 0) { k.style.opacity = 1; k.style.fontSize = '1.5rem'; k.style.fontWeight = '700'; }
        else { k.style.opacity = Math.max(0.1, 0.6 - dd * 0.14); k.style.fontSize = '1.25rem'; k.style.fontWeight = '500'; }
      }
      // Measure the active line after the font change and center it
      const H = el.lyr.clientHeight || 300;
      const shift = (idx >= 0 && kids[idx])
        ? H / 2 - (kids[idx].offsetTop + kids[idx].offsetHeight / 2)
        : H / 2 + LYR_LINE_H / 2;
      el.lyrIn.style.transform = 'translateY(' + Math.round(shift) + 'px)';
    }
  }

  if (!customElements.get('roon-player-card')) {
    customElements.define('roon-player-card', RoonPlayerCard);
  }
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'roon-player-card',
    name: 'Roon Player Card',
    description: 'Now-playing card with artist images, lyrics and transport controls'
  });
  console.info('%c roon-player-card ', 'background:#f29d38;color:#000');
})();
