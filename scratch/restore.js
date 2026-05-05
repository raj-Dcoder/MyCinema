const fs = require('fs');

const oldCode = fs.readFileSync('scratch/old_index.ts', 'utf8');
const currCode = fs.readFileSync('src/main/index.ts', 'utf8');

const startStr = "ipcMain.handle('search-torrent-sources', async (_, title: string, year: string, mediaType: string, tmdbId: number) => {";
const endStr = "// ─── IPC: Start Torrent Download";

const oldStartIdx = oldCode.indexOf(startStr);
const oldEndIdx = oldCode.indexOf(endStr);

const currStartIdx = currCode.indexOf(startStr);
const currEndIdx = currCode.indexOf(endStr);

if (oldStartIdx === -1 || oldEndIdx === -1 || currStartIdx === -1 || currEndIdx === -1) {
    console.error('Could not find function boundaries');
    process.exit(1);
}

const originalFunction = oldCode.substring(oldStartIdx, oldEndIdx);
const newCode = currCode.substring(0, currStartIdx) + originalFunction + currCode.substring(currEndIdx);

fs.writeFileSync('src/main/index.ts', newCode);
console.log('Successfully restored search-torrent-sources to sequential version');
