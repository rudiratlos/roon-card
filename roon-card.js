/*
 * Roon Player Card
 * Custom Lovelace card: artist image rotation, cover, transport controls, lyrics (LRCLIB), status pill.
 * No dependencies on other cards. Usage: type: custom:roon-player-card
 */
(function () {
  'use strict';

  const VERSION = '2.1.1';

  // No installation-specific values here. Everything is passed as card options.
  const DEFAULTS = {
    player: '',                            // required: media player entity
    sensor: '',                            // optional: bridge sensor with now_playing attributes
    status_sensor: '',                     // optional: sensor holding the bridge status topic (online/offline/...)
    roon_url: '',                          // optional: base URL of the Roon image API (ending in /api/image/)
    clock_url: '/',                        // URL used for the clock sync (only the Date header is read)
    bg_aspects_main: ['12by10', '4by3'],   // aspect ratios for the first artist
    bg_aspects_other: ['12by10'],          // aspect ratios for further artists
    bg_interval: 15,                       // seconds per image
    zoom_seconds: 30,                      // cover zoom hides itself after this time
    cover_fit: 'contain',                  // 'contain' = whole cover, 'cover' = fill
    lyrics: true,                          // false = lyrics off (same as 'nosongtext')
    lyrics_dim: 0.55,                      // dimming of the image behind the lyrics
    lyrics_offset: 0.2,                    // seconds: positive = lyrics earlier, negative = later
    format_attr: '',                       // attribute name(s) shown as audio format, e.g. [sample_rate, bit_depth]
    // Switches, e.g. options: [nosongtext, noaspect, nostatus]
    //   nosongtext   lyrics off
    //   noaspect     do not show the aspect ratio in the pill
    //   nostatus     status pill off
    //   noformat     do not show the audio format
    //   nounderline  do not underline the artist name
    //   noscroll     no marquee for title/artist/album (use "..." instead)
    //   nostale      disable the "bridge data is outdated" check (title match and bridge status)
    options: [],
    bar_h: 112,                            // height of the bottom bar in px
    pad: 20,                               // horizontal padding of the bottom bar in px
    max_height: '85vh'                     // maximum card height (any CSS length)
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

  // Image API base URL with exactly one trailing slash (empty = not configured)
  function imgBase(c) {
    const u = String(c.roon_url || '').trim();
    return u ? u.replace(/\/+$/, '') + '/' : '';
  }

  const nz = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, ''); };
  function sameTrack(a, b) {
    a = nz(a); b = nz(b);
    if (!a || !b) return false;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  // Status published by the bridge. Returns '' if unknown (no sensor, unavailable, unknown).
  function bridgeStatus(states, c) {
    if (!c.status_sensor) return '';
    const e = states[c.status_sensor];
    if (!e) return '';
    const s = String(e.state || '').toLowerCase();
    return (s === 'unavailable' || s === 'unknown') ? '' : s;
  }

  // A configured status sensor that does not exist (typo in the entity id)
  function statusSensorMissing(states, c) {
    return !!c.status_sensor && !states[c.status_sensor];
  }

  // Sensor data outdated? A bridge status other than "online" means fallback immediately.
  // Otherwise, if the title differs, equal length plus equal artist still counts as a match.
  function isStale(states, c, o) {
    if (o.nostale) return false;
    const st = bridgeStatus(states, c);
    if (st && st !== 'online') return true;
    if (!c.sensor) return false;
    const player = states[c.player];
    if (!player) return false;
    const a = player.attributes || {};
    const json = (states[c.sensor] && states[c.sensor].attributes) || {};
    const np = json.now_playing || {};
    if (!np.track) return true;
    if (sameTrack(np.track, a.media_title)) return false;
    if (np.length && a.media_duration && Math.abs(np.length - a.media_duration) <= 2 &&
        sameTrack(np.artist, a.media_artist)) return false;
    return true;
  }

  // Audio format, only if the player or sensor provides it
  function formatInfo(c, a, json, np) {
    let names = c.format_attr;
    if (typeof names === 'string') names = names.split(/[\s,;]+/);
    if (!Array.isArray(names)) return '';
    const out = [];
    names.forEach(function (n) {
      if (!n) return;
      const v = [a[n], json[n], np[n]].filter(function (x) { return x !== undefined && x !== null && x !== ''; })[0];
      if (v !== undefined) out.push(String(v));
    });
    return out.join(' ');
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
      else return s;                      // real Unicode character: leave untouched
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch (e) {
      return s;                           // not valid UTF-8: leave unchanged
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

  // ---------- The card ----------
  class RoonPlayerCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._built = false;
      this._hass = null;
    }

    static getStubConfig() { return { player: 'media_player.example' }; }

    setConfig(config) {
      if (!config || !config.player) throw new Error("Option 'player' is required");
      this._cfg = Object.assign({}, DEFAULTS, config);
      this._opts = parseOpts(this._cfg);
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
      const c = this._cfg;
      const mh = c.max_height;
      this.shadowRoot.innerHTML = `
        <style>
          :host { display:block; container-type:inline-size; }
          ha-card { position:relative; overflow:hidden; width:100%; box-sizing:border-box; padding:0; margin:0;
            background:rgb(42,42,46); border-radius:16px; height:${mh}; height:min(${mh},100cqw);
            --bar-h:${c.bar_h}px; --pad:${c.pad}px; }
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
          .pill { position:absolute; right:10px; bottom:10px; display:none; padding:3px 10px; border-radius:999px;
            background:rgba(0,0,0,0.55); color:#fff; font-family:Roboto,'Helvetica Neue',Arial,sans-serif;
            font-size:0.72rem; font-weight:500; letter-spacing:0.02em; pointer-events:none; }
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
        <ha-card>
          <div class="bg" id="bg">
            <div class="bgl" id="bga"></div>
            <div class="bgl" id="bgb"></div>
            <div class="lyr" id="lyr"><div class="lyr-in" id="lyrIn"></div></div>
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
        bg: $('bg'), bga: $('bga'), bgb: $('bgb'), lyr: $('lyr'), lyrIn: $('lyrIn'), pill: $('pill'),
        zoom: $('zoom'), zimg: $('zimg'), cover: $('cover'), tw: $('tw'), title: $('title'), time: $('time'),
        sw: $('sw'), sub: $('sub'), vol: $('vol'), prev: $('prev'), pp: $('pp'), next: $('next'),
        seek: $('seek'), sbar: $('sbar')
      };
      this._front = this._el.bga;
      this._back = this._el.bgb;

      // State
      this._slides = []; this._bgKey = null; this._bgIdx = 0; this._bgLast = Date.now();
      this._titleTxt = null; this._subKey = null; this._coverUrl = null; this._trackKey = null;
      this._playing = null; this._lyr = null; this._lyrBuilt = null; this._lyrIdx = -2;
      this._zoom = false; this._zoomUntil = 0; this._zoomKey = null;
      this._volHold = 0; this._volSent = null; this._pos = { base: 0, at: Date.now(), playing: false, dur: 0 };
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
        if (!this._pos.dur) return;
        const r = e.seek.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        this._svc('media_seek', { seek_position: f * this._pos.dur });
      });

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

    // ----- Data -> DOM -----
    _update() {
      const c = this._cfg, o = this._opts, el = this._el, hass = this._hass;
      const pl = hass.states[c.player];
      if (!pl) { el.title.textContent = 'Player not found: ' + c.player; return; }
      const a = pl.attributes || {};
      const title = a.media_title || 'Roon ready';
      const artist = a.media_artist || '';
      const base = imgBase(c);

      // Use bridge data only if the bridge is online and the data matches the current track
      const json = (c.sensor && hass.states[c.sensor] && hass.states[c.sensor].attributes) || {};
      const stale = isStale(hass.states, c, o);
      const bridge = bridgeStatus(hass.states, c);
      const statusMissing = statusSensorMissing(hass.states, c);
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

      this._d = { stale: stale, bridge: bridge, statusMissing: statusMissing, names: names, nKeys: keys.length, fmt: fmt };

      // New track: close the cover zoom
      const trackKey = title + '|' + artist;
      if (trackKey !== this._trackKey) {
        this._trackKey = trackKey;
        if (this._zoom && this._zoomKey !== trackKey) this._setZoom(false);
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
      this._slides = slides;
      if (bgKey !== this._bgKey) {
        this._bgKey = bgKey;
        this._bgIdx = 0;
        this._bgLast = Date.now();
        this._showSlide(0, true);
      }

      this._updateLyrics(title, artist, album, this._pos.dur);
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
          if (s.kind === 'artist') {
            p.push(d.nKeys > 1 ? 'Artist ' + (s.ai + 1) + '/' + d.nKeys : 'Artist');
            if (!o.noaspect) p.push(s.asp);
          } else {
            p.push('Cover');
          }
        }
        if (d.stale) {
          p.push('Fallback');
          if (d.bridge && d.bridge !== 'online') p.push('bridge ' + d.bridge.replace(/_/g, ' '));
        }
        if (d.statusMissing) p.push('status sensor missing');
        if (d.fmt && !o.noformat) p.push(d.fmt);
      }
      const txt = p.join(' · ');
      el.pill.textContent = txt;
      el.pill.style.display = txt ? 'block' : 'none';

      const act = (!o.nounderline && s && s.kind === 'artist' && d.names.length > 1) ? s.ai : -1;
      el.sub.querySelectorAll('.ra').forEach(function (n) {
        n.style.textDecoration = (parseInt(n.getAttribute('data-i'), 10) === act) ? 'underline' : 'none';
      });
    }

    // ----- Image rotation -----
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

    // ----- 250 ms loop: progress, lyrics, rotation, zoom timeout -----
    _tick() {
      const el = this._el, c = this._cfg;
      if (!this._hass) return;

      // Progress and time
      const dur = this._pos.dur;
      let pos = this._curPos();
      if (dur > 0 && pos > dur) pos = dur;
      const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
      el.sbar.style.width = pct + '%';
      el.time.textContent = dur > 0 ? fmtTime(pos) + ' / ' + fmtTime(dur) : '';

      // Image rotation
      if (this._slides.length > 1 && Date.now() - this._bgLast >= Number(c.bg_interval) * 1000) {
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
  console.info('%c roon-player-card %c v' + VERSION + ' ', 'background:#f29d38;color:#000', 'background:#333;color:#fff');
})();
