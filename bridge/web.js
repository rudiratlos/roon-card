'use strict';

// Optional web module for the bridge (loaded by app.js if this file exists and WEB_PORT is set).
// Serves the Roon card as a standalone page, so it runs without Home Assistant:
//
//   GET  /           web/index.html (the page that hosts the card)
//   GET  /roon-card.js   the card itself
//   GET  /events     Server-Sent Events: "zone" (one per zone update) and "status" (bridge status)
//   POST /control    ?zone=<zone_id>&cmd=playpause|next|previous|seek|volume&value=<n>
//   GET  /audiodb    ?artist=<name>   TheAudioDB data (artist images, biography) with a cache.
//                    Only active if THEAUDIODB_KEY is set; otherwise it answers 503 and the card
//                    does not ask for it again. Works independently of Roon.
//
// The data is exactly what the bridge publishes to MQTT. The browser needs no MQTT access.

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const zones = {};        // zone_id -> last payload
let lastStatus = null;   // last status message (JSON string)
let transport = null;    // RoonApiTransport, set while paired
const clients = new Set();

// ---------- called by app.js ----------

exports.setTransport = (t) => { transport = t; };

exports.pushZone = (payload) => {
  zones[payload.zone_id] = payload;
  broadcast('zone', JSON.stringify(payload));
};

exports.pushStatus = (json) => {
  lastStatus = json;
  broadcast('status', json);
};

// ---------- SSE ----------

function send(res, event, data) {
  res.write('event: ' + event + '\ndata: ' + data + '\n\n');
}

function broadcast(event, data) {
  clients.forEach((res) => send(res, event, data));
}

// ---------- Control ----------

// Returns '' on success, otherwise an error text
function control(q) {
  if (!transport) return 'not paired with Roon';
  const z = zones[q.zone];
  if (!z) return 'unknown zone';
  const noop = () => {};

  switch (q.cmd) {
    case 'playpause':
    case 'next':
    case 'previous':
      transport.control(z.zone_id, q.cmd, noop);
      return '';

    case 'seek': {
      const s = Number(q.value);
      if (!isFinite(s) || s < 0) return 'bad value';
      transport.seek(z.zone_id, 'absolute', Math.round(s), noop);
      return '';
    }

    case 'volume': {
      const f = Number(q.value);
      if (!isFinite(f)) return 'bad value';
      const out = (z.outputs || []).find((o) =>
        o.volume && typeof o.volume.min === 'number' && typeof o.volume.max === 'number');
      if (!out) return 'zone has no absolute volume';
      const v = out.volume;
      const step = v.step > 0 ? v.step : 1;
      let target = v.min + Math.min(1, Math.max(0, f)) * (v.max - v.min);
      target = Math.round(target / step) * step;
      transport.change_volume(out.output_id, 'absolute', target, noop);
      return '';
    }
  }
  return 'unknown command';
}

// ---------- TheAudioDB: proxy + cache ----------
// GET /audiodb?artist=<name>  ->  200 { "artists": [ ... ] | null }   (fields trimmed to what the card needs)
//                                 502  TheAudioDB failed (nothing is cached, the card retries later)
//                                 503  no THEAUDIODB_KEY configured
// Cache: memory + one JSON file per artist (CACHE_DIR, default <app dir>/cache).

const AD = { key: '', dir: '', interval: 2100 };
const AD_TTL_FOUND = 30 * 24 * 3600 * 1000;
const AD_TTL_UNKNOWN = 24 * 3600 * 1000;
const AD_KEEP = /^(idArtist|strArtist|strArtistAlternate|strMusicBrainzID|strCountry|intBornYear|intFormedYear|strGenre|strArtistThumb|strArtistWideThumb|strArtistFanart\d?|strBiography[A-Z]{0,2})$/;
const adMem = new Map();
const adPending = new Map();
let adQueue = Promise.resolve();
let adLast = 0;

const adNorm = (s) => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

function adGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'roon-card-bridge', Accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// One request at a time with a minimum gap (the free test key is rate limited)
function adThrottled(fn) {
  const run = adQueue.then(async () => {
    const wait = adLast + AD.interval - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    adLast = Date.now();
    return fn();
  });
  adQueue = run.catch(() => {});
  return run;
}

function adSlim(a) {
  const o = {};
  Object.keys(a).forEach((k) => { if (AD_KEEP.test(k) && a[k]) o[k] = a[k]; });
  return o;
}

