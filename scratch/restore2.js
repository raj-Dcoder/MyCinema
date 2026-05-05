const fs = require('fs');
const code = fs.readFileSync('scratch/old_index.ts', 'utf8');
const start = code.indexOf("ipcMain.handle('search-torrent-sources'");
const end = code.indexOf("async function startWebTorrent");
const originalFunc = code.substring(start, end);
fs.writeFileSync('scratch/original_func.ts', originalFunc);
console.log('done');
