// Reads CHANGELOG.md for the in-app "What's new" note. Format: "## x.y.z — date" headings, an
// optional intro line, then "- " bullets (continuation lines indented). Anything under a "###"
// subheading (e.g. "### Developer") is skipped, as is Markdown emphasis, code and link syntax.

const plain = (s) => s
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]*)\*\*/g, '$1')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

export function parseChangelog(text) {
  const releases = [];
  let current = null;
  let skipping = false;
  let item = null;
  const flush = () => {
    if (item != null && current) current.items.push(plain(item));
    item = null;
  };
  for (const line of text.split('\n')) {
    const heading = line.match(/^## +(\d+(?:\.\d+)*)\s*(?:[—–-]\s*(\S+))?/);
    if (heading) {
      flush();
      current = { version: heading[1], date: heading[2] ?? '', intro: '', items: [] };
      releases.push(current);
      skipping = false;
    } else if (/^#{3,} /.test(line)) {
      flush();
      skipping = true;
    } else if (!current || skipping) {
      continue;
    } else if (/^- /.test(line)) {
      flush();
      item = line.slice(2);
    } else if (item != null && /^\s+\S/.test(line)) {
      item += ` ${line.trim()}`;
    } else if (line.trim() && !line.startsWith('#')) {
      flush();
      if (!current.items.length) current.intro = plain(`${current.intro} ${line}`);
    } else {
      flush();
    }
  }
  flush();
  return releases;
}

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// Releases after `seen` up to and including `current`, newest first; with nothing seen, every
// release up to `current` (a catch-up for someone who used the app before it tracked versions).
export function notesSince(releases, seen, current, max = Infinity) {
  return releases
    .filter((r) => compareVersions(r.version, current) <= 0 && (seen == null || compareVersions(r.version, seen) > 0))
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, max);
}

// Releases up to and including `version`, newest first.
export const releasesUpTo = (releases, version) =>
  releases.filter((r) => compareVersions(r.version, version) <= 0).sort((a, b) => compareVersions(b.version, a.version));
