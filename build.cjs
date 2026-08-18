const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CHUNK_COUNT = 7;
const EXPECTED_SIZES = [9000, 9000, 9000, 9000, 9000, 9000, 7364];
const runtimeDir = path.join(__dirname, 'runtime');
const outputPath = path.join(runtimeDir, 'generated-runtime.cjs');

function buildRuntime() {
  const parts = [];

  for (let index = 0; index < CHUNK_COUNT; index += 1) {
    const filePath = path.join(runtimeDir, `chunk${index}.txt`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing RUDI runtime chunk: chunk${index}.txt`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const size = Buffer.byteLength(raw, 'utf8');
    if (size !== EXPECTED_SIZES[index]) {
      throw new Error(`Unexpected size for chunk${index}.txt: ${size}, expected ${EXPECTED_SIZES[index]}`);
    }

    parts.push(raw.trim());
  }

  const compressed = Buffer.from(parts.join(''), 'base64');
  const code = zlib.gunzipSync(compressed);
  fs.writeFileSync(outputPath, code);
  return { outputPath, bytes: code.length };
}

if (require.main === module) {
  const result = buildRuntime();
  console.log(`RUDI runtime built locally: ${result.bytes} bytes`);
}

module.exports = { buildRuntime, CHUNK_COUNT, EXPECTED_SIZES };
