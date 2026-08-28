const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const runtimeDir = path.join(root, 'runtime');

function removeModule(source, moduleName) {
  const marker = `__mods["${moduleName}"]=function(module,exports,__req,require){`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${moduleName}`);
  const next = source.indexOf('\n__mods["', start + marker.length);
  assert.ok(next >= 0, `missing module boundary after ${moduleName}`);
  return source.slice(0, start) + source.slice(next + 1);
}

function removeTopLevelFunction(source, functionName) {
  const pattern = new RegExp(`\\nfunction ${functionName}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}\\n`, 'u');
  assert.match(source, pattern, `missing ${functionName}`);
  return source.replace(pattern, '\n');
}

function stripLegacyVenueRubric(source) {
  let next = source;
  next = removeTopLevelFunction(next, 'loadVenueDigestMessageIds');
  next = removeTopLevelFunction(next, 'rememberVenueDigestMessageIds');
  next = next
    .replace(/^.*exports\.loadVenueDigestMessageIds=.*\n/mu, '')
    .replace(/^.*exports\.rememberVenueDigestMessageIds=.*\n/mu, '')
    .replace(/^.*VENUE_D?IGEST.*\n/gimu, '');
  next = removeModule(next, 'src/venues.js');
  next = removeModule(next, 'src/venue-digest.js');
  next = next
    .replace(/^const \{ runVenueDigest \} = __req\("src\/venue-digest\.js"\);\n/mu, '')
    .replace('const ALL=["events","venues","holidays","facts","morning","clients"];', 'const ALL=["events","holidays","facts","morning","clients"];')
    .replace(/^.*Sevkabel\/Brusnitsyn \(venues\).*\n/mu, '')
    .replace(/^\s*await run\("venues",\(\)=>runVenueDigest\(\{dateKey,dryRun\}\)\);\n/mu, '');
  return next;
}

test('emit clean runtime chunks for removal commit', () => {
  const base64 = Array.from({ length: 7 }, (_, index) =>
    fs.readFileSync(path.join(runtimeDir, `chunk${index}.txt`), 'utf8').trim(),
  ).join('');
  const raw = zlib.gunzipSync(Buffer.from(base64, 'base64')).toString('utf8');
  const clean = stripLegacyVenueRubric(raw);
  assert.equal(clean.includes('Севкабель Порт + Брусницын'), false);
  assert.equal(clean.includes('src/venues.js'), false);
  assert.equal(clean.includes('src/venue-digest.js'), false);
  assert.equal(clean.includes('runVenueDigest'), false);
  assert.equal(clean.includes('loadVenueDigestMessageIds'), false);
  assert.equal(clean.includes('rememberVenueDigestMessageIds'), false);

  const encoded = zlib.gzipSync(Buffer.from(clean, 'utf8'), { level: 9, mtime: 0 }).toString('base64');
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += 9000) chunks.push(encoded.slice(offset, offset + 9000));
  console.error(`RUDI_CLEAN_CHUNK_COUNT=${chunks.length}`);
  console.error(`RUDI_CLEAN_CHUNK_SIZES=${chunks.map((value) => value.length).join(',')}`);
  chunks.forEach((value, index) => console.error(`RUDI_CLEAN_CHUNK_${index}_BEGIN\n${value}\nRUDI_CLEAN_CHUNK_${index}_END`));
});
