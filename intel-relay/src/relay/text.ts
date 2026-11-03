export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 1) return '…'.slice(0, Math.max(0, limit));
  let end = limit - 1;
  if (/[\uD800-\uDBFF]/.test(text[end - 1] ?? '')) end--;
  return `${text.slice(0, end)}…`;
}
export function splitContent(content: string, limit = 2000): string[] {
  if (!Number.isInteger(limit) || limit < 32) throw new Error('Chunk limit must be at least 32.');
  if (!content) return [''];
  const parts: string[] = [];
  let remaining = content, fence: string | null = null;
  while (remaining.length) {
    const prefix = fence === null ? '' : `\`\`\`${fence}\n`;
    const capacity = limit - prefix.length - 4;
    let end = Math.min(capacity, remaining.length);
    if (end < remaining.length) {
      const newline = remaining.lastIndexOf('\n', end - 1);
      const space = remaining.lastIndexOf(' ', end - 1);
      if (newline > capacity / 2) end = newline + 1;
      else if (space > capacity / 2) end = space + 1;
      if (/[\uD800-\uDBFF]/.test(remaining[end - 1] ?? '')) end--;
      // Avoid cutting through a fence marker.
      if (remaining[end - 1] === '`' && remaining[end] === '`') {
        const marker = remaining.lastIndexOf('```', end - 1);
        if (marker > 0 && marker + 3 > end) end = marker;
      }
    }
    const chunk = remaining.slice(0, end);
    for (const match of chunk.matchAll(/```([^\n`]*)/g)) fence = fence === null ? (match[1] ?? '').slice(0, 20) : null;
    remaining = remaining.slice(end);
    const suffix = fence === null ? '' : '\n```';
    parts.push(prefix + chunk + suffix);
  }
  return parts;
}
