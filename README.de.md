**🌐 [English](https://github.com/rudiratlos/roon-card/blob/main/README.md) | Deutsch**

# roon-card

[![Öffne deine Home-Assistant-Instanz und zeige dieses Repository im Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rudiratlos&repository=roon-card&category=plugin)

Eine Home-Assistant-Dashboard-Karte und eine kleine Bridge, die eine Roon-ähnliche "Now Playing"-Ansicht auf einfachen Displays ermöglichen.

- **roon-card** ist eine eigene Lovelace-Karte. Sie zeigt Albumcover, wechselnde Künstlerbilder, Titel, Künstler und Album und bietet Transportsteuerung, Lautstärke, Spulen und synchronisierte Songtexte. Optional ergänzt sie weitere Künstlerbilder und eine Biografie von [TheAudioDB](https://www.theaudiodb.com).
- **roon-bridge** ist ein kleiner Node.js-Dienst. Er liest den Wiedergabestatus deiner Roon-Zonen vom Roon Core und veröffentlicht ihn auf deinem MQTT-Broker.

Die Bridge kann die Karte ausserdem als eigenständige Webseite ausliefern, sodass sie auch ohne Home Assistant läuft (siehe [Eigenständige Seite](#eigenständige-seite-ohne-home-assistant)).

Das originale Roon Display braucht einen modernen Browser und läuft nicht auf einfachen Displays wie dem Shelly Wall Display. **Diese Karte schon.**

[![Vergleich](https://github.com/rudiratlos/roon-card/raw/main/img/roon-card_vs_roon-display.jpg)](https://github.com/rudiratlos/roon-card/blob/main/img/roon-card_vs_roon-display.jpg)

Rechts ist das originale Roon Display, links roon-card. Ein Tipp auf das Cover oder das Künstlerbild zeigt das Cover vergrössert.

<p>
  <img src="https://github.com/rudiratlos/roon-card/blob/main/img/walldisplay_1.jpg" alt="Wall display 1" width="45%">
  <img src="https://github.com/rudiratlos/roon-card/blob/main/img/walldisplay_2.jpg" alt="Wall display 2" width="45%">
</p>

**Fallback-Modus:** Liefert die Roon-Bridge keine Bildinformationen (z. B. weil sie gestoppt ist), arbeitet die Karte weiter mit den Daten der normalen `media_player`-Entität. Sie zeigt dann das vom Player gelieferte Cover, und die Statusanzeige zeigt `Fallback`. Künstlerbilder und Biografie von TheAudioDB funktionieren auch in diesem Modus, weil die Karte dafür nur den Künstlernamen des Players braucht.

> [!IMPORTANT]
> **HACS installiert nur die Karte, nicht die Bridge.** Die Bridge ist ein separater Dienst, der auf dem Roon-Server läuft (siehe [roon-bridge](#roon-bridge)). Ohne Bridge funktioniert die Karte nur im Fallback-Modus: keine Roon-Künstlerbilder, keine synchronisierten Titeldaten.
>
> **Bezeichnung:** Das Repository heisst `roon-card`, der Kartentyp im Dashboard lautet aber `custom:roon-player-card`.

## Inhaltsverzeichnis

- [Schnellstart](#schnellstart)
- [Voraussetzungen](#voraussetzungen)
- [Installation von roon-card](#installation-von-roon-card)
- [Verwendung](#verwendung)
  - [Künstlerbilder und Biografie von TheAudioDB](#künstlerbilder-und-biografie-von-theaudiodb)
- [roon-bridge](#roon-bridge)
  - [Eigenständige Seite ohne Home Assistant](#eigenständige-seite-ohne-home-assistant)
- [Fehlerbehebung](#fehlerbehebung)

---

# Schnellstart

Die Einrichtung besteht aus fünf Schritten. Details stehen in den Abschnitten weiter unten.

1. **Bridge installieren** auf dem Rechner, auf dem dein Roon Core läuft → [Installation der Bridge](#installation-debianubuntu).
2. **Erweiterung aktivieren** in der Roon-Remote-App (**Einstellungen → Erweiterungen → Cover Fetcher LOCAL**).
3. **MQTT-Sensoren anlegen** in Home Assistant → [MQTT-Sensoren](#mqtt-sensoren-in-home-assistant).
4. **Karte über HACS installieren:**

   [![Öffne deine Home-Assistant-Instanz und zeige dieses Repository im Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rudiratlos&repository=roon-card&category=plugin)

   Auf den Button klicken, **Herunterladen** wählen, danach den Browser neu laden.
5. **Karte zum Dashboard hinzufügen:** Dashboard bearbeiten → **Karte hinzufügen** → **Manuell** und einfügen:

   ```yaml
   type: custom:roon-player-card
   player: media_player.streamer
   sensor: sensor.roon_livingroom_json
   status_sensor: sensor.roon_bridge_status
   roon_url: http://<roon-server-ip>:9330/api/image/
   ```

   Ersetze `player`, `sensor` und `roon_url` durch die Werte deiner Installation.

---

## Voraussetzungen

- Home Assistant mit der MQTT-Integration
- [HACS](https://hacs.xyz) (empfohlen) oder manuelle Installation
- Roon Core
- Eine `media_player`-Entität, die deinen Streamer steuert (alle Transport-Tasten rufen Dienste dieser Entität auf)
- Für die Bridge: ein Debian/Ubuntu-Host (oder ähnlich) mit Node.js 18 oder neuer (Version angenommen, nicht geprüft)
- Optional: ein API-Schlüssel von [TheAudioDB](https://www.theaudiodb.com) für weitere Künstlerbilder und die Biografie

Die Karte hat keine Abhängigkeiten zu anderen Karten (kein button-card, kein card_mod).

---

# Installation von roon-card

## Über HACS (empfohlen)

**Direktlink:**

[![Öffne deine Home-Assistant-Instanz und zeige dieses Repository im Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rudiratlos&repository=roon-card&category=plugin)

Der Button öffnet HACS in deiner Home-Assistant-Instanz mit diesem Repository bereits ausgewählt. Auf **Herunterladen** klicken und den Browser neu laden. (Beim ersten Mal fragt my.home-assistant.io nach der Adresse deiner Home-Assistant-Instanz.)

**Manuell in HACS:**

1. HACS in Home Assistant öffnen.
2. Menü (drei Punkte) → **Benutzerdefinierte Repositories**.
3. `https://github.com/rudiratlos/roon-card.git` mit der Kategorie **Dashboard** hinzufügen.
4. Nach "Roon Player Card" suchen, installieren und den Browser neu laden.

HACS trägt die Ressource selbst ein. Falls du die Ressource früher manuell hinzugefügt hast, entferne sie, damit die Karte nicht doppelt geladen wird.

> [!NOTE]
> HACS lädt nur die Kartendatei `roon-card.js` herunter. Das Logo aus dem [Beispiel für das Ruhebild](#bild-anzeigen-wenn-nichts-läuft) ist **nicht** enthalten. Wenn du es verwenden möchtest, lade es einmalig herunter, z. B. im Terminal-Add-on:
>
> ```
> mkdir -p /config/www/icons
> wget -O /config/www/icons/roon-logo.png https://raw.githubusercontent.com/rudiratlos/roon-card/refs/heads/main/img/roon-logo.png
> ```
>
> Du kannst auch ein beliebiges anderes Bild aus `/config/www/` verwenden.

## Manuelle Installation

```
cd /config/www/
wget https://raw.githubusercontent.com/rudiratlos/roon-card/refs/heads/main/roon-card.js
mkdir -p icons
wget -O icons/roon-logo.png https://raw.githubusercontent.com/rudiratlos/roon-card/refs/heads/main/img/roon-logo.png
```

### Ressource hinzufügen

YAML-Modus (`configuration.yaml`):

```
lovelace:
  resources:
    - url: /local/roon-card.js?v=2.0.0
      type: module
```

Oberfläche (UI-Modus):

1. **Erweiterten Modus** im Benutzerprofil aktivieren.
2. **Einstellungen → Dashboards → ⋮ → Ressourcen** öffnen.
3. **Ressource hinzufügen** klicken und eingeben:

   - **URL:** `/local/roon-card.js?v=2.0.0`
   - **Typ:** `JavaScript-Modul`
4. Speichern und den Browser neu laden.

Wenn du die Datei aktualisierst, erhöhe die Zahl hinter `?v=`, damit Browser nicht die zwischengespeicherte Version verwenden.

---

# Verwendung

Minimale Konfiguration:

```
type: custom:roon-player-card
player: media_player.streamer
sensor: sensor.roon_auralic_json
status_sensor: sensor.roon_bridge_status
roon_url: http://<roon-server-ip>:9330/api/image/
```

Vollständiges Beispiel mit allen gängigen Optionen:

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
audiodb_key: "<dein TheAudioDB-Schlüssel>"
bio_lang: DE,EN
options: [ nosongtext ]
```

Ersetze `player`, `sensor`, `roon_url` und `audiodb_key` durch die Werte deiner Installation. `audiodb_key` ist optional: Ohne ihn stellt die Karte keine Anfragen an TheAudioDB.

## Bild anzeigen, wenn nichts läuft

Die Karte selbst hat keinen Ruhebildschirm. Üblich ist eine `conditional`-Karte, die ein Bild zeigt, solange der Player weder spielt noch pausiert. Das Beispiel verwendet `/local/icons/roon-logo.png`; bei einer HACS-Installation musst du diese Datei zuerst herunterladen (siehe Hinweis unter [Über HACS](#über-hacs-empfohlen)).

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

## Konfigurationsoptionen

| Name               | Typ            | Standard            | Beschreibung                                                                                                                                  |
|--------------------|----------------|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `type`             | String         |                     | muss `custom:roon-player-card` sein                                                                                                           |
| `player`           | String         |                     | **erforderlich.** media_player-Entität deines Streamers                                                                                       |
| `sensor`           | String         |                     | MQTT-Sensor, der die Bridge-Daten empfängt (siehe unten). Ohne ihn läuft die Karte nur im Player-Modus                                        |
| `status_sensor`    | String         |                     | MQTT-Sensor mit dem Status der Bridge (siehe unten)                                                                                           |
| `roon_url`         | String         |                     | Basis-URL der Roon-Bild-API, endet auf `/api/image/`. Ohne sie werden keine Roon-Künstlerbilder gezeigt und das Cover kommt vom Player        |
| `bg_aspects_main`  | Liste          | `['12by10','4by3']` | Bildformate, die für den ersten Künstler gezeigt werden                                                                                       |
| `bg_aspects_other` | Liste          | `['12by10']`        | Bildformate für weitere Künstler                                                                                                              |
| `bg_interval`      | Zahl           | `15`                | längste Zeit pro Bild in Sekunden                                                                                                             |
| `bg_interval_min`  | Zahl           | `10`                | kürzeste Zeit pro Bild in Sekunden, wird bei vielen Bildern verwendet                                                                         |
| `bg_cycle`         | Zahl           | `90`                | Zielzeit in Sekunden für einen Durchlauf durch alle Bilder. Die Zeit pro Bild ist `bg_cycle` geteilt durch die Anzahl der Bilder, aber nie unter `bg_interval_min` und nie über `bg_interval`. `0` = immer `bg_interval` |
| `zoom_seconds`     | Zahl           | `30`                | das vergrösserte Cover blendet sich nach dieser Zeit oder bei einem neuen Titel aus                                                           |
| `cover_fit`        | String         | `contain`           | `contain` zeigt das ganze Cover, `cover` füllt die Fläche                                                                                     |
| `lyrics_dim`       | Zahl           | `0.55`              | wie stark das Bild hinter den Songtexten abgedunkelt wird (0 bis 1)                                                                           |
| `lyrics_offset`    | Zahl           | `0.2`               | Sekunden, positiv zeigt die Texte früher, negativ später                                                                                      |
| `format_attr`      | Liste          | `[]`                | Attributnamen, die als Audioformat angezeigt werden, z. B. `[sample_rate, bit_depth]`                                                         |
| `audiodb_key`      | String         |                     | API-Schlüssel von TheAudioDB. Ohne Schlüssel (und ohne `audiodb_url`) stellt die Karte keine Anfragen an TheAudioDB. Siehe [TheAudioDB](#künstlerbilder-und-biografie-von-theaudiodb) |
| `audiodb_url`      | String         |                     | Cache des Bridge-Webservers, z. B. `http://<roon-server-ip>:8080/audiodb`. Er wird zuerst gefragt, die Karte braucht dafür keinen Schlüssel. Die [eigenständige Seite](#eigenständige-seite-ohne-home-assistant) setzt ihn selbst |
| `audiodb_images`   | String         | `extra`             | `extra` zeigt die TheAudioDB-Bilder nach den Roon-Bildern, `fallback` nur wenn Roon keine hat, `off` zeigt keine (die Biografie bleibt verfügbar) |
| `bio_lang`         | String/Liste   | `EN`                | Sprachreihenfolge der Biografie, z. B. `DE,EN` oder `[DE, EN]`                                                                                |
| `clock_url`        | String         | `/`                 | URL, mit der die Uhr des Displays mit Home Assistant verglichen wird (nur der `Date`-Header wird gelesen)                                     |
| `max_height`       | String         | `85vh`              | maximale Höhe der Karte, beliebige CSS-Länge. Die Karte ist nie höher als breit                                                               |
| `bar_h`            | Zahl           | `112`               | Höhe der unteren Leiste in px                                                                                                                 |
| `pad`              | Zahl           | `20`                | horizontaler Abstand der unteren Leiste in px                                                                                                 |
| `options`          | Liste          | `[]`                | Schalter, siehe unten                                                                                                                         |

Die Bildformate werden als `?aspect=...` an die Roon-Bild-API übergeben. Getestet sind die Formate `12by10`, `4by3`, `16by12` und `16by7`.

### Schalter (`options`)

| Name          | Beschreibung                                                                                                |
|---------------|-------------------------------------------------------------------------------------------------------------|
| `nobuttons`   | keine Player-Bedienung (Lautstärke, Zurück, Play/Pause, Weiter) und kein Spulen per Tipp auf den Fortschrittsbalken. Für Displays ohne Touch. Die untere Leiste wird kleiner, das Bild dadurch grösser |
| `nobio`       | ein Tipp auf einen Künstlernamen öffnet die Biografie nicht                                                 |
| `nosongtext`  | Songtexte nicht anzeigen                                                                                    |
| `nostatus`    | Statusanzeige nicht anzeigen (Bildquelle, Format, Fallback, Audioformat)                                    |
| `noaspect`    | Seitenverhältnis (Roon-Bilder) oder Bildtyp (`thumb`, `fanart`; TheAudioDB-Bilder) in der Statusanzeige nicht anzeigen |
| `nosource`    | die Wörter `Artist` und `Cover` in der Statusanzeige nicht anzeigen. Die Quelle und die Künstlernummer bleiben: `roon`, `tadb 2/2` statt `roon Cover`, `tadb Artist 2/2` |
| `noformat`    | Audioformat in der Statusanzeige nicht anzeigen                                                             |
| `nounderline` | den Namen des Künstlers, dessen Bild gerade läuft, nicht unterstreichen (nur bei Titeln mit mehreren Künstlern) |
| `noscroll`    | lange Titel, Künstler oder Alben nicht scrollen, stattdessen "..." anzeigen                                 |
| `nostale`     | Prüfung deaktivieren, ob die Bridge-Daten zum aktuellen Titel passen                                        |
| `debug`       | ein Tipp auf die Statusanzeige öffnet ein Diagnose-Panel (Bridge-Status, Bildquellen, TheAudioDB-Status, Intervall, aktuelle Bild-URL) |

### Statusanzeige

Die kleine Anzeige unten rechts im Bild zeigt, woher das aktuelle Bild kommt, zum Beispiel:

| Anzeige                      | Bedeutung                                                                     |
|------------------------------|-------------------------------------------------------------------------------|
| `roon Cover`                 | das Albumcover                                                                |
| `roon Artist 1/2 · 12by10`   | Künstlerbild von Roon, erster von zwei Künstlern, Bildformat `12by10`         |
| `tadb Artist 2/2 · fanart`   | Künstlerbild von TheAudioDB (`tadb`), zweiter von zwei Künstlern, Typ `fanart` |

`roon` bedeutet, dass das Bild von Roon kommt (Bild-API des Core, im Fallback-Modus das Cover des Media-Players), `tadb` bedeutet, dass es von TheAudioDB kommt. Mit dem Schalter `nosource` entfallen die Wörter `Artist` und `Cover`, die Anzeige lautet dann `roon`, `roon 1/2 · 12by10` oder `tadb 2/2 · fanart`.

### Künstlerbilder und Biografie von TheAudioDB

Die Karte kann Bilder und eine Biografie von [TheAudioDB](https://www.theaudiodb.com) ergänzen, einer Community-Datenbank für Musik-Artwork. Sie ist aus, solange weder `audiodb_key` noch `audiodb_url` gesetzt ist.

**Bilder:** Für jeden Künstler (bis zu drei) zeigt die Karte das Thumb und bis zu vier Fanart-Bilder (`strArtistThumb`, `strArtistFanart`, `strArtistFanart2` bis `strArtistFanart4`). Mit `audiodb_images: extra` (Standard) folgen sie auf die Roon-Bilder, du bekommst also mehr Abwechslung. Bei mehr Bildern wird die Zeit pro Bild kürzer (siehe `bg_interval_min` und `bg_cycle`).

**Biografie:** Tippe in der unteren Leiste auf den Namen eines Künstlers. Es öffnet sich ein Panel mit Land, Genre, Jahr und dem Text. Ein Tipp auf das Panel schliesst es. `bio_lang` legt die Sprachreihenfolge fest. `bio_lang: DE,EN` bedeutet: zuerst der deutsche Text (`strBiographyDE`), falls keiner da ist der englische (`strBiography`). Andere Sprachen verwenden die Codes von TheAudioDB (z. B. `FR`, `ES`, `IT`, `NL`); `JA`, `ZH`, `SV`, `HE` und `NB` werden auf `JP`, `CN`, `SE`, `IL` und `NO` abgebildet. Die Fusszeile des Panels zeigt die verwendete Sprache. Auf einem Display ohne Touch lässt sich die Biografie nicht öffnen.

**Zuordnung:** Der Künstlername muss mit dem Eintrag bei TheAudioDB übereinstimmen (Gross-/Kleinschreibung, Akzente und Satzzeichen werden ignoriert). Stimmt er nicht, gibt es für diesen Künstler weder Bilder noch Biografie, was besser ist als eine falsche.

**Drei Möglichkeiten:**

| Aufbau                                | Konfiguration                                                           | Woher die Anfragen kommen                                        |
|---------------------------------------|-------------------------------------------------------------------------|------------------------------------------------------------------|
| Home Assistant, direkt                | `audiodb_key` in der Karte                                              | der Browser jedes Displays fragt theaudiodb.com                  |
| Home Assistant, mit Bridge-Cache      | `audiodb_url: http://<roon-server-ip>:8080/audiodb` und `THEAUDIODB_KEY` in der env-Datei der Bridge | der Browser fragt die Bridge, die Bridge fragt theaudiodb.com und speichert die Antworten |
| Eigenständige Seite                   | `THEAUDIODB_KEY` in der env-Datei der Bridge (die Seite setzt die URL selbst) | wie in der Zeile darüber                                         |

Konfigurierst du `audiodb_url` und `audiodb_key` zusammen, fragt die Karte zuerst die Bridge und nur wenn die nicht erreichbar ist direkt theaudiodb.com. Das funktioniert auch ohne die Roon-Bridge, weil die Karte nur den Künstlernamen des Media-Players braucht.

**Schlüssel und Limits:** TheAudioDB bietet einen kostenlosen Test-Schlüssel (`123`) mit strengen Limits, die sich alle Nutzer teilen. Für den Dauerbetrieb besorge dir einen eigenen Schlüssel bei theaudiodb.com. Jeder Künstler wird nur einmal abgefragt: Der Browser (direkter Modus) oder die Bridge (Cache) merkt sich die Antwort 30 Tage lang, unbekannte Künstler einen Tag. Nach einem Fehler versucht es die Karte nach 10 Minuten erneut. Die Bridge löscht abgelaufene Cache-Dateien selbst, kurz nach dem Start und danach einmal täglich.

**Datenschutz:** Die Namen der Künstler des aktuellen Titels (bis zu drei) werden an theaudiodb.com gesendet, vom Browser des Displays (direkter Modus) oder von der Bridge (Cache). Im direkten Modus ist der Schlüssel Teil der Dashboard-Konfiguration und für alle sichtbar, die sie lesen können. Beim Bridge-Cache bleibt der Schlüssel auf dem Server.

### Audioformat (Bittiefe, Abtastrate)

Die Roon-Erweiterungs-API liefert weder Abtastrate noch Bittiefe, daher kann die Bridge sie nicht bereitstellen. Hat dein Player oder Sensor solche Attribute, trage ihre Namen in `format_attr` ein. Du findest sie unter **Entwicklerwerkzeuge → Zustände** bei deinem Player. Die Werte werden unverändert angezeigt, z. B. `44100 24`.

### Songtexte und Datenschutz

Die Songtexte stammen von [LRCLIB](https://lrclib.net). Die Karte sendet den ersten Künstler, Titel, Album und die Dauer des aktuellen Titels vom Browser des Displays an lrclib.net. Nicht jeder Titel hat synchronisierte Texte. Mit `nosongtext` schaltest du das ab.

### Hinweis zu HTTPS

Die Roon-Bild-API liefert nur unverschlüsseltes HTTP. Öffnest du Home Assistant über HTTPS, blockieren Browser diese Bilder (Mixed Content). Leite die Bilder dann über einen HTTPS-Reverse-Proxy und verwende dessen URL als `roon_url`. Dasselbe gilt für `audiodb_url`: Eine HTTP-Adresse der Bridge wird auf einer HTTPS-Seite blockiert. Die Karte fragt dann direkt theaudiodb.com, wenn `audiodb_key` gesetzt ist.

---

# roon-bridge

## Was sie macht

`roon-bridge` ist ein Node.js-Dienst, der sich mit dem Roon Core verbindet, dessen Audiozonen überwacht und Wiedergabeinformationen per MQTT veröffentlicht. Sie wird **nicht** über HACS installiert, sondern auf dem Roon-Server (oder einem anderen Linux-Host im selben Netzwerk).

Für jede Zone veröffentlicht die Bridge eine Retained-JSON-Nachricht mit:

- Wiedergabestatus und Transportfunktionen
- Aktueller Titel, Künstler, Album und Wiedergabeposition
- Schlüssel für Albumcover und Künstlerbilder
- Ausgabegeräte, Lautstärke und Stummschaltung
- Optionale Signalpfad-Informationen zum aktuell gespielten Titel

Zusätzlich veröffentlicht die Bridge ihren Betriebsstatus, einschliesslich Bridge-Version und Roon-Core-Informationen, in einem eigenen MQTT-Status-Topic.

Die Bridge läuft weiter, wenn der Roon Core nicht erreichbar ist, zum Beispiel während er neu startet. Sie meldet den Status `roon_disconnected`, hält ihre Webseite und den TheAudioDB-Cache verfügbar und verbindet sich von selbst wieder.

## Signalpfad-Unterstützung

Die Bridge enthält optionale Signalpfad-Unterstützung über [`bridge/signal-path.js`](https://github.com/rudiratlos/roon-card/blob/main/bridge/signal-path.js).

Spielt eine Zone, liest das Modul das Roon-Server-Log und sucht den jüngsten Signalpfad-Block, der zu dieser Zone passt. Die Zuordnung erfolgt über den Log-Kontext und ersatzweise über die Namen der Zone oder des Ausgabegeräts.

Der Standardpfad des Logs ist:

```
/var/roon/RoonServer/Logs/RoonServer_log.txt
```

Der Pfad kann mit der Umgebungsvariable `SIGNAL_PATH_LOG` überschrieben werden.

Das Modul speichert die ausgewerteten Logdaten zwischen und lädt sie neu, wenn sich Dateigrösse oder Änderungszeit ändern.

### Signalpfad-Daten

Die Zonen-Nachricht enthält die Eigenschaft `signal_path`. Sind passende Informationen vorhanden, kann sie enthalten:

| Eigenschaft            | Beschreibung                                                  |
|------------------------|---------------------------------------------------------------|
| `quality`              | Gesamtqualität des Signalpfads                                |
| `source_format`        | Quellformat                                                   |
| `sample_rate`          | Abtastrate der Quelle in Hz                                   |
| `bit_depth`            | Bittiefe der Quelle                                           |
| `channels`             | Anzahl der Kanäle der Quelle                                  |
| `bitrate`              | Bitrate der Quelle, falls verfügbar                           |
| `source_quality`       | von Roon gemeldete Qualität der Quelle                        |
| `lossless`             | ob die Quelle als verlustfrei gemeldet wird                   |
| `dsp`                  | DSP-Name, Ein-/Ausgangs-Abtastraten und Qualität              |
| `volume_normalization` | Pegelangleichung (Verstärkung und Qualität)                   |
| `digital_volume_db`    | digitale Lautstärkeverstärkung in dB                          |
| `bit_depth_processing` | Informationen zu Bittiefen-Erweiterung und -Kürzung           |
| `raat_device`          | RAAT-Geräteinformationen                                      |
| `output`               | Ausgabetyp, Qualität, Untertyp und Modell                     |
| `matched_by`           | Wie die Zone zugeordnet wurde: `log_context` oder `device_name` |
| `raw`                  | Ursprünglich ausgewerteter Signalpfad-Block                   |

Einzelne Felder können `null` sein, wenn die entsprechende Information im Log fehlt.

Der Signalpfad ist optional. Fehlt `signal-path.js` oder lässt es sich nicht laden, arbeitet die Bridge ohne Signalpfad-Daten weiter. Wird kein passender Block gefunden, ist `signal_path` gleich `null`.

Das Log muss für den Benutzer lesbar sein, unter dem die Bridge läuft. Läuft der Roon Server unter einem anderen Benutzer, müssen passende Dateirechte gesetzt werden.

## Installation (Debian/Ubuntu)

Per SSH mit dem Roon-Server verbinden und Node.js sowie npm installieren:

```
sudo apt update
sudo apt install -y nodejs npm
node --version
```

Node.js 18 oder neuer wird empfohlen.

Bridge installieren:

```
sudo git clone https://github.com/rudiratlos/roon-card.git /opt/roon-card
cd /opt/roon-card/bridge
sudo npm install
sudo cp roon-mqtt.service /etc/systemd/system/
sudo cp roon-mqtt.env.example /etc/roon-mqtt.env
sudo chmod 600 /etc/roon-mqtt.env
sudo nano /etc/roon-mqtt.env
```

MQTT-Broker und Roon-Core-Verbindung in `/etc/roon-mqtt.env` eintragen.

Dienst aktivieren und starten:

```
sudo systemctl daemon-reload
sudo systemctl enable --now roon-mqtt.service
sudo journalctl -u roon-mqtt.service -f
```

Zum Schluss die Roon-Remote-App öffnen, zu **Einstellungen → Erweiterungen** gehen und **Cover Fetcher LOCAL** aktivieren bzw. koppeln.

### Aktualisieren

```
cd /opt/roon-card
sudo git pull
cd bridge
sudo npm install
sudo systemctl restart roon-mqtt
```

### Startlog

`journalctl -f` zeigt beim Start nur die letzten 10 Zeilen. Um den Start der Bridge zu sehen, verwende:

```
sudo journalctl -u roon-mqtt.service -n 60 --no-pager
```

Ein gesunder Start sieht so aus:

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

Was die Zeilen bedeuten:

| Zeile                                         | Bedeutung                                                                                |
|-----------------------------------------------|------------------------------------------------------------------------------------------|
| `roon-bridge v...`                            | Version der Bridge (aus `package.json`) und von Node.js                                  |
| `Configuration loaded from ...`               | welche env-Datei verwendet wird. Es wird nur die erste gefundene Datei gelesen, siehe [Konfiguration](#konfiguration) |
| `TheAudioDB cache on /audiodb: dir ... writable` | der Cache ist aktiv. `NOT writable` (mit `[!]` markiert) bedeutet, dass das Verzeichnis nicht beschreibbar ist: Der Cache lebt dann nur im Speicher bis zum nächsten Neustart |
| `TheAudioDB cache off`                        | `THEAUDIODB_KEY` ist nicht gesetzt, die Bridge bietet keine TheAudioDB-Daten an          |
| `TheAudioDB cache cleanup: 2 of 40 files removed ...` | die tägliche Bereinigung: wie viele Cache-Dateien abgelaufen oder beschädigt waren und gelöscht wurden. Sie erscheint erstmals wenige Sekunden nach dem Start |
| `No connection to the Roon Core ...`          | der Core ist nicht erreichbar. Die Bridge läuft weiter und versucht es alle `ROON_RETRY_MS` erneut |

Das Cache-Verzeichnis muss für den Benutzer beschreibbar sein, unter dem der Dienst läuft. Verwendet der Dienst die systemd-Absicherung (`ProtectSystem=`), muss das Verzeichnis zusätzlich in `ReadWritePaths=` in der Service-Datei stehen.

## Konfiguration

Die Bridge lädt Umgebungsvariablen aus der ersten lesbaren Datei in dieser Reihenfolge:

1. Die Datei aus `ENV_FILE`, falls gesetzt
2. `.env` im Bridge-Verzeichnis
3. `/etc/roon-mqtt.env`

Es wird nur die erste vorhandene Datei gelesen, die anderen werden ignoriert. Variablen, die bereits in der Prozessumgebung gesetzt sind, haben Vorrang vor den Werten in diesen Dateien.

| Variable          | Standard                                       | Beschreibung                                                  |
|-------------------|------------------------------------------------|---------------------------------------------------------------|
| `MQTT_BROKER`     | `mqtt://localhost`                             | URL des MQTT-Brokers                                          |
| `MQTT_USER`       | leer                                           | MQTT-Benutzername                                             |
| `MQTT_PASSWORD`   | leer                                           | MQTT-Passwort                                                 |
| `MQTT_TOPIC`      | `roon/now_playing`                             | Basis-Topic für Zonen- und Statusnachrichten                  |
| `ROON_HOST`       | `127.0.0.1`                                    | Hostname oder IP-Adresse des Roon Core                        |
| `ROON_PORT`       | `9330`                                         | WebSocket-Port des Roon Core                                  |
| `PAIR_HINT_MS`    | `15000`                                        | Zeit ohne Verbindung, nach der der Status auf `pairing_required` (Core erreichbar, Erweiterung nicht aktiviert) oder `roon_disconnected` (Core nicht erreichbar) wechselt. Die Bridge wartet weiter |
| `ROON_RETRY_MS`   | `10000`                                        | Pause zwischen den Versuchen, sich mit dem Roon Core zu verbinden. Die Bridge beendet sich nie, nur weil der Core fehlt |
| `HEARTBEAT_MS`    | `30000`                                        | Intervall zwischen Status-Updates in Millisekunden            |
| `LOG_LEVEL`       | `info`                                         | `info` blendet die Roon-Protokollmeldungen aus (sie enthalten Tokens, Zonen- und Bild-Schlüssel). `debug` gibt alles aus |
| `IMAGE_URL_BASE`  | leer                                           | optionale Basis-URL der Roon-Bild-API, wie sie die Browser erreichen |
| `WEB_PORT`        | leer (aus)                                     | Port der optionalen [eigenständigen Seite](#eigenständige-seite-ohne-home-assistant), z. B. `8080` |
| `THEAUDIODB_KEY`  | leer (aus)                                     | API-Schlüssel von TheAudioDB. Schaltet den Cache `/audiodb` der Webseite ein (siehe [TheAudioDB](#künstlerbilder-und-biografie-von-theaudiodb)). Ohne ihn bietet die Bridge keine TheAudioDB-Daten an. Braucht `WEB_PORT` |
| `CACHE_DIR`       | `<Bridge-Verzeichnis>/cache`                   | Verzeichnis des TheAudioDB-Caches (eine kleine Datei pro Künstler). Muss für den Dienst-Benutzer beschreibbar sein. Abgelaufene Dateien werden automatisch gelöscht, kurz nach dem Start und danach einmal täglich |
| `THEAUDIODB_INTERVAL_MS` | `2100` beim Schlüssel `123`, sonst `700` | minimale Pause zwischen zwei Anfragen an theaudiodb.com       |
| `SIGNAL_PATH_LOG` | `/var/roon/RoonServer/Logs/RoonServer_log.txt` | Pfad zum Roon-Server-Log für die Signalpfad-Unterstützung     |

**Hinweis:** `SIGNAL_PATH_LOG` wird beim Laden von `signal-path.js` gelesen. In der aktuellen Implementierung geschieht das, bevor die Bridge ihre `.env`-Datei lädt. Um den Pfad zuverlässig zu ändern, setze `SIGNAL_PATH_LOG` in der Prozessumgebung, bevor Node.js gestartet wird. Der Standardpfad funktioniert ohne zusätzliche Konfiguration, wenn das Log dort liegt.

Beispiel `/etc/roon-mqtt.env`:

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

# optional: Künstlerbilder und Biografie von TheAudioDB
THEAUDIODB_KEY=
CACHE_DIR=/var/lib/roon-card/cache
```

Setze `IMAGE_URL_BASE` auf die URL, die der Browser deines Home-Assistant-Displays erreichen kann. Ist sie nicht gesetzt, müssen die Verbraucher ihre eigene Bild-URL konfigurieren.

## Eigenständige Seite (ohne Home Assistant)

Die Bridge kann die Karte als eigene Webseite ausliefern. Dann ist kein Home Assistant nötig: Ein Raspberry Pi im Kiosk-Modus, ein Tablet oder jeder Browser im Netzwerk öffnet die Seite und zeigt die Karte mit allen Funktionen (Cover, wechselnde Künstlerbilder, Songtexte, Transportsteuerung, Lautstärke und Spulen).

Die Seite bekommt ihre Daten direkt von der Bridge. Der Browser braucht keinen MQTT-Zugriff. Die MQTT-Ausgabe der Bridge läuft parallel weiter, Home Assistant und die eigenständige Seite können also gleichzeitig verwendet werden.

**Dateien** (alle im Repository, es ist nichts weiter zu installieren):

| Datei                     | Zweck                                                                                |
|---------------------------|--------------------------------------------------------------------------------------|
| `bridge/web.js`           | kleiner Webserver (Seite, Live-Daten, Transportsteuerung, TheAudioDB-Cache)          |
| `bridge/web/index.html`   | Seite, die die Karte einbettet                                                       |
| `roon-card.js`            | die Karte selbst, wird in `bridge/web/`, `bridge/` oder im Hauptordner des Repositorys gefunden |

Der Webserver startet nur, wenn `bridge/web.js` existiert und `WEB_PORT` gesetzt ist. Ohne `WEB_PORT` verhält sich die Bridge genau wie bisher.

**Einrichtung:** Diese Zeilen in `/etc/roon-mqtt.env` eintragen und die Bridge neu starten:

```
WEB_PORT=8080
IMAGE_URL_BASE=http://<roon-server-ip>:9330/api/image
```

Im Log erscheint dann `[+] Web page on http://<this-host>:8080/`. Die Seite im Browser öffnen:

```
http://<roon-server-ip>:8080/?zone=Wohnzimmer&options=nosource
```

**URL-Parameter:**

| Parameter  | Beschreibung                                                                                                                                              |
|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `zone`     | Name der Roon-Zone, wie in Roon angezeigt (Gross-/Kleinschreibung egal). Ohne Angabe wird die erste Zone verwendet. Wird die Zone nicht gefunden, listet die Seite die vorhandenen Zonen auf |
| `options`  | Schalter der Karte, durch Kommas getrennt, z. B. `nobuttons,nosource,nostatus` (siehe [Schalter](#schalter-options))                                      |
| `bio_lang` | Sprachreihenfolge der Biografie, z. B. `DE,EN` (siehe [TheAudioDB](#künstlerbilder-und-biografie-von-theaudiodb))                                         |
| `audiodb`  | `0` = den TheAudioDB-Cache dieses Servers nicht verwenden                                                                                                 |
| `img`      | Basis-URL der Roon-Bild-API. Nur nötig, wenn `IMAGE_URL_BASE` nicht gesetzt ist. Standard: `http://<Host der Seite>:9330/api/image`                       |

Für ein Display ohne Touch zum Beispiel: `http://<roon-server-ip>:8080/?zone=Wohnzimmer&options=nobuttons,nosource&bio_lang=DE,EN`.

**TheAudioDB auf der Seite:** Mit `THEAUDIODB_KEY` in der env-Datei zeigt die Seite TheAudioDB-Bilder nach den Roon-Bildern, und ein Tipp auf den Künstlernamen öffnet die Biografie. Die Bridge fragt theaudiodb.com und speichert jede Antwort in `CACHE_DIR`. Jeder Künstler wird also nur einmal abgefragt, egal wie viele Displays die Seite verwenden. Der Cache antwortet auch, wenn der Roon Core nicht läuft. Du kannst ihn direkt testen:

```
curl 'http://<roon-server-ip>:8080/audiodb?artist=Genesis'
```

Die Antwort ist JSON mit `strArtistThumb`, `strBiography...` und weiteren Feldern. `HTTP 503` bedeutet, dass `THEAUDIODB_KEY` nicht gesetzt ist, `HTTP 502`, dass theaudiodb.com nicht geantwortet hat (die nächste Anfrage versucht es erneut).

Screenshots (webserver_X.jpg) sind im ./img directory.

**Kiosk auf einem Raspberry Pi:** Chromium im Kiosk-Modus mit dieser URL starten, zum Beispiel mit `cage -- chromium --kiosk --ozone-platform=wayland "<URL>"`.

> [!WARNING]
> Die Seite hat keinen Passwortschutz. Jeder im Netzwerk kann Wiedergabe und Lautstärke steuern und den TheAudioDB-Cache nutzen (der deinen Schlüssel verwendet). Den Port nicht ins Internet freigeben.

## MQTT-Topics

| Topic                     | Inhalt                                      |
|---------------------------|---------------------------------------------|
| `roon/now_playing/<zone>` | Retained-JSON-Nachricht einer einzelnen Zone |
| `roon/now_playing/status` | Retained-JSON-Status der Bridge             |

Der Zonenname wird in Kleinbuchstaben umgewandelt und alle nicht alphanumerischen Zeichen werden entfernt, daraus entsteht das Topic-Suffix. Beispiel: `Living Room` wird zu `livingroom`.

### Bridge-Status

Die Status-Nachricht enthält einen Statuswert und einen Zeitstempel. Falls verfügbar, enthält sie ausserdem Bridge-Version, Bild-Basis-URL sowie Name und Version des Roon Core. Die Statusnachricht wird periodisch im konfigurierten Heartbeat-Intervall erneuert.

| Status              | Bedeutung                                                         |
|---------------------|-------------------------------------------------------------------|
| `starting`          | Die Bridge ist gestartet, aber noch nicht mit Roon gekoppelt      |
| `pairing_required`  | Nach `PAIR_HINT_MS` noch nicht gekoppelt, obwohl der Core erreichbar ist: die Erweiterung in der Roon-App aktivieren (**Einstellungen → Erweiterungen**). Die Bridge läuft weiter und wartet |
| `online`            | Die Bridge ist mit Roon gekoppelt und kann Zonendaten senden      |
| `roon_disconnected` | Keine Verbindung zum Roon Core (unterbrochen oder nicht erreichbar). Die Bridge läuft weiter und versucht es alle `ROON_RETRY_MS` erneut. Sobald der Core wieder da ist, wechselt der Status von selbst auf `online` |
| `error`             | Ein unerwarteter Fehler ist aufgetreten                           |
| `offline`           | Die Bridge wurde gestoppt oder unerwartet getrennt                |

Bei unerwartetem Verlust der MQTT-Verbindung veröffentlicht der Broker die Last-Will-Nachricht `offline`. Bei einem sauberen Beenden sendet die Bridge den letzten Status selbst, bevor sie sich beendet.

## MQTT-Daten in Home Assistant prüfen

1. **Einstellungen → Geräte & Dienste → MQTT → Konfigurieren** öffnen.
2. `roon/now_playing/#` abonnieren.
3. Wiedergabe starten und die Nachricht deiner Zone ansehen.

Ein gekürztes Beispiel einer Zonen-Nachricht:

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

Die Signalpfad-Werte oben sind Beispiele. Welche Felder tatsächlich vorhanden sind, hängt von den Informationen im Roon-Server-Log ab. Wird kein passender Signalpfad-Block gefunden, ist die Eigenschaft `null`.

## MQTT-Sensoren in Home Assistant

Füge die folgenden Sensoren in `configuration.yaml` oder deiner MQTT-Konfiguration hinzu und passe das Zonen-Topic an dein Setup an:

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

Damit die Home-Assistant-Datenbank nicht durch häufige Updates anwächst, schliesse diese Entitäten bei Bedarf vom Recorder aus:

```
recorder:
  exclude:
    entities:
      - sensor.roon_bridge_status
      - sensor.roon_livingroom_json
```

Nach dem Neuladen der MQTT-Konfiguration unter **Entwicklerwerkzeuge → Zustände** die Sensorattribute öffnen, um die vollständige JSON-Nachricht zu sehen.

---

# Fehlerbehebung

| Problem                                          | Wahrscheinliche Ursache                                                                                                                                                                      |
|--------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| "Custom element doesn't exist: roon-player-card" | die Ressource fehlt, hat den falschen Typ (muss `module` sein) oder der Browser nutzt eine zwischengespeicherte Version. `?v=` erhöhen und neu laden. Mit HACS: Browser hart neu laden       |
| Karte zeigt `Fallback`                           | der Sensor passt nicht zum aktuellen Titel. Prüfen, ob die Bridge läuft und das Sensor-Topic stimmt. `nostale` verwenden, wenn Titel bei Player und Roon unterschiedlich geschrieben sind     |
| Karte zeigt gar keine Daten                      | die Bridge ist nicht installiert oder läuft nicht. HACS installiert nur die Karte, nicht die Bridge                                                                                          |
| Keine Künstlerbilder                             | `roon_url` fehlt oder ist falsch, der Browser erreicht den Roon-Server nicht, oder Home Assistant läuft über HTTPS (siehe Hinweis zu HTTPS)                                                   |
| Keine TheAudioDB-Bilder (kein `tadb` in der Statusanzeige) | weder `audiodb_key` noch `audiodb_url` ist gesetzt, oder `audiodb_images` steht auf `off`. Mit `options: [debug]` das Diagnose-Panel öffnen und auf die Statusanzeige tippen: Die Zeile `audiodb:` zeigt den Modus und den Zustand pro Künstler (`ok`, `ok (unknown)`, `loading`, `error`, `none`). `unknown` heisst, dass TheAudioDB keinen Künstler mit genau diesem Namen kennt |
| Biografie öffnet sich nicht                      | bei einem Tipp passiert nichts: `audiodb_key`/`audiodb_url` fehlt, `nobio` ist gesetzt oder das Display hat kein Touch. Auf den **Namen des Künstlers** in der unteren Leiste tippen. "TheAudioDB not reachable": Schlüssel falsch, Limit erreicht (Test-Schlüssel) oder kein Internetzugang. "No biography available": TheAudioDB hat keinen Text in den Sprachen von `bio_lang` |
| Eigenständige Seite: keine TheAudioDB-Daten      | das Log muss `TheAudioDB cache on /audiodb` zeigen. Steht dort `cache off`, fehlt `THEAUDIODB_KEY` in der env-Datei, die verwendet wird (siehe `Configuration loaded from ...`). Mit `curl 'http://<host>:8080/audiodb?artist=Genesis'` testen (503 = kein Schlüssel, 502 = theaudiodb.com hat nicht geantwortet). Seite nach einem Update von `roon-card.js` oder `index.html` neu laden (hart neu laden) |
| `TheAudioDB cache: ... NOT writable` im Log      | der Dienst-Benutzer kann nicht in `CACHE_DIR` schreiben. Besitzer des Verzeichnisses prüfen (`ls -ld`) und bei systemd-Absicherung `ReadWritePaths=` in der Service-Datei. Bis dahin arbeitet der Cache im Speicher |
| Ruhebild ist defekt                              | `/local/icons/roon-logo.png` existiert nicht. Bei HACS muss diese Datei separat heruntergeladen werden                                                                                       |
| Keine Songtexte                                  | der Titel hat bei LRCLIB keine synchronisierten Texte, der Dienst ist vorübergehend nicht erreichbar (die Karte versucht es nach einer Minute erneut) oder `nosongtext` ist gesetzt           |
| Songtexte sind nicht synchron                    | `lyrics_offset` anpassen. Eine falsch gehende Uhr am Display kann ebenfalls eine Verschiebung von ein bis zwei Sekunden verursachen                                                           |
| Eigenständige Seite bleibt leer                  | `WEB_PORT` fehlt oder `web.js` / `web/index.html` liegen nicht im Bridge-Verzeichnis (das Log muss `Web page on ...` zeigen). Die Bridge ist nicht mit Roon gekoppelt (Status `pairing_required`) oder der Core ist nicht erreichbar (Status `roon_disconnected`). Der Zonenname bei `?zone=` existiert nicht: die Seite listet dann nach einigen Sekunden die vorhandenen Zonen auf |
| Bridge startet nicht                             | `sudo journalctl -u roon-mqtt.service -n 50`. Prüfen, ob die Erweiterung in Roon aktiviert ist und ob die Broker-Einstellungen in `/etc/roon-mqtt.env` stimmen                                |
| Roon-Protokollzeilen (`<- CONTINUE ...`) im Log  | `LOG_LEVEL` steht auf `debug`, oder es läuft eine alte Version der Bridge. Die ersten Zeilen des Logs prüfen (`roon-bridge v...`). Diese Zeilen enthalten Tokens und Zonen-IDs, nicht weitergeben |

# Lizenz

MIT
