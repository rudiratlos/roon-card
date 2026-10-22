'use strict';

// Roon -> MQTT bridge
// Publishes now-playing metadata of all Roon zones to MQTT as one JSON message per zone,
// plus a status topic (<base>/status) describing the state of the bridge.
//
// Status topic payload (JSON, retained):
//   { "status": "online", "timestamp": "...", "bridge_version": "...",
//     "image_base_url": "...", "core": { "name": "...", "version": "..." } }
// The status message is re-published every HEARTBEAT_MS, so consumers can detect a hung bridge
// by a timestamp that stops changing.
//
// Status values:
//   starting           bridge is running, not yet paired with Roon
//   online             paired with Roon, delivering data
//   roon_disconnected  connection to the Roon Core was lost (the bridge exits and is restarted by systemd)
//   error              unexpected error, or not paired within PAIR_TIMEOUT_MS
//   offline            bridge stopped (clean shutdown, or last will after an unexpected connection loss)
//
// Signal Path support is optional:
// - If ./signal-path.js exists and loads successfully, Signal Path data is included.
// - If it is missing or fails to load, the bridge continues without Signal Path data.

const fs = require('fs');
const path = require('path');

// Single source of truth for the bridge version: package.json
const BRIDGE_VERSION = require('./package.json').version;

// ---------- Optional Signal Path support ----------
let readSignalPathForZone = null;
const signalPathFile = path.join(__dirname, 'signal-path.js');

if (fs.existsSync(signalPathFile)) {
  try {
    const signalPathModule = require(signalPathFile);

    if (typeof signalPathModule.readSignalPathForZone === 'function') {
      readSignalPathForZone = signalPathModule.readSignalPathForZone;
      console.log('[+] Signal Path support enabled.');
    } else {
      console.warn(
        '[!] Signal Path disabled: signal-path.js does not export readSignalPathForZone().'
      );
    }
  } catch (err) {
    console.warn(
      '[!] Signal Path disabled; could not load signal-path.js:',
      err.message
    );
  }
} else {
  console.log('[*] signal-path.js not found; Signal Path support disabled.');
}

// ---------- Minimal .env loader (no extra dependency) ----------
// Search order: $ENV_FILE, <app directory>/.env, /etc/roon-mqtt.env
// Variables that are already set in the environment (e.g. by systemd) are not overridden.
function loadEnvFile() {
  const candidates = [
    process.env.ENV_FILE,
    path.join(__dirname, '.env'),
    '/etc/roon-mqtt.env'
  ].filter(Boolean);

  for (const file of candidates) {
    let text;

    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      continue;
    }

    text.split(/\r?\n/).forEach((line) => {
      const m = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/
      );

      if (!m || line.trim().startsWith('#')) return;

      let val = m[2];

      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = val;
      }
    });

    return file;
  }

  return null;
}

const ENV_LOADED_FROM = loadEnvFile();

// ==================== CONFIGURATION ====================
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'roon/now_playing';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const ROON_HOST = process.env.ROON_HOST || '127.0.0.1';
const ROON_PORT = parseInt(process.env.ROON_PORT || '9330', 10);
const PAIR_TIMEOUT_MS = parseInt(process.env.PAIR_TIMEOUT_MS || '90000', 10);
const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_MS || '30000', 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
// Base URL of the Roon image API as reachable by the browsers, e.g. http://192.168.1.10:9330/api/image
const IMAGE_URL_BASE = (process.env.IMAGE_URL_BASE || '').trim().replace(/\/+$/, '');
// =======================================================

const STATUS_TOPIC = `${MQTT_TOPIC}/status`;

// ---------- Logging ----------
// node-roon-api prints every protocol message via console.log; those lines contain tokens,
// zone IDs and image keys, so they are dropped unless LOG_LEVEL=debug.
const rawLog = console.log.bind(console);

if (LOG_LEVEL !== 'debug') {
  console.log = (...args) => {
    const first = typeof args[0] === 'string' ? args[0] : '';

    if (/^(->|<-)\s/.test(first) || /^ERROR undefined/.test(first)) return;

    rawLog(...args);
  };
}

const logInfo = (msg) => rawLog(msg);

const logDebug = (msg) => {
  if (LOG_LEVEL === 'debug') rawLog(msg);
};

global.WebSocket = require('ws');

const RoonApi = require('node-roon-api');
const RoonApiTransport = require('node-roon-api-transport');
const mqtt = require('mqtt');

