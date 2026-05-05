const fs = require('fs');
const curr = fs.readFileSync('src/main/index.ts', 'utf8');
const originalFunc = fs.readFileSync('scratch/original_func.ts', 'utf8');

const currStart = curr.indexOf("ipcMain.handle('search-torrent-sources'");
const currEnd = curr.indexOf("async function startWebTorrent");

if (currStart === -1 || currEnd === -1) { console.error('not found'); process.exit(1); }

// Remove the existing "// ─── IPC: Start Torrent Download" comment and extra newlines before startWebTorrent
const before = curr.substring(0, currStart);
const after = curr.substring(currEnd);

// originalFunc ends with the "// ─── IPC: Start Torrent Download ─────────────────────────────────────────────" comment already if it was in the source, wait, let's check.
// Actually originalFunc was extracted up to "async function startWebTorrent", so it INCLUDES the comment.
const newCode = before + originalFunc + after;

fs.writeFileSync('src/main/index.ts', newCode);
console.log('done 3');
