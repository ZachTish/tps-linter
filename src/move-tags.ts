import { isMap, isSeq, isScalar, parseDocument } from 'yaml';

/** Move only standalone note-tag lines; task/prose/code tags keep their meaning. */
export function moveTagsToFrontmatter(input: string): { output: string; moved: number } {
  const newline = input.includes('\r\n') ? '\r\n' : '\n';
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(input);
  if (/^(?:\uFEFF)?---(?:\r?\n|$)/.test(input) && !match) return { output: input, moved: 0 };
  const doc = parseDocument(match?.[1] || '', { uniqueKeys: true });
  if (doc.errors.length || (doc.contents && !isMap(doc.contents))) return { output: input, moved: 0 };
  const existing = doc.get('tags');
  const rawTags = existing == null ? [] : typeof existing === 'string' ? existing.split(/[,\s]+/).filter(Boolean) : isSeq(existing) ? existing.items.map(item => isScalar(item) ? item.value : null) : null;
  if (!Array.isArray(rawTags) || !rawTags.every((value): value is string => typeof value === 'string')) return { output: input, moved: 0 };
  const tags: string[] = rawTags.map(value => value.replace(/^#/, ''));
  const known = new Set(tags.map(tag => tag.toLowerCase()));
  let fence = '', blocked = false, moved = 0;
  const body = input.slice(match?.[0].length || 0).split(/(?<=\n)/).map(line => {
    const trimmed = line.trim();
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    const fenceMarker = marker?.[1];
    if (fenceMarker) { if (!fence) fence = fenceMarker; else if (fenceMarker[0] === fence[0] && fenceMarker.length >= fence.length) fence = ''; return line; }
    // Avoid interpreting tags inside HTML, comments, math or disabled-rule ranges.
    if (/<!--|%%|^\s*\$\$|^\s*</.test(line)) blocked = true;
    if (fence || blocked || /^[\t ]/.test(line) || !trimmed) return line;
    const tokens = trimmed.split(/\s+/);
    if (!tokens.every(token => /^#[\p{L}\p{N}_/-]+$/u.test(token) && /[\p{L}_/-]/u.test(token.slice(1)))) return line;
    for (const token of tokens) { const tag = token.slice(1); if (!known.has(tag.toLowerCase())) { tags.push(tag); known.add(tag.toLowerCase()); } moved++; }
    return '';
  }).join('');
  if (!moved) return { output: input, moved: 0 };
  doc.set('tags', tags);
  const yaml = doc.toString().replace(/\n/g, newline);
  return { output: `${input.startsWith('\uFEFF') ? '\uFEFF' : ''}---${newline}${yaml}---${newline}${body}`, moved };
}