function adFile(k) {
  return path.join(AD.dir, 'audiodb-' + crypto.createHash('sha1').update(k).digest('hex') + '.json');
}

function adRead(k) {
  let e = adMem.get(k);
  if (!e) {
    try { e = JSON.parse(fs.readFileSync(adFile(k), 'utf8')); adMem.set(k, e); } catch (err) { return null; }
  }
  return e.until > Date.now() ? e.body : null;
}

function adWrite(k, e) {
  adMem.set(k, e);
  fs.writeFile(adFile(k), JSON.stringify(e), () => {});   // best effort
}

function adLookup(name) {
  const k = adNorm(name) || name.toLowerCase();
  const hit = adRead(k);
  if (hit) return Promise.resolve(hit);
  if (adPending.has(k)) return adPending.get(k);
  const p = adThrottled(() => adGetJson(
    'https://www.theaudiodb.com/api/v1/json/' + encodeURIComponent(AD.key) + '/search.php?s=' + encodeURIComponent(name)
  )).then((j) => {
    const list = j && Array.isArray(j.artists) ? j.artists.map(adSlim) : null;
    const body = { artists: list };
    adWrite(k, { until: Date.now() + (list ? AD_TTL_FOUND : AD_TTL_UNKNOWN), body: body });
    return body;
  }).finally(() => adPending.delete(k));
  adPending.set(k, p);
  return p;
}

// ---------- Static files ----------

function firstExisting(list) {
  return list.find((f) => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
}

// ---------- Server ----------

exports.start = function (opts) {
  const appDir = opts.appDir;
  const log = opts.log || console.log;

  // TheAudioDB cache: only active with a key
  AD.key = (process.env.THEAUDIODB_KEY || process.env.theaudiodb_key || '').trim();
  AD.dir = process.env.CACHE_DIR || path.join(appDir, 'cache');
  AD.interval = parseInt(process.env.THEAUDIODB_INTERVAL_MS || (AD.key === '123' ? '2100' : '700'), 10);
  if (AD.key) {
    try { fs.mkdirSync(AD.dir, { recursive: true }); } catch (e) { log('[!] Cache directory not writable: ' + e.message); }
    log('[+] TheAudioDB cache on /audiodb (cache dir ' + AD.dir + ')');
  } else {
    log('[*] TheAudioDB cache off (THEAUDIODB_KEY not set).');
  }

  const files = {
    '/': () => firstExisting([path.join(appDir, 'web', 'index.html')]),
    '/index.html': () => firstExisting([path.join(appDir, 'web', 'index.html')]),
    // card: next to the page, next to app.js, or in the repo root
    '/roon-card.js': () => firstExisting([
      path.join(appDir, 'web', 'roon-card.js'),
      path.join(appDir, 'roon-card.js'),
      path.join(appDir, '..', 'roon-card.js')
    ])
  };
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      if (lastStatus) send(res, 'status', lastStatus);
      Object.keys(zones).forEach((id) => send(res, 'zone', JSON.stringify(zones[id])));
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname === '/control') {
      if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
      const err = control({
        zone: url.searchParams.get('zone'),
        cmd: url.searchParams.get('cmd'),
        value: url.searchParams.get('value')
      });
      res.writeHead(err ? 400 : 204, err ? { 'Content-Type': 'text/plain' } : {});
      return res.end(err);
    }

    if (url.pathname === '/audiodb') {
      // CORS: lets a card on another origin (Home Assistant) use this cache. The data is public TheAudioDB data.
      const head = { 'Access-Control-Allow-Origin': '*' };
      if (!AD.key) { res.writeHead(503, head); return res.end('TheAudioDB key not configured'); }
      const name = (url.searchParams.get('artist') || '').trim();
      if (req.method !== 'GET' || !name || name.length > 200) { res.writeHead(400, head); return res.end('artist missing'); }
      adLookup(name).then((body) => {
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=3600' }, head));
        res.end(JSON.stringify(body));
      }).catch((e) => {
        log('[-] TheAudioDB "' + name + '": ' + e.message);
        res.writeHead(502, head);
        res.end('TheAudioDB request failed');
      });
      return;
    }

    const finder = files[url.pathname];
    const file = finder && finder();
    if (!file) { res.writeHead(404); return res.end('not found'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });

  // keep idle SSE connections alive through routers and proxies
  setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20000).unref();

  server.on('error', (e) => log('[-] Web server error: ' + e.message));
  server.listen(opts.port, () => log('[+] Web page on http://<this-host>:' + opts.port + '/'));
};
