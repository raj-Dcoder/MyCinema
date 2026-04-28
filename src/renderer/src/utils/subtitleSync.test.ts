import assert from 'node:assert/strict'

import {
  SUBTITLE_SYNC_MAX_MS,
  SUBTITLE_SYNC_MIN_MS,
  clampSubtitleOffsetMs,
  createSubtitleSyncStorageKey,
  findCueIndexAtTime,
  formatSubtitleOffsetMs,
  parseStoredSubtitleOffsetMs,
  resolveSubtitleCue,
  type SubCue
} from './subtitleSync'

const cues: SubCue[] = [
  { start: 1, end: 2.2, text: 'One' },
  { start: 3.5, end: 5, text: 'Two' },
  { start: 7, end: 8, text: 'Three' }
]

assert.equal(clampSubtitleOffsetMs(Number.NaN), 0)
assert.equal(clampSubtitleOffsetMs(SUBTITLE_SYNC_MAX_MS + 500), SUBTITLE_SYNC_MAX_MS)
assert.equal(clampSubtitleOffsetMs(SUBTITLE_SYNC_MIN_MS - 500), SUBTITLE_SYNC_MIN_MS)

assert.equal(formatSubtitleOffsetMs(0), '0s')
assert.equal(formatSubtitleOffsetMs(250), '+0.25s')
assert.equal(formatSubtitleOffsetMs(-500), '-0.5s')
assert.equal(formatSubtitleOffsetMs(2_000), '+2s')

const embedded = createSubtitleSyncStorageKey('C:/movie.mkv', 'embedded:2')
const external = createSubtitleSyncStorageKey('C:/movie.mkv', 'external:C:/movie.en.srt')
assert.notEqual(embedded, external)

assert.equal(parseStoredSubtitleOffsetMs(null), 0)
assert.equal(parseStoredSubtitleOffsetMs('bad-value'), 0)
assert.equal(parseStoredSubtitleOffsetMs('750'), 750)

assert.equal(findCueIndexAtTime(cues, 1.4), 0)
assert.equal(findCueIndexAtTime(cues, 1.6, 0), 0)
assert.equal(findCueIndexAtTime(cues, 3.8, 0), 1)
assert.equal(findCueIndexAtTime(cues, 6.4, 1), -1)

assert.equal(resolveSubtitleCue(cues, 1.2, 0).cue?.text, 'One')
assert.equal(resolveSubtitleCue(cues, 1.2, -250).cue?.text, 'One')
assert.equal(resolveSubtitleCue(cues, 1.2, 500).cue?.text, undefined)
assert.equal(resolveSubtitleCue(cues, 3.3, -250).cue?.text, 'Two')
assert.equal(resolveSubtitleCue(cues, 5.2, 250).cue?.text, 'Two')

console.log('subtitleSync assertions passed')
