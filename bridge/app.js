// Roon -> MQTT bridge
// Publishes zone metadata and a JSON status payload to MQTT.
// Status topic: <MQTT_TOPIC>/status
//
// Status values:
//   starting
//   online
//   roon_disconnected
//   error
//   offline

const fs = require('fs');
const path = require('path');

// ---------- Minimal .env loader ----------
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

// ---------- Configuration ----------
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'roon/now_playing';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';

const ROON_HOST = process.env.ROON_HOST || '127.0.0.1';
const ROON_PORT = parseInt(process.env.ROON_PORT || '9330', 10);
const PAIR_TIMEOUT_MS = parseInt(
  process.env.PAIR_TIMEOUT_MS || '90000',
  10
);
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

// Additional manually configured Roon information
const ROON_CORE_IP = process.env.ROON_CORE_IP || '';
const ROON_CORE_HOSTNAME = process.env.ROON_CORE_HOSTNAME || '';
const ROON_CORE_OS = process.env.ROON_CORE_OS || '';
const ROON_LIBRARY_PATHS = process.env.ROON_LIBRARY_PATHS || '';
const ROON_INSTALLED_EXTENSIONS =
  process.env.ROON_INSTALLED_EXTENSIONS || '';
const ROON_CORE_INSTALL_PATH = process.env.ROON_CORE_INSTALL_PATH || '';
const ROON_CORE_NOTES = process.env.ROON_CORE_NOTES || '';

const STATUS_TOPIC = `${MQTT_TOPIC}/status`;

// ---------- Logging ----------
const rawLog = console.log.bind(console);

if (LOG_LEVEL !== 'debug') {
  console.log = (...args) => {
    const first = typeof args[0] === 'string' ? args[0] : '';

    if (/^(->|<-)\s/.test(first) || /^ERROR undefined/.test(first)) {
      return;
    }

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

// ---------- State ----------
const lastTrack = {};
let paired = false;
let currentStatus = 'starting';
let shuttingDown = false;

const coreInfo = {
  id: null,
  name: null,
  version: null
};

// ---------- Configuration exposed in status ----------
// Only publish bridge/Roon configuration.
// Never expose MQTT settings or values that look like secrets.
function getPublicEnvConfig() {
  const result = {};

  const excludedName =
    /PASS(WORD)?|SECRET|TOKEN|CREDENTIAL|API[_-]?KEY|PRIVATE[_-]?KEY/i;

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('MQTT_')) continue;
    if (excludedName.test(key)) continue;

    if (
      key.startsWith('ROON_') ||
      key === 'PAIR_TIMEOUT_MS' ||
      key === 'LOG_LEVEL'
    ) {
      result[key] = value;
    }
  }

  return result;
}

function parseCsv(value) {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ---------- JSON status ----------
function buildStatusPayload(state) {
  return {
    status: state,
    timestamp: new Date().toISOString(),

    core: {
      id: coreInfo.id,
      name: coreInfo.name,
      version: coreInfo.version,

      connection: {
        configured_host: ROON_HOST,
        configured_port: ROON_PORT,
        ip_address: ROON_CORE_IP || null,
        hostname: ROON_CORE_HOSTNAME || null,
        operating_system: ROON_CORE_OS || null
      }
    },

    library: {
      storage_paths: parseCsv(ROON_LIBRARY_PATHS),
      source: 'manual_configuration'
    },

    extensions: {
      installed: parseCsv(ROON_INSTALLED_EXTENSIONS),
      source: 'manual_configuration'
    },

    installation: {
      path: ROON_CORE_INSTALL_PATH || null,
      notes: ROON_CORE_NOTES || null
    },

    config: getPublicEnvConfig()
  };
}

function statusJson(state) {
  return JSON.stringify(buildStatusPayload(state));
}

// ---------- MQTT ----------
logInfo(`[*] Connecting to MQTT broker ${MQTT_BROKER}...`);

const mqttOptions = {
  connectTimeout: 5000,

  // Last will: publish JSON if the bridge unexpectedly disconnects.
  will: {
    topic: STATUS_TOPIC,
    payload: statusJson('offline'),
    retain: true
  }
};

if (MQTT_USER) mqttOptions.username = MQTT_USER;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;

const mqttClient = mqtt.connect(MQTT_BROKER, mqttOptions);

// Publish retained JSON status.
function setStatus(state, cb) {
  if (state !== currentStatus) {
    logInfo(`[*] Status: ${state}`);
  }

  currentStatus = state;

  if (mqttClient.connected) {
    mqttClient.publish(
      STATUS_TOPIC,
      statusJson(state),
      { retain: true },
      cb
    );
  } else if (cb) {
    cb();
  }
}

// ---------- Shutdown ----------
function shutdown(state, code) {
  if (shuttingDown) return;

  shuttingDown = true;

  const force = setTimeout(() => process.exit(code), 2000);
  force.unref();

  setStatus(state, () => {
    mqttClient.end(false, {}, () => process.exit(code));
  });
}

// ---------- MQTT events ----------
mqttClient.on('connect', () => {
  logInfo('[+] MQTT connected.');

  if (!shuttingDown) {
    setStatus(currentStatus);
  }
});

mqttClient.on('reconnect', () => {
  logInfo('[*] MQTT reconnecting...');
});

mqttClient.on('close', () => {
  logDebug('[*] MQTT connection closed.');
});

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
  display_version: '1.5.1',
  publisher: 'me',
  email: 'me@example.com',

  core_paired: (core) => {
    paired = true;

    coreInfo.id = core.core_id || null;
    coreInfo.name = core.display_name || null;
    coreInfo.version = core.display_version || null;

    logInfo('[+] Paired with Roon.');
    setStatus('online');

    core.services.RoonApiTransport.subscribe_zones((resp, msg) => {
      // Connection lost: callback may be invoked without a message.
      if (resp === 'NetworkError' || !msg) {
        logInfo('[-] Zone subscription ended: ' + resp);

        if (!shuttingDown) {
          setStatus('roon_disconnected');
        }

        return;
      }

      const zones =
        msg.zones ||
        msg.zones_changed ||
        msg.zones_added ||
        [];

      zones.forEach((z) => {
        const zoneName = z.display_name;
        const topicClean = zoneName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');

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

        // Now-playing metadata
        if (z.now_playing) {
          const np = z.now_playing;

          const trackTitle = np.three_line
            ? np.three_line.line1
            : np.one_line
              ? np.one_line.line1
              : 'Unknown title';

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
              `    cover key: ${imageKey || 'none'}, ` +
              `artist keys: ${artistKeys.join(', ') || 'none'}`
            );
          }

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

        // Publish complete zone payload.
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

// ---------- Initialize Roon ----------
roon.init_services({
  required_services: [RoonApiTransport]
});

logInfo(`[*] Connecting to the Roon Core at ${ROON_HOST}:${ROON_PORT}...`);

roon.ws_connect({
  host: ROON_HOST,
  port: ROON_PORT
});

// ---------- Pairing watchdog ----------
setTimeout(() => {
  if (!paired) {
    console.error(
      'ERROR: Coupling to Roon Core required via Roon app.'
    );

    console.error(
      `[-] Not paired after ${PAIR_TIMEOUT_MS / 1000}s, restarting.`
    );

    shutdown('error', 1);
  }
}, PAIR_TIMEOUT_MS);