logInfo(
  ENV_LOADED_FROM
    ? `[*] Configuration loaded from ${ENV_LOADED_FROM} (log level: ${LOG_LEVEL})`
    : `[*] No .env file found, using environment variables and defaults (log level: ${LOG_LEVEL})`
);

if (!IMAGE_URL_BASE) {
  logInfo('[!] IMAGE_URL_BASE is not set; consumers need their own image URL setting.');
}

// ---------- State ----------
const lastTrack = {};
let paired = false;
let currentStatus = 'starting';
let shuttingDown = false;
let coreInfo = null;

// Status message as JSON. Only technical data that consumers need, nothing sensitive.
function statusPayload(state) {
  return JSON.stringify({
    status: state,
    timestamp: new Date().toISOString(),
    bridge_version: BRIDGE_VERSION,
    image_base_url: IMAGE_URL_BASE ? IMAGE_URL_BASE + '/' : undefined,
    core: coreInfo || undefined
  });
}

// ---------- MQTT ----------
logInfo(`[*] Connecting to MQTT broker ${MQTT_BROKER}...`);

const mqttOptions = {
  connectTimeout: 5000,
  // Last will: the broker publishes "offline" if the connection drops unexpectedly
  will: {
    topic: STATUS_TOPIC,
    payload: JSON.stringify({ status: 'offline' }),
    retain: true
  }
};

if (MQTT_USER) mqttOptions.username = MQTT_USER;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;

const mqttClient = mqtt.connect(MQTT_BROKER, mqttOptions);

// Publish the status (retained). Remembers the value so it can be re-published after a reconnect.
function setStatus(state, cb) {
  if (state !== currentStatus) {
    logInfo(`[*] Status: ${state}`);
  }

  currentStatus = state;

  if (mqttClient.connected) {
    mqttClient.publish(STATUS_TOPIC, statusPayload(state), { retain: true }, cb);
  } else if (cb) {
    cb();
  }
}

// Heartbeat: re-publish the current status with a fresh timestamp
const heartbeatTimer = setInterval(() => {
  if (shuttingDown || !mqttClient.connected) return;
  mqttClient.publish(STATUS_TOPIC, statusPayload(currentStatus), { retain: true });
}, HEARTBEAT_MS);

// Publish a final status, close MQTT cleanly and exit.
// A clean close does not trigger the last will, so the final status is published explicitly.
function shutdown(state, code) {
  if (shuttingDown) return;

  shuttingDown = true;
  clearInterval(heartbeatTimer);

  const force = setTimeout(() => process.exit(code), 2000);
  force.unref();

  setStatus(state, () => {
    mqttClient.end(false, {}, () => process.exit(code));
  });
}

mqttClient.on('connect', () => {
  logInfo('[+] MQTT connected.');

  if (!shuttingDown) setStatus(currentStatus);
});

mqttClient.on('reconnect', () => logInfo('[*] MQTT reconnecting...'));
mqttClient.on('close', () => logDebug('[*] MQTT connection closed.'));

mqttClient.on('error', (err) => {
  console.error('[-] MQTT error:', err.message);
});

// ---------- Process signals and errors ----------
process.on('SIGTERM', () => {
  logInfo('[*] SIGTERM received, shutting down.');
  shutdown('offline', 0);
});

process.on('SIGINT', () => {
  logInfo('[*] SIGINT received, shutting down.');
  shutdown('offline', 0);
});

process.on('uncaughtException', (e) => {
  console.error('[-] Uncaught:', (e && e.stack) || e);
  shutdown('error', 1);
});

process.on('unhandledRejection', (e) => {
  console.error('[-] Unhandled:', (e && e.stack) || e);
  shutdown('error', 1);
});

