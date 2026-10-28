**🌐 English | [Deutsch](https://github.com/rudiratlos/roon-card/blob/main/README.de.md)**

# roon-card

[![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rudiratlos&repository=roon-card&category=plugin)

A Home Assistant dashboard card and a small bridge that bring a Roon-style "now playing" view to lightweight displays.

- **roon-card** is a custom Lovelace card. It shows the album cover, rotating artist images, title, artist and album, and offers transport controls, volume, seeking and synchronized lyrics. Optionally it adds more artist images and a biography from [TheAudioDB](https://www.theaudiodb.com).
- **roon-bridge** is a small Node.js service. It reads the playback state of your Roon zones from the Roon Core and publishes it to your MQTT broker.

The bridge can also serve the card as a standalone web page, so it runs without Home Assistant too (see [Standalone page](#standalone-page-without-home-assistant)).

The original Roon Display needs a modern browser and does not run on lightweight displays such as the Shelly Wall Display. **This card does.**

[![Comparison](https://github.com/rudiratlos/roon-card/raw/main/img/roon-card_vs_roon-display.jpg)](https://github.com/rudiratlos/roon-card/blob/main/img/roon-card_vs_roon-display.jpg)

The right side is the original Roon Display, the left side is roon-card. Tapping the cover or the artist image shows the cover enlarged.

<p>
  <img src="https://github.com/rudiratlos/roon-card/blob/main/img/walldisplay_1.jpg" alt="Wall display 1" width="45%">
  <img src="https://github.com/rudiratlos/roon-card/blob/main/img/walldisplay_2.jpg" alt="Wall display 2" width="45%">
</p>

**Fallback mode:** If the roon bridge does not deliver artwork information (for example because it is stopped), the card keeps working with the data of the regular `media_player` entity. It then shows the cover provided by the player, and the status pill shows `Fallback`. Artist images and the biography from TheAudioDB keep working in this mode too, because the card only needs the artist name from the player.

> [!IMPORTANT]
> **HACS installs only the card, not the bridge.** The bridge is a separate service that runs on the Roon server (see [roon-bridge](#roon-bridge)). Without the bridge the card only works in fallback mode: no Roon artist images, no synchronized track data.
>
> **Naming:** the repository is called `roon-card`, but the card type in your dashboard is `custom:roon-player-card`.

## Table of contents

- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Installation of roon-card](#installation-of-roon-card)
- [Usage](#usage)
  - [Artist images and biography from TheAudioDB](#artist-images-and-biography-from-theaudiodb)
- [roon-bridge](#roon-bridge)
  - [Standalone page without Home Assistant](#standalone-page-without-home-assistant)
- [Troubleshooting](#troubleshooting)

---

# Quick start

The setup consists of five steps. Details are in the sections below.

1. **Install the bridge** on the machine that runs your Roon Core → [Installation of the bridge](#installation-debianubuntu).
2. **Enable the extension** in the Roon Remote app (**Settings → Extensions → Cover Fetcher LOCAL**).
3. **Create the MQTT sensors** in Home Assistant → [MQTT sensors](#mqtt-sensors-in-home-assistant).
4. **Install the card via HACS:**

   [![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rudiratlos&repository=roon-card&category=plugin)

   Click the button, choose **Download**, then reload your browser.
5. **Add the card to a dashboard:** edit the dashboard → **Add card** → **Manual** and paste:

   ```yaml
   type: custom:roon-player-card
   player: media_player.streamer
   sensor: sensor.roon_livingroom_json
   status_sensor: sensor.roon_bridge_status
   roon_url: http://<roon-server-ip>:9330/api/image/
   ```

   Replace `player`, `sensor` and `roon_url` with the values of your installation.

---

## Requirements

- Home Assistant with the MQTT integration
- [HACS](https://hacs.xyz) (recommended) or manual installation
- Roon Core
- A `media_player` entity that controls your streamer (all transport buttons call services on it)
- For the bridge: a Debian/Ubuntu host (or similar) with Node.js 18 or newer (version assumed, not verified)
- Optional: a [TheAudioDB](https://www.theaudiodb.com) API key for extra artist images and the biography

The card has no dependencies on other cards (no button-card, no card_mod).

---

# Installation of roon-card

## Via HACS (recommended)

**Direct link:**

[![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rudiratlos&repository=roon-card&category=plugin)

The button opens HACS in your Home Assistant instance with this repository preselected. Click **Download** and reload your browser. (The first time, my.home-assistant.io asks for the address of your Home Assistant instance.)

**Manually in HACS:**

1. Open HACS in Home Assistant.
2. Menu (three dots) → **Custom repositories**.
3. Add `https://github.com/rudiratlos/roon-card.git` with the category **Dashboard**.
4. Search for "Roon Player Card", install it and reload your browser.

HACS adds the resource itself. If you added the resource manually before, remove it to avoid loading the card twice.

> [!NOTE]
> HACS only downloads the card file `roon-card.js`. The logo used in the [idle image example](#showing-an-image-when-nothing-is-playing) is **not** included. If you want to use it, download it once, for example in the Terminal add-on:
>
> ```
> mkdir -p /config/www/icons
> wget -O /config/www/icons/roon-logo.png https://raw.githubusercontent.com/rudiratlos/roon-card/refs/heads/main/img/roon-logo.png
> ```
>
> You can also use any other image from `/config/www/`.

## Manual installation

```
cd /config/www/
wget https://raw.githubusercontent.com/rudiratlos/roon-card/refs/heads/main/roon-card.js
mkdir -p icons
wget -O icons/roon-logo.png https://raw.githubusercontent.com/rudiratlos/roon-card/refs/heads/main/img/roon-logo.png
```

### Add the resource

YAML mode (`configuration.yaml`):

```
lovelace:
  resources:
    - url: /local/roon-card.js?v=2.0.0
      type: module
```

UI mode:

1. Enable **Advanced mode** in your user profile.
2. Go to **Settings → Dashboards → ⋮ → Resources**.
3. Click **Add resource** and enter:

   - **URL:** `/local/roon-card.js?v=2.0.0`
   - **Type:** `JavaScript Module`
4. Save and reload the browser.

When you update the file, increase the number after `?v=` so that browsers do not use the cached version.

---

# Usage

Minimal configuration:

```
type: custom:roon-player-card
player: media_player.streamer
sensor: sensor.roon_auralic_json
status_sensor: sensor.roon_bridge_status
roon_url: http://<roon-server-ip>:9330/api/image/
```

Full example with all common options:

```
type: custom:roon-player-card
player: media_player.streamer
sensor: sensor.roon_auralic_json
status_sensor: sensor.roon_bridge_status
roon_url: http://<roon-server-ip>:9330/api/image/
bg_aspects_main:
  - 12by10
  - 4by3
  - 16by12
  - 16by7
bg_aspects_other:
  - 12by10
  - 4by3
  - 16by12
  - 16by7
bg_interval: 15
bg_interval_min: 10
bg_cycle: 90
zoom_seconds: 30
cover_fit: contain
lyrics_offset: 0.2
max_height: 85vh
format_attr: []
audiodb_key: "<your TheAudioDB key>"
bio_lang: DE,EN
options: [ nosongtext ]
```

Replace `player`, `sensor`, `roon_url` and `audiodb_key` with the values of your installation. `audiodb_key` is optional: without it the card makes no requests to TheAudioDB.

## Showing an image when nothing is playing

The card itself has no idle screen. A common approach is a `conditional` card that shows a picture when the player is neither playing nor paused. The example uses `/local/icons/roon-logo.png`; with a HACS installation you have to download this file first (see the note in [Via HACS](#via-hacs-recommended)).

```
type: vertical-stack
cards:
  - type: conditional
    conditions:
      - condition: state
        entity: media_player.streamer
        state:
          - playing
          - paused
    card:
      type: custom:roon-player-card
      player: media_player.streamer
      sensor: sensor.roon_auralic_json
      status_sensor: sensor.roon_bridge_status
      roon_url: http://<roon-server-ip>:9330/api/image/
      options: [ nosongtext ]
  - type: conditional
    conditions:
      - condition: state
        entity: media_player.streamer
        state_not: playing
      - condition: state
        entity: media_player.streamer
        state_not: paused
    card:
      type: picture
      image: /local/icons/roon-logo.png
      tap_action:
        action: none
```

## Configuration options

| Name               | Type        | Default             | Description                                                                                                                         |
|--------------------|-------------|---------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| `type`             | string      |                     | must be `custom:roon-player-card`                                                                                                   |
| `player`           | string      |                     | **required.** media_player entity of your streamer                                                                                  |
| `sensor`           | string      |                     | MQTT sensor that receives the bridge data (see below). Without it, the card runs in player-only mode                                |
| `status_sensor`    | string      |                     | MQTT sensor with the status of the bridge (see below)                                                                               |
| `roon_url`         | string      |                     | base URL of the Roon image API, ending in `/api/image/`. Without it, no Roon artist images are shown and the cover comes from the player |
| `bg_aspects_main`  | list        | `['12by10','4by3']` | image formats shown for the first artist                                                                                            |
| `bg_aspects_other` | list        | `['12by10']`        | image formats shown for further artists                                                                                             |
| `bg_interval`      | number      | `15`                | longest time per image in seconds                                                                                                   |
| `bg_interval_min`  | number      | `10`                | shortest time per image in seconds, used when there are many images                                                                 |
| `bg_cycle`         | number      | `90`                | target time in seconds for one pass through all images. The time per image is `bg_cycle` divided by the number of images, but never below `bg_interval_min` and never above `bg_interval`. `0` = always `bg_interval` |
| `zoom_seconds`     | number      | `30`                | the enlarged cover hides itself after this time, or on a new track                                                                  |
| `cover_fit`        | string      | `contain`           | `contain` shows the whole cover, `cover` fills the area                                                                             |
| `lyrics_dim`       | number      | `0.55`              | how much the image is dimmed behind the lyrics (0 to 1)                                                                             |
| `lyrics_offset`    | number      | `0.2`               | seconds, positive shows the lyrics earlier, negative later                                                                          |
| `format_attr`      | list        | `[]`                | attribute names to show as audio format, e.g. `[sample_rate, bit_depth]`                                                            |
| `audiodb_key`      | string      |                     | TheAudioDB API key. Without a key (and without `audiodb_url`) the card makes no requests to TheAudioDB. See [TheAudioDB](#artist-images-and-biography-from-theaudiodb) |
| `audiodb_url`      | string      |                     | cache of the bridge web server, e.g. `http://<roon-server-ip>:8080/audiodb`. It is asked first, the card needs no key for it. The [standalone page](#standalone-page-without-home-assistant) sets it by itself |
| `audiodb_images`   | string      | `extra`             | `extra` shows the TheAudioDB images after the Roon images, `fallback` only if Roon has none, `off` shows none (the biography stays available) |
| `bio_lang`         | string/list | `EN`                | language order of the biography, e.g. `DE,EN` or `[DE, EN]`                                                                         |
| `clock_url`        | string      | `/`                 | URL used to compare the display clock with Home Assistant (only the `Date` header is read)                                          |
| `max_height`       | string      | `85vh`              | maximum card height, any CSS length. The card is never higher than it is wide                                                       |
| `bar_h`            | number      | `112`               | height of the bottom bar in px                                                                                                      |
| `pad`              | number      | `20`                | horizontal padding of the bottom bar in px                                                                                          |
| `options`          | list        | `[]`                | switches, see below                                                                                                                 |

The image formats are passed to the Roon image API as `?aspect=...`. The formats `12by10`, `4by3`, `16by12` and `16by7` have been tested.

### Switches (`options`)

| Name          | Description                                                                                         |
|---------------|-----------------------------------------------------------------------------------------------------|
| `nobuttons`   | no player controls (volume, previous, play/pause, next) and no seeking by tapping the progress bar. For displays without touch. The bottom bar gets smaller, so the image gets bigger |
| `nobio`       | tapping an artist name does not open the biography                                                  |
| `nosongtext`  | do not show lyrics                                                                                  |
| `nostatus`    | do not show the status pill (image source, aspect, fallback, format)                                |
| `noaspect`    | do not show the aspect ratio (Roon images) or the image type (`thumb`, `fanart`; TheAudioDB images) in the status pill |
| `nosource`    | do not show the words `Artist` and `Cover` in the status pill. The source and the artist number stay: `roon`, `tadb 2/2` instead of `roon Cover`, `tadb Artist 2/2` |
| `noformat`    | do not show the audio format in the status pill                                                     |
| `nounderline` | do not underline the name of the artist whose image is shown (only for tracks with several artists) |
| `noscroll`    | do not scroll long titles, artists or albums, use "..." instead                                     |
| `nostale`     | disable the check whether the bridge data matches the current track                                 |
| `debug`       | tap the status pill to open a diagnostic panel (bridge status, image sources, TheAudioDB state, interval, current image URL) |

### Status pill

The small pill at the bottom right of the image shows where the current image comes from, for example:

| Pill                         | Meaning                                                                  |
|------------------------------|--------------------------------------------------------------------------|
| `roon Cover`                 | the album cover                                                          |
| `roon Artist 1/2 · 12by10`   | artist image from Roon, first of two artists, image format `12by10`      |
| `tadb Artist 2/2 · fanart`   | artist image from TheAudioDB (`tadb`), second of two artists, type `fanart` |

`roon` means the image comes from Roon (image API of the Core, or the cover of the media player in fallback mode), `tadb` means it comes from TheAudioDB. With the switch `nosource` the words `Artist` and `Cover` are left out, so the pill shows `roon`, `roon 1/2 · 12by10` or `tadb 2/2 · fanart`.

### Artist images and biography from TheAudioDB

The card can add images and a biography from [TheAudioDB](https://www.theaudiodb.com), a community database for music artwork. It is switched off as long as neither `audiodb_key` nor `audiodb_url` is set.

**Images:** for each artist (up to three) the card shows the thumb and up to four fan art images (`strArtistThumb`, `strArtistFanart`, `strArtistFanart2` to `strArtistFanart4`). With `audiodb_images: extra` (default) they follow the Roon images, so you get more variety. With more images, the time per image gets shorter (see `bg_interval_min` and `bg_cycle`).

**Biography:** tap the name of an artist in the bottom bar. A panel with country, genre, year and the text opens. Tap the panel to close it. `bio_lang` sets the language order. `bio_lang: DE,EN` means: first the German text (`strBiographyDE`), if there is none the English one (`strBiography`). Other languages use the codes of TheAudioDB (for example `FR`, `ES`, `IT`, `NL`); `JA`, `ZH`, `SV`, `HE` and `NB` are mapped to `JP`, `CN`, `SE`, `IL` and `NO`. The footer of the panel shows the language that was used. On a display without touch the biography cannot be opened.

**Matching:** the artist name has to match the entry in TheAudioDB (upper/lower case, accents and punctuation are ignored). If it does not, there are no images and no biography for that artist, which is better than a wrong one.

**Three ways to use it:**

| Setup                               | Configuration                                                         | Where the requests come from                                  |
|-------------------------------------|-----------------------------------------------------------------------|---------------------------------------------------------------|
| Home Assistant, directly            | `audiodb_key` in the card                                             | the browser of every display asks theaudiodb.com               |
| Home Assistant, with the bridge cache | `audiodb_url: http://<roon-server-ip>:8080/audiodb` and `THEAUDIODB_KEY` in the bridge env file | the browser asks the bridge, the bridge asks theaudiodb.com and caches |
| Standalone page                     | `THEAUDIODB_KEY` in the bridge env file (the page sets the URL itself) | like the line above                                           |

If you configure both `audiodb_url` and `audiodb_key`, the card asks the bridge first and only asks theaudiodb.com directly if the bridge cannot be reached. This also works without the roon bridge, because the card only needs the artist name of the media player.

**Key and limits:** TheAudioDB offers a free test key (`123`) with strict rate limits that all users share. For regular use, get your own key at theaudiodb.com. Every artist is requested only once: the browser (direct mode) or the bridge (cache) remembers the answer for 30 days, unknown artists for one day. After an error the card tries again after 10 minutes.

**Privacy:** the names of the artists of the current track (up to three) are sent to theaudiodb.com, from the browser of the display (direct mode) or from the bridge (cache). In direct mode the key is part of the dashboard configuration and visible to everybody who can read it. With the bridge cache the key stays on the server.

### Audio format (bit depth, sample rate)

The Roon extension API does not provide sample rate or bit depth, so the bridge cannot deliver them. If your player or sensor has such attributes, list their names in `format_attr`. Check **Developer Tools → States** for your player. The values are shown as they are, for example `44100 24`.

### Lyrics and privacy

Lyrics come from [LRCLIB](https://lrclib.net). The card sends the first artist, title, album and duration of the current track to lrclib.net from the browser of the display. Not every track has synchronized lyrics. Use `nosongtext` to switch this off.

### HTTPS note

The Roon image API only delivers plain HTTP. If you open Home Assistant via HTTPS, browsers block these images (mixed content). Then run the images through an HTTPS reverse proxy and use its URL as `roon_url`. The same applies to `audiodb_url`: a plain HTTP address of the bridge is blocked on an HTTPS page. The card then asks theaudiodb.com directly, if `audiodb_key` is set.

---

# roon-bridge

## What it does

`roon-bridge` is a Node.js service that connects to the Roon Core, monitors its audio zones and publishes playback information to MQTT. It is **not** installed through HACS but on the Roon server (or another Linux host in the same network).

For each zone, the bridge publishes a retained JSON message containing:

- Playback state and transport capabilities
- Current track, artist, album and playback position
- Album artwork and artist image keys
- Output devices, volume and mute state
- Optional Signal Path information for the currently playing track

The bridge also publishes its operational status, including the bridge version and Roon Core information, to a dedicated MQTT status topic.

The bridge keeps running when the Roon Core cannot be reached, for example while the Core restarts. It reports the status `roon_disconnected`, keeps its web page and the TheAudioDB cache available, and connects again by itself.

## Signal Path support

The bridge includes optional Signal Path support through [`bridge/signal-path.js`](https://github.com/rudiratlos/roon-card/blob/main/bridge/signal-path.js).

When a zone is playing, the module reads the Roon Server log and searches for the most recent Signal Path block matching that zone. Zone matching uses the log context and, as a fallback, the zone or output device names.

The default log location is:

```
/var/roon/RoonServer/Logs/RoonServer_log.txt
```

The log path can be overridden with the `SIGNAL_PATH_LOG` process environment variable.

The module caches parsed log data and reloads it when the file size or modification time changes.

### Signal Path data

The zone payload includes a `signal_path` property. When matching information is available, it can contain:

| Property               | Description                                              |
|------------------------|----------------------------------------------------------|
| `quality`              | Overall Signal Path quality                              |
| `source_format`        | Source format                                            |
| `sample_rate`          | Source sample rate in Hz                                 |
| `bit_depth`            | Source bit depth                                         |
| `channels`             | Number of source channels                                |
| `bitrate`              | Source bitrate, when available                           |
| `source_quality`       | Source quality reported by Roon                          |
| `lossless`             | Whether the source is reported as lossless               |
| `dsp`                  | DSP name, input/output sample rates and quality          |
| `volume_normalization` | Normalization gain and quality                           |
| `digital_volume_db`    | Digital volume gain in dB                                |
| `bit_depth_processing` | Bit-depth upgrade and truncation information             |
| `raat_device`          | RAAT device information                                  |
| `output`               | Output type, quality, subtype and model                  |
| `matched_by`           | How the zone was matched: `log_context` or `device_name` |
| `raw`                  | Original parsed Signal Path block                        |

Some fields may be `null` when the corresponding information is not present in the log.

Signal Path is optional. If `signal-path.js` is missing or cannot be loaded, the bridge continues to operate without Signal Path data. If no matching block is found, `signal_path` is `null`.

The log must be readable by the user running the bridge. On systems where Roon Server runs under a different user, configure suitable file permissions.

## Installation (Debian/Ubuntu)

Connect to your Roon server via SSH and install Node.js and npm:

```
sudo apt update
sudo apt install -y nodejs npm
node --version
```

Node.js 18 or newer is recommended.

Install the bridge:

```
sudo git clone https://github.com/rudiratlos/roon-card.git /opt/roon-card
cd /opt/roon-card/bridge
sudo npm install
sudo cp roon-mqtt.service /etc/systemd/system/
sudo cp roon-mqtt.env.example /etc/roon-mqtt.env
sudo chmod 600 /etc/roon-mqtt.env
sudo nano /etc/roon-mqtt.env
```

Configure the MQTT broker and Roon Core connection in `/etc/roon-mqtt.env`.

Enable and start the service:

```
sudo systemctl daemon-reload
sudo systemctl enable --now roon-mqtt.service
sudo journalctl -u roon-mqtt.service -f
```

Finally, open the Roon Remote app, navigate to **Settings → Extensions**, and enable/pair **Cover Fetcher LOCAL**.

### Updating

```
cd /opt/roon-card
sudo git pull
cd bridge
sudo npm install
sudo systemctl restart roon-mqtt
```

### Startup log

`journalctl -f` only shows the last 10 lines when it starts. To see the start of the bridge, use:

```
sudo journalctl -u roon-mqtt.service -n 60 --no-pager
```

A healthy start looks like this:

```
[*] roon-bridge v2.1.0 (Node v22.11.0)
[*] Configuration loaded from /etc/roon-mqtt.env (log level: info)
[+] TheAudioDB cache on /audiodb: dir /var/lib/roon-card/cache writable, own key, min. 700 ms between requests
[*] Connecting to MQTT broker mqtt://homeassistant.local...
[*] Connecting to the Roon Core at 127.0.0.1:9330...
[+] Web page on http://<this-host>:8080/
[+] MQTT connected.
[+] Paired with Roon.
[*] Status: online
```

What the lines tell you:

| Line                                          | Meaning                                                                                  |
|-----------------------------------------------|------------------------------------------------------------------------------------------|
| `roon-bridge v...`                            | version of the bridge (from `package.json`) and of Node.js                               |
| `Configuration loaded from ...`               | which env file is used. Only the first file found is read, see [Configuration](#configuration) |
| `TheAudioDB cache on /audiodb: dir ... writable` | the cache is active. `NOT writable` (marked with `[!]`) means the directory cannot be written: the cache then only lives in memory until the next restart |
| `TheAudioDB cache off`                        | `THEAUDIODB_KEY` is not set, the bridge does not offer TheAudioDB data                   |
| `No connection to the Roon Core ...`          | the Core cannot be reached. The bridge keeps running and tries again every `ROON_RETRY_MS` |

The cache directory has to be writable for the user that runs the service. If the service uses systemd sandboxing (`ProtectSystem=`), the directory must also be listed in `ReadWritePaths=` in the service file.

## Configuration

The bridge loads environment variables from the first readable file in this order:

1. The file specified by `ENV_FILE`, if set
2. `.env` in the bridge directory
3. `/etc/roon-mqtt.env`

Only the first file that exists is read, the others are ignored. Variables already set in the process environment take precedence over values in these files.

| Variable          | Default                                        | Description                                             |
|-------------------|------------------------------------------------|---------------------------------------------------------|
| `MQTT_BROKER`     | `mqtt://localhost`                             | MQTT broker URL                                         |
| `MQTT_USER`       | Empty                                          | MQTT username                                           |
| `MQTT_PASSWORD`   | Empty                                          | MQTT password                                           |
| `MQTT_TOPIC`      | `roon/now_playing`                             | Base topic for zone and status messages                 |
| `ROON_HOST`       | `127.0.0.1`                                    | Hostname or IP address of the Roon Core                 |
| `ROON_PORT`       | `9330`                                         | Roon Core WebSocket port                                |
| `PAIR_HINT_MS`    | `15000`                                        | Time without a connection after which the status switches to `pairing_required` (Core reachable, extension not enabled) or `roon_disconnected` (Core not reachable). The bridge keeps waiting |
| `ROON_RETRY_MS`   | `10000`                                        | Pause between attempts to connect to the Roon Core. The bridge never exits because the Core is missing |
| `HEARTBEAT_MS`    | `30000`                                        | Interval between status updates, in milliseconds        |
| `LOG_LEVEL`       | `info`                                         | `info` hides the Roon protocol messages (they contain tokens, zone and image keys). `debug` prints everything |
| `IMAGE_URL_BASE`  | Empty                                          | Optional base URL for the Roon image API, as reachable by the browsers |
| `WEB_PORT`        | Empty (off)                                    | Port of the optional [standalone page](#standalone-page-without-home-assistant), e.g. `8080` |
| `THEAUDIODB_KEY`  | Empty (off)                                    | TheAudioDB API key. Switches on the cache `/audiodb` of the web page (see [TheAudioDB](#artist-images-and-biography-from-theaudiodb)). Without it the bridge does not offer TheAudioDB data. Needs `WEB_PORT` |
| `CACHE_DIR`       | `<bridge directory>/cache`                     | directory of the TheAudioDB cache (one small file per artist). Has to be writable for the service user |
| `THEAUDIODB_INTERVAL_MS` | `2100` for the key `123`, otherwise `700` | minimum pause between two requests to theaudiodb.com   |
| `SIGNAL_PATH_LOG` | `/var/roon/RoonServer/Logs/RoonServer_log.txt` | Path to the Roon Server log used by Signal Path support |

**Note:** `SIGNAL_PATH_LOG` is read when `signal-path.js` is loaded. In the current implementation, that happens before the bridge loads its `.env` file. To override the path reliably, set `SIGNAL_PATH_LOG` in the process environment before starting Node.js. The default path works without additional configuration when the log is available there.

Example `/etc/roon-mqtt.env`:

```
MQTT_BROKER=mqtt://homeassistant.local
MQTT_TOPIC=roon/now_playing
MQTT_USER=
MQTT_PASSWORD=

ROON_HOST=127.0.0.1
ROON_PORT=9330
PAIR_HINT_MS=15000
ROON_RETRY_MS=10000
HEARTBEAT_MS=30000
LOG_LEVEL=info
IMAGE_URL_BASE=http://192.168.1.20:9330/api/image
WEB_PORT=8080

# optional: artist images and biography from TheAudioDB
THEAUDIODB_KEY=
CACHE_DIR=/var/lib/roon-card/cache
```

Set `IMAGE_URL_BASE` to the URL reachable by your Home Assistant display browser. If it is unset, consumers must configure their own image URL.

## Standalone page (without Home Assistant)

The bridge can serve the card as a web page of its own. Then no Home Assistant is needed: a Raspberry Pi in kiosk mode, a tablet or any browser in your network opens the page and shows the card with all its features (cover, rotating artist images, lyrics, transport controls, volume and seeking).

The page gets its data directly from the bridge. The browser needs no MQTT access. The MQTT output of the bridge keeps working in parallel, so Home Assistant and the standalone page can be used at the same time.

Screenshots are in the ./img directory, named webserver_X.jpg

**Files** (all in the repository, nothing else to install):

| File                      | Purpose                                                                        |
|---------------------------|--------------------------------------------------------------------------------|
| `bridge/web.js`           | small web server (page, live data, transport controls, TheAudioDB cache)       |
| `bridge/web/index.html`   | page that hosts the card                                                       |
| `roon-card.js`            | the card itself, found in `bridge/web/`, `bridge/` or the repository root      |

The web server only starts if `bridge/web.js` exists and `WEB_PORT` is set. Without `WEB_PORT` the bridge behaves exactly as before.

**Setup:** add these lines to `/etc/roon-mqtt.env` and restart the bridge:

```
WEB_PORT=8080
IMAGE_URL_BASE=http://<roon-server-ip>:9330/api/image
```

The log then shows `[+] Web page on http://<this-host>:8080/`. Open the page in a browser:

```
http://<roon-server-ip>:8080/?zone=Living%20room&options=nosource
```

**URL parameters:**

| Parameter  | Description                                                                                                                                        |
|------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `zone`     | name of the Roon zone, as shown in Roon (case does not matter). Without it, the first zone is used. If the zone is not found, the page lists the available zones |
| `options`  | switches of the card, separated by commas, e.g. `nobuttons,nosource,nostatus` (see [Switches](#switches-options))                                  |
| `bio_lang` | language order of the biography, e.g. `DE,EN` (see [TheAudioDB](#artist-images-and-biography-from-theaudiodb))                                     |
| `audiodb`  | `0` = do not use the TheAudioDB cache of this server                                                                                               |
| `img`      | base URL of the Roon image API. Only needed if `IMAGE_URL_BASE` is not set. Default: `http://<host of the page>:9330/api/image`                    |

For a display without touch, for example: `http://<roon-server-ip>:8080/?zone=Living%20room&options=nobuttons,nosource&bio_lang=DE,EN`.

**TheAudioDB on the page:** with `THEAUDIODB_KEY` in the env file, the page shows TheAudioDB images after the Roon images, and a tap on the artist name opens the biography. The bridge asks theaudiodb.com and stores every answer in `CACHE_DIR`, so every artist is only requested once, no matter how many displays use the page. The cache also answers while the Roon Core is down. You can test it directly:

```
curl 'http://<roon-server-ip>:8080/audiodb?artist=Genesis'
```

The answer is JSON with `strArtistThumb`, `strBiography...` and more. `HTTP 503` means `THEAUDIODB_KEY` is not set, `HTTP 502` means theaudiodb.com did not answer (the next request tries again).

**Kiosk on a Raspberry Pi:** start Chromium in kiosk mode with this URL, for example with `cage -- chromium --kiosk --ozone-platform=wayland "<URL>"`.

> [!WARNING]
> The page has no password. Everybody in your network can control playback and volume, and can use the TheAudioDB cache (which uses your key). Do not expose the port to the internet.

## MQTT topics

| Topic                     | Content                                      |
|---------------------------|----------------------------------------------|
| `roon/now_playing/<zone>` | Retained JSON payload for an individual zone |
| `roon/now_playing/status` | Retained JSON status of the bridge           |

The zone name is converted to lowercase and non-alphanumeric characters are removed to form the topic suffix. For example, `Living Room` becomes `livingroom`.

### Bridge status

The status payload includes a status value and timestamp. When available, it also includes the bridge version, image base URL and Roon Core name and version. The status message is refreshed periodically using the configured heartbeat interval.

| Status              | Meaning                                                  |
|---------------------|----------------------------------------------------------|
| `starting`          | The bridge has started but has not yet paired with Roon  |
| `pairing_required`  | Still not paired after `PAIR_HINT_MS`, although the Core is reachable: enable the extension in the Roon app (**Settings → Extensions**). The bridge keeps running and waits |
| `online`            | The bridge is paired with Roon and can publish zone data |
| `roon_disconnected` | No connection to the Roon Core (lost, or not reachable). The bridge keeps running and tries again every `ROON_RETRY_MS`. As soon as the Core is back, the status switches to `online` by itself |
| `error`             | An unexpected error occurred                             |
| `offline`           | The bridge stopped or disconnected unexpectedly          |

The bridge publishes an `offline` Last Will message if its MQTT connection is lost unexpectedly. On a clean shutdown, it publishes the final status before exiting.

## Checking MQTT data in Home Assistant

1. Go to **Settings → Devices & services → MQTT → Configure**.
2. Subscribe to `roon/now_playing/#`.
3. Start playback and inspect the message for your zone.

A shortened example of a zone payload:

```
{
  "zone_id": "example-zone-id",
  "zone_name": "Living Room",
  "state": "playing",
  "outputs": [
    {
      "output_id": "example-output-id",
      "name": "Living Room",
      "volume": {
        "type": "number",
        "min": 0,
        "max": 100,
        "value": 68,
        "step": 1,
        "is_muted": false
      }
    }
  ],
  "signal_path": {
    "quality": "Lossless",
    "source_format": "FLAC",
    "sample_rate": 44100,
    "bit_depth": 16,
    "channels": 2,
    "lossless": true,
    "matched_by": "log_context"
  },
  "timestamp": "2026-10-21T18:00:00.000Z",
  "now_playing": {
    "track": "Example Track",
    "artist": "Example Artist",
    "album": "Example Album",
    "seek_position": 0,
    "length": 240,
    "image_key": "example-image-key",
    "artist_key": "example-artist-key",
    "artist_keys": ["example-artist-key"]
  }
}
```

The Signal Path values above are illustrative. Actual fields depend on the information available in the Roon Server log. If no matching Signal Path block is found, the property is `null`.

## MQTT sensors in Home Assistant

Add the following sensors to `configuration.yaml` or your MQTT configuration, adjusting the zone topic to match your setup:

```
mqtt:
  sensor:
    - name: "Roon Bridge Status"
      unique_id: roon_bridge_status
      state_topic: "roon/now_playing/status"
      value_template: "{{ value_json.status }}"
      json_attributes_topic: "roon/now_playing/status"

    - name: "Roon Living Room JSON"
      unique_id: roon_livingroom_json
      state_topic: "roon/now_playing/livingroom"
      value_template: "{{ value_json.timestamp }}"
      json_attributes_topic: "roon/now_playing/livingroom"
```

To avoid filling the Home Assistant database with frequent updates, exclude these entities from the recorder if appropriate for your installation.

```
recorder:
  exclude:
    entities:
      - sensor.roon_bridge_status
      - sensor.roon_livingroom_json
```

After reloading the MQTT configuration, open **Developer Tools → States** and inspect the sensor attributes to see the complete JSON payload.

---

# Troubleshooting

| Problem                                          | Likely cause                                                                                                                                                                          |
|--------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| "Custom element doesn't exist: roon-player-card" | the resource is missing, has the wrong type (must be `module`) or the browser uses a cached version. Increase `?v=` and reload. With HACS: reload the browser (hard refresh)         |
| Card shows `Fallback`                            | the sensor does not match the current track. Check that the bridge is running and the sensor topic is correct. Use `nostale` if the titles of player and Roon are spelled differently |
| Card shows no data at all                        | the bridge is not installed or not running. HACS only installs the card, not the bridge                                                                                               |
| No artist images                                 | `roon_url` is missing or wrong, the browser cannot reach the Roon server, or Home Assistant runs on HTTPS (see HTTPS note)                                                            |
| No TheAudioDB images (no `tadb` in the pill)     | neither `audiodb_key` nor `audiodb_url` is set, or `audiodb_images` is `off`. Open the diagnostic panel with `options: [debug]` and tap the pill: the line `audiodb:` shows the mode and the state per artist (`ok`, `ok (unknown)`, `loading`, `error`, `none`). `unknown` means TheAudioDB has no artist with exactly this name |
| Biography does not open                          | nothing happens on a tap: `audiodb_key`/`audiodb_url` is missing, `nobio` is set, or the display has no touch. Tap the **name of the artist** in the bottom bar. "TheAudioDB not reachable": key wrong, rate limit reached (test key), or no internet access. "No biography available": TheAudioDB has no text in the languages of `bio_lang` |
| Standalone page: no TheAudioDB data              | the log must show `TheAudioDB cache on /audiodb`. If it shows `cache off`, `THEAUDIODB_KEY` is not in the env file that is used (see `Configuration loaded from ...`). Test with `curl 'http://<host>:8080/audiodb?artist=Genesis'` (503 = no key, 502 = theaudiodb.com did not answer). Reload the page after updating `roon-card.js` or `index.html` (hard refresh) |
| `TheAudioDB cache: ... NOT writable` in the log  | the service user cannot write to `CACHE_DIR`. Check the owner of the directory (`ls -ld`) and, with systemd sandboxing, `ReadWritePaths=` in the service file. The cache works in memory until then |
| Idle image is broken                             | `/local/icons/roon-logo.png` does not exist. With HACS this file has to be downloaded separately                                                                                      |
| No lyrics                                        | the track has no synchronized lyrics at LRCLIB, the service is temporarily down (the card retries after a minute), or `nosongtext` is set                                             |
| Lyrics are out of sync                           | adjust `lyrics_offset`. A wrong clock on the display can also cause a shift of one or two seconds                                                                                     |
| Standalone page stays empty                      | `WEB_PORT` is missing or `web.js` / `web/index.html` are not in the bridge directory (the log must show `Web page on ...`). The bridge is not paired with Roon (status `pairing_required`) or the Core is not reachable (status `roon_disconnected`). The zone name in `?zone=` does not exist: the page then lists the available zones after a few seconds |
| Bridge does not start                            | `sudo journalctl -u roon-mqtt.service -n 50`. Check the extension is enabled in Roon and the broker settings in `/etc/roon-mqtt.env`                                                  |
| Roon protocol lines (`<- CONTINUE ...`) in the log | `LOG_LEVEL` is `debug`, or an old version of the bridge is running. Check the first lines of the log (`roon-bridge v...`). Those lines contain tokens and zone IDs, do not share them  |

# License

MIT
