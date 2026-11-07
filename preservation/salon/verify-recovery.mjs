import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const recovery = path.join(root, 'recovery');
const sha256 = b => createHash('sha256').update(b).digest('hex');
// Check both batches independently; the base check still requires the full CSV inventory.
execFileSync(process.execPath, [path.join(root, 'verify.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'verify.mjs'), path.join(recovery, 'captures'), path.join(recovery, 'sources.json')], { stdio: 'inherit' });
const probes = JSON.parse(await readFile(path.join(recovery, 'probes.json')));
for (const probe of probes) {
  if (!probe.path) continue; // Failure receipts are evidence of a failed request, not saved bytes.
  const bytes = await readFile(path.join(recovery, probe.path));
  if (bytes.length !== probe.bytes || sha256(bytes) !== probe.sha256) throw new Error(`Evidence mismatch: ${probe.path}`);
  if (probe.truncated || bytes.length >= 4_000_000) throw new Error(`Truncated discovery response: ${probe.path}`);
}
const receipt = JSON.parse(await readFile(path.join(recovery, 'media-receipt.json')));
const mediaPath = path.join(recovery, receipt.path);
const bytes = await readFile(mediaPath);
if (bytes.length !== receipt.bytes || sha256(bytes) !== receipt.sha256) throw new Error('Audio fixity mismatch (use git lfs pull if this is a pointer)');
const archivedPage = await readFile(path.join(recovery, receipt.episodeMetadataSource), 'utf8');
const marker = 'window.__PRELOADED_STATE__ =';
const jsonStart = archivedPage.indexOf(marker) + marker.length;
if (jsonStart < marker.length) throw new Error('Missing archived episode metadata');
// Extract one JSON object without executing any archived JavaScript or trailing statements.
const start = archivedPage.indexOf('{', jsonStart);
let end = start, depth = 0, quoted = false, escaped = false;
for (; end < archivedPage.length; end++) {
  const c = archivedPage[end];
  if (quoted) {
    if (escaped) escaped = false;
    else if (c === '\\') escaped = true;
    else if (c === '"') quoted = false;
  } else if (c === '"') quoted = true;
  else if (c === '{') depth++;
  else if (c === '}' && --depth === 0) { end++; break; }
}
const archivedState = JSON.parse(archivedPage.slice(start, end));
const episode = archivedState.program.episodesPreview.find(e => e.encodedId === receipt.embeddedEpisodeId);
if (!episode || episode.enclosureUrl !== receipt.originalEnclosureUrl) throw new Error('Archived enclosure does not match retained audio provenance');
const salonPage = await readFile(path.join(root, 'captures/2017-09-14-what-are-journalists-for-in-the-age-of-trump.source.html'), 'utf8');
if (!salonPage.includes(receipt.embeddedEpisodeId)) throw new Error('Salon iframe episode identity mismatch');
const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags=title,artist', '-of', 'json', mediaPath], { encoding: 'utf8' }));
if (Math.abs(Number(metadata.format.duration) - receipt.verification.expectedDurationSecondsFromArchivedMetadata) > 2) throw new Error('Audio duration does not match archived episode');
if (metadata.format.tags.title !== 'Jay Rosen') throw new Error('Audio title tag mismatch');
execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', mediaPath, '-f', 'null', '-'], { stdio: 'inherit' });
console.log(`Recovery OK: ${probes.length} request receipts; all 11 article copies; full audio decode (${metadata.format.duration} seconds)`);