// ---------- Roon ----------
const roon = new RoonApi({
  extension_id: 'my.cover.fetcher.local',
  display_name: 'Cover Fetcher LOCAL',
  display_version: BRIDGE_VERSION,
  publisher: 'me',
  email: 'me@example.com',

  core_paired: (core) => {
    paired = true;
    coreInfo = { name: core.display_name, version: core.display_version };

    logInfo('[+] Paired with Roon.');
    setStatus('online');

    core.services.RoonApiTransport.subscribe_zones((resp, msg) => {
      if (resp === 'NetworkError' || !msg) {
        logInfo('[-] Zone subscription ended: ' + resp);

        if (!shuttingDown) setStatus('roon_disconnected');

        return;
      }

      const zones = msg.zones || msg.zones_changed || msg.zones_added || [];

      zones.forEach((z) => {
        const zoneName = z.display_name || 'Unknown';
        const topicClean = zoneName.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Optional Signal Path lookup.
        // If the module is unavailable, throws, or returns no match,
        // publish null and continue processing the zone.
        let signalPath = null;

        if (readSignalPathForZone && z.state === 'playing') {
          try {
            signalPath = readSignalPathForZone(z);
          } catch (err) {
            logDebug(
              `[SignalPath] Failed for zone "${zoneName}": ${err.message}`
            );
          }
        }

        // Generic payload without any installation-specific data
        const payload = {
          zone_id: z.zone_id,
          zone_name: zoneName,
          state: z.state,
          is_next_allowed: z.is_next_allowed || false,
          is_previous_allowed: z.is_previous_allowed || false,
          is_pause_allowed: z.is_pause_allowed || false,
          is_play_allowed: z.is_play_allowed || false,
          is_seek_allowed: z.is_seek_allowed || false,
          queue_items_remaining: z.queue_items_remaining || 0,
          queue_time_remaining: z.queue_time_remaining || 0,

          settings: {
            loop: z.settings ? z.settings.loop : 'disabled',
            shuffle: z.settings ? z.settings.shuffle : false,
            auto_radio: z.settings ? z.settings.auto_radio : false
          },

          outputs: [],

          // Optional Signal Path data, independent for each zone
          signal_path: signalPath,

          timestamp: new Date().toISOString()
        };

        // Outputs and volumes
        if (z.outputs && z.outputs.length > 0) {
          z.outputs.forEach((out) => {
            payload.outputs.push({
              output_id: out.output_id,
              name: out.display_name,

              volume: out.volume
                ? {
                    type: out.volume.type,
                    min: out.volume.min,
                    max: out.volume.max,
                    value: out.volume.value,
                    step: out.volume.step,
                    is_muted: out.volume.is_muted
                  }
                : null
            });
          });
        }

        // Media metadata
        if (z.now_playing) {
          const np = z.now_playing;

          const trackTitle = np.three_line
            ? np.three_line.line1
            : (np.one_line ? np.one_line.line1 : 'Unknown title');

          const artistName = np.three_line
            ? np.three_line.line2
            : 'Unknown artist';

          const albumName = np.three_line
            ? np.three_line.line3
            : 'Unknown album';

          const imageKey = np.image_key || '';
          const artistKeys = np.artist_image_keys || [];
          const artistKey = artistKeys.length > 0 ? artistKeys[0] : '';

          const sig = [
            trackTitle,
            artistName,
            imageKey,
            artistKeys.join(',')
          ].join('|');

          if (lastTrack[zoneName] !== sig) {
            lastTrack[zoneName] = sig;

            logInfo(
              `[~] ${zoneName}: ${artistName} - ${trackTitle} ` +
              `(cover: ${imageKey ? 'yes' : 'no'}, artist images: ${artistKeys.length})`
            );

            logDebug(
              `    cover key: ${imageKey || 'none'}, artist keys: ${artistKeys.join(', ') || 'none'}`
            );
          }

          // Only raw text properties and image keys; URLs are built by the consumer
          payload.now_playing = {
            track: trackTitle,
            artist: artistName,
            album: albumName,
            seek_position: np.seek_position || 0,
            length: np.length || 0,
            image_key: imageKey,
            artist_key: artistKey,
            artist_keys: artistKeys
          };
        } else {
          payload.now_playing = null;
        }

        // Publish the complete payload as one JSON message
        if (mqttClient.connected) {
          mqttClient.publish(
            `${MQTT_TOPIC}/${topicClean}`,
            JSON.stringify(payload),
            { retain: true }
          );
        }
      });
    });
  },

  core_unpaired: () => {
    paired = false;

    logInfo('[-] Connection to the Roon Core lost, restarting via systemd.');
    shutdown('roon_disconnected', 1);
  }
});

// Initialize the required Roon services
roon.init_services({
  required_services: [RoonApiTransport]
});

logInfo(`[*] Connecting to the Roon Core at ${ROON_HOST}:${ROON_PORT}...`);

roon.ws_connect({
  host: ROON_HOST,
  port: ROON_PORT
});

// Watchdog: report missing Roon pairing with an actionable message
setTimeout(() => {
  if (!paired && !shuttingDown) {
    console.error(
      '[-] ERROR: Coupling to Roon Core required via Roon app. ' +
      'Open Roon Settings > Extensions and enable/pair this bridge.'
    );

    shutdown('error', 1);
  }
}, PAIR_TIMEOUT_MS);
