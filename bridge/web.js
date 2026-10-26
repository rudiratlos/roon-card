'use strict';

// Optional web module for the bridge (loaded by app.js if this file exists and WEB_PORT is set).
// Serves the Roon card as a standalone page, so it runs without Home Assistant:
//
//   GET  /           web/index.html (the page that hosts the card)
//   GET  /roon-card.js   the card itself
//   GET  /events     Server-Sent Events: "zone" (one per zone update) and "status" (bridge status)
//   POST /control    ?zone=<zone_id>&cmd=playpause|next|previous|seek|volume&value=<n>
//
// The data is exactly what the bridge publishes to MQTT. The browser needs no MQTT access.

const http = require('http');
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

// ---------- Static files ----------

function firstExisting(list) {
  return list.find((f) => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
}

// ---------- Server ----------

exports.start = function (opts) {
  const appDir = opts.appDir;
  const log = opts.log || console.log;

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
