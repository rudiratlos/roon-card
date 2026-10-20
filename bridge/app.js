// Roon -> MQTT bridge
// Publishes now-playing metadata of all Roon zones to MQTT.
// Configuration is read from environment variables or from a .env file (see roon-mqtt.env.example).

const fs = require('fs');
const path = require('path');

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
      continue; // file missing or not readable: try the next one
    }
    text.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) return;
      let val = m[2];
      // strip matching surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    });
    return file;
  }
  return null;
}
const ENV_LOADED_FROM = loadEnvFile();

global.WebSocket = require('ws'); // works around the Node.js WebSocket problem of node-roon-api
const RoonApi = require('node-roon-api');
const RoonApiTransport = require('node-roon-api-transport');
const mqtt = require('mqtt');

// ==================== CONFIGURATION ====================
const MQTT_BROKER     = process.env.MQTT_BROKER   || 'mqtt://localhost'; // protocol + host of the MQTT broker
const MQTT_TOPIC      = process.env.MQTT_TOPIC    || 'roon/now_playing'; // base topic
const MQTT_USER       = process.env.MQTT_USER     || '';                 // leave empty if the broker needs no login
const MQTT_PASSWORD   = process.env.MQTT_PASSWORD || '';
const ROON_HOST       = process.env.ROON_HOST     || '127.0.0.1';        // Roon Core host
const ROON_PORT       = parseInt(process.env.ROON_PORT || '9330', 10);   // Roon Core WebSocket port
const PAIR_TIMEOUT_MS = parseInt(process.env.PAIR_TIMEOUT_MS || '90000', 10); // restart if not paired in time
// =======================================================

// Log unexpected errors with a stack trace, then exit so systemd restarts the service
process.on('uncaughtException', (e) => {
  console.error('[-] Uncaught:', (e && e.stack) || e);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('[-] Unhandled:', (e && e.stack) || e);
  process.exit(1);
});

console.log(ENV_LOADED_FROM
  ? `[*] Configuration loaded from ${ENV_LOADED_FROM}`
  : '[*] No .env file found, using environment variables and defaults');

let lastImageKey = '';
let lastArtistKey = '';
let paired = false;

console.log(`[*] Connecting to MQTT broker ${MQTT_BROKER}...`);
const mqttOptions = {
  connectTimeout: 5000,
  // Last will: the broker publishes "offline" if the bridge disappears unexpectedly
  will: { topic: `${MQTT_TOPIC}/status`, payload: 'offline', retain: true }
};
if (MQTT_USER) mqttOptions.username = MQTT_USER;
if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;
const mqttClient = mqtt.connect(MQTT_BROKER, mqttOptions);

mqttClient.on('connect', () => {
  console.log('[+] MQTT connection established.');
  mqttClient.publish(`${MQTT_TOPIC}/status`, 'online', { retain: true });
});

mqttClient.on('error', (err) => {
  console.error('[-] MQTT error:', err.message);
});

const roon = new RoonApi({
  extension_id: 'my.cover.fetcher.local',
  display_name: 'Cover Fetcher LOCAL',
  display_version: '1.3.1',
  publisher: 'me',
  email: 'me@example.com',

  core_paired: (core) => {
    paired = true;
    console.log('\n[+] Paired with Roon.');

    core.services.RoonApiTransport.subscribe_zones((resp, msg) => {
      // Connection lost: the callback is invoked without a message
      if (resp === 'NetworkError' || !msg) {
        console.log('[-] Zone subscription ended: ' + resp);
        return;
      }

      const zones = msg.zones || msg.zones_changed || msg.zones_added || [];

      zones.forEach((z) => {
        const zoneName = z.display_name;
        const topicClean = zoneName.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Generic payload without any installation-specific data (no IPs)
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
              volume: out.volume ? {
                type: out.volume.type,
                min: out.volume.min,
                max: out.volume.max,
                value: out.volume.value,
                step: out.volume.step,
                is_muted: out.volume.is_muted
              } : null
            });
          });
        }

        // Media metadata
        if (z.now_playing) {
          const np = z.now_playing;
          const trackTitle = np.three_line ? np.three_line.line1 : (np.one_line ? np.one_line.line1 : 'Unknown title');
          const artistName = np.three_line ? np.three_line.line2 : 'Unknown artist';
          const albumName  = np.three_line ? np.three_line.line3 : 'Unknown album';

          const imageKey = np.image_key || '';
          const artistKeys = np.artist_image_keys || [];
          const artistKey = artistKeys.length > 0 ? artistKeys[0] : '';

          // Log real image changes (in memory only)
          if (imageKey !== lastImageKey || artistKey !== lastArtistKey) {
            console.log(`\n[IMAGE CHANGE - ${zoneName.toUpperCase()}]`);
            console.log(`  Cover:   [${lastImageKey || 'none'}] -> [${imageKey || 'none'}]`);
            console.log(`  Artist:  [${lastArtistKey || 'none'}] -> [${artistKey || 'none'}]`);
            console.log(`  Track:   ${trackTitle} - ${artistName}`);
            lastImageKey = imageKey;
            lastArtistKey = artistKey;
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

        // Publish the plain data via MQTT
        if (mqttClient.connected) {
          mqttClient.publish(`${MQTT_TOPIC}/${topicClean}`, JSON.stringify(payload), { retain: true });
          mqttClient.publish(`${MQTT_TOPIC}/${topicClean}/state`, payload.state, { retain: true });

          if (payload.now_playing) {
            const t = `${MQTT_TOPIC}/${topicClean}`;
            mqttClient.publish(`${t}/track`, payload.now_playing.track, { retain: true });
            mqttClient.publish(`${t}/artist`, payload.now_playing.artist, { retain: true });
            mqttClient.publish(`${t}/album`, payload.now_playing.album, { retain: true });
            mqttClient.publish(`${t}/image_key`, payload.now_playing.image_key, { retain: true });
            mqttClient.publish(`${t}/artist_key`, payload.now_playing.artist_key, { retain: true });
          }
        }
      });
    });
  },

  core_unpaired: () => {
    paired = false;
    console.log('[-] Connection to the Roon Core lost, restarting via systemd.');
    setTimeout(() => process.exit(1), 2000);
  }
});

// Initialize the required Roon services
roon.init_services({ required_services: [RoonApiTransport] });

console.log(`[*] Connecting to the Roon Core at ${ROON_HOST}:${ROON_PORT}...`);
roon.ws_connect({ host: ROON_HOST, port: ROON_PORT });

// Watchdog: if not paired within the time limit, exit so systemd restarts the service
setTimeout(() => {
  if (!paired) {
    console.error(`[-] Not paired after ${PAIR_TIMEOUT_MS / 1000}s, restarting.`);
    process.exit(1);
  }
}, PAIR_TIMEOUT_MS);

