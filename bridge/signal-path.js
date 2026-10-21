const fs = require('fs');

const LOG_PATH =
  process.env.SIGNAL_PATH_LOG ||
  '/var/roon/RoonServer/Logs/RoonServer_log.txt';

let cachedSignature = null;
let cachedBlocks = [];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseBlock(block) {
  const match = (pattern) => block.match(pattern);

  const quality = match(/SignalPath Quality\s*=\s*(\S+)/);
  const source = match(
    /Source Format=(\S+)\s+(\d+)\/(\d+)\/(\d+)(?:\s+BitRate=(\d+))?\s+Quality=(\S+)/
  );
  const dsp = match(
    /DSP Subtype=(\S+).*?FromSampleRate=(\d+)\s+ToSampleRate=(\d+)\s+Quality=(\S+)/
  );
  const output = match(
    /Output OutputType=(\S+)\s+Quality=(\S+)(?:\s+SubType=(\S*))?(?:\s+Model=(\S*))?/
  );
  const normalization = match(
    /VolumeNormali(?:[sz]ation|ation)\s+GainDb=([-0-9.eE+]+)\s+Quality=(\S+)/
  );
  const digitalVolume = match(/DigitalVolume .*?GainDb=([-\d.]+)/);
  const upgrade = match(
    /UpgradeBitDepth FromBitsPerSample=(\d+) ToBitsPerSample=(\d+)/
  );
  const truncate = match(
    /Truncate FromBitsPerSample=(\d+) ToBitsPerSample=(\d+)/
  );
  const raat = match(/Raat Device=(.+)/);

  return {
    quality: quality?.[1] || 'Unknown',
    source_format: source?.[1] || null,
    sample_rate: source ? Number(source[2]) : null,
    bit_depth: source ? Number(source[3]) : null,
    channels: source ? Number(source[4]) : null,
    bitrate: source?.[5] ? Number(source[5]) : null,
    source_quality: source?.[6] || null,
    lossless: source ? source[6] === 'Lossless' : null,

    dsp: dsp
      ? {
          name: dsp[1],
          from_sample_rate: Number(dsp[2]),
          to_sample_rate: Number(dsp[3]),
          quality: dsp[4]
        }
      : null,

    volume_normalization: normalization
      ? {
          gain_db: Number(normalization[1]),
          quality: normalization[2]
        }
      : null,

    digital_volume_db: digitalVolume
      ? Number(digitalVolume[1])
      : null,

    bit_depth_processing: {
      upgrade: upgrade
        ? { from: Number(upgrade[1]), to: Number(upgrade[2]) }
        : null,
      truncate: truncate
        ? { from: Number(truncate[1]), to: Number(truncate[2]) }
        : null
    },

    raat_device: raat?.[1]?.trim() || null,

    output: output
      ? {
          type: output[1],
          quality: output[2],
          subtype: output[3] || null,
          model: output[4] || null
        }
      : null,

    raw: block.trim()
  };
}

function loadBlocks() {
  try {
    const stat = fs.statSync(LOG_PATH);
    const signature = `${stat.size}:${stat.mtimeMs}`;

    if (signature === cachedSignature) return cachedBlocks;

    const text = fs.readFileSync(LOG_PATH, 'utf8');

    const starts = [
      ...text.matchAll(/--\[ SignalPath \]--+[^\r\n]*/g)
    ];

    const blocks = [];

    for (let i = 0; i < starts.length; i++) {
      const start = starts[i].index;
      const nextStart = starts[i + 1]?.index ?? text.length;
      const section = text.slice(start, nextStart);

      const separator = section.search(/\r?\n-{10,}\s*(?:\r?\n|$)/);
      const block = separator >= 0
        ? section.slice(0, separator)
        : section;

      // Nur den Kontext seit dem vorherigen Signal-Path-Block betrachten.
      const previousEnd = i > 0
        ? starts[i - 1].index
        : Math.max(0, start - 3000);

      const context = text.slice(previousEnd, start);
      const zoneMatches = [
        ...context.matchAll(/\[zone ([^\]]+)\]/gi)
      ];

      blocks.push({
        data: parseBlock(block),
        contextZone: zoneMatches.length
          ? zoneMatches[zoneMatches.length - 1][1].trim()
          : null
      });
    }

    cachedSignature = signature;
    cachedBlocks = blocks;
    return blocks;
  } catch (err) {
    console.error('[SignalPath]', err.message);
    return [];
  }
}

function readSignalPathForZone(zone) {
  const zoneName = normalize(zone.display_name);

  const outputNames = (zone.outputs || [])
    .map((output) => normalize(output.display_name))
    .filter((name) => name.length >= 5);

  const blocks = loadBlocks();

  // Neueste passende Blöcke zuerst untersuchen.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const entry = blocks[i];
    const data = entry.data;

    const raw = normalize(data.raw);
    const contextZone = normalize(entry.contextZone);

    // Exakte bzw. normalisierte Zonenzuordnung aus dem Log-Kontext.
    if (zoneName && contextZone === zoneName) {
      return { ...data, matched_by: 'log_context' };
    }

    // Gerätekennungen im Signal Path mit Zonenname und Outputs vergleichen.
    const identifiers = [
      zoneName,
      ...outputNames
    ].filter((name) => name.length >= 5);

    if (identifiers.some((name) => raw.includes(name))) {
      return { ...data, matched_by: 'device_name' };
    }
  }

  return null;
}

module.exports = { readSignalPathForZone };
