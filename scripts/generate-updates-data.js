const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '..', 'RELEASE_NOTES.md'), 'utf8');

function parseReleaseNotes(markdown) {
  const releases = [];
  const rawSections = markdown.split(/\n(?=# MyCinema v)/);
  for (const sec of rawSections) {
    const lines = sec.trim().split('\n');
    const headerMatch = lines[0].match(/^# MyCinema v?([0-9.]+)/i);
    if (!headerMatch) continue;
    const version = 'v' + headerMatch[1];
    
    let summary = '';
    const updates = [];
    let currentCategory = 'General';
    let i = 1;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && !lines[i].startsWith('#') && !lines[i].startsWith('-')) {
      summary = lines[i].trim();
      i++;
    }

    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('### ')) {
        currentCategory = line.replace('### ', '').trim();
      } else if (line.startsWith('- ')) {
        const titleMatch = line.match(/^- \*\*(.*?)\*\*:\s*(.*)$/);
        if (titleMatch) {
          updates.push({
            title: titleMatch[1].trim(),
            description: titleMatch[2].trim(),
            category: currentCategory
          });
        } else {
          updates.push({
            title: line.replace(/^- /, '').replace(/\*\*/g, '').trim(),
            description: '',
            category: currentCategory
          });
        }
      }
    }

    releases.push({ version, summary, updates });
  }
  return releases;
}

const rels = parseReleaseNotes(content);

const code = `// =============================================================================
// MYCINEMA APP UPDATES & CHANGELOG
// =============================================================================
//
// HOW TO ADD A NEW UPDATE:
// Simply add a new release object to the TOP of the APP_UPDATES array below.
//
// Example:
// {
//   version: 'v1.46.0',
//   date: 'November 2026',
//   summary: 'Direct search improvements and playback fixes.',
//   updates: [
//     { title: 'Search Filter', description: 'Added direct search filter.', category: 'Focus Tube' },
//     // OR in simplest string format:
//     // 'Speed Boost: 2x faster queue loading'
//   ]
// },
// =============================================================================

export interface ReleaseUpdateItem {
  title: string
  description?: string
  category?: string
  type?: 'feature' | 'improvement' | 'fix' | 'security' | string
}

export type UpdateInput = string | ReleaseUpdateItem

export interface AppRelease {
  version: string
  date?: string
  summary?: string
  isLatest?: boolean
  updates: UpdateInput[]
}

export function normalizeUpdate(item: UpdateInput, defaultCategory = 'General'): ReleaseUpdateItem {
  if (typeof item === 'string') {
    const colonIdx = item.indexOf(':')
    if (colonIdx > 0 && colonIdx < 60) {
      return {
        title: item.slice(0, colonIdx).trim(),
        description: item.slice(colonIdx + 1).trim(),
        category: defaultCategory
      }
    }
    return {
      title: item.trim(),
      description: '',
      category: defaultCategory
    }
  }
  return item
}

export const APP_UPDATES: AppRelease[] = ${JSON.stringify(rels, null, 2)};
`;

const targetDir = path.join(__dirname, '..', 'src', 'renderer', 'src', 'data');
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(path.join(targetDir, 'updates.ts'), code, 'utf8');
console.log('Successfully created updates.ts with ' + rels.length + ' releases.');
