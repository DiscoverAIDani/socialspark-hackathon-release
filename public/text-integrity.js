/** Local-only inspection of characters that can conceal parts of a post.
 * All warnings are advisory. Neither detection nor removal runs on a server.
 * Preserve emoji ZWJ sequences such as 👩‍💻; some invisible characters are legitimate.
 */
const descriptions = new Map([
  [0x200B, 'Zero-width space'], [0x200C, 'Zero-width non-joiner'],
  [0x200D, 'Zero-width joiner'], [0x200E, 'Left-to-right mark'],
  [0x200F, 'Right-to-left mark'], [0x202A, 'Left-to-right embedding'],
  [0x202B, 'Right-to-left embedding'], [0x202C, 'Pop directional formatting'],
  [0x202D, 'Left-to-right override'], [0x202E, 'Right-to-left override'],
  [0x2060, 'Word joiner'], [0x2061, 'Function application'],
  [0x2062, 'Invisible times'], [0x2063, 'Invisible separator'],
  [0x2064, 'Invisible plus'], [0x2066, 'Left-to-right isolate'],
  [0x2067, 'Right-to-left isolate'], [0x2068, 'First-strong isolate'],
  [0x2069, 'Pop directional isolate'], [0xFEFF, 'Zero-width no-break space']
]);
const flaggedPattern = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu;
const emoji = /\p{Extended_Pictographic}/u;

function legitimateEmojiJoiner(text, at) {
  const prefix = Array.from(text.slice(0, at));
  const suffix = Array.from(text.slice(at + 1));
  // Variation selector (emoji presentation) and skin tones may precede the joiner.
  while (prefix.length && /^[\uFE0E\uFE0F\p{Emoji_Modifier}]$/u.test(prefix.at(-1))) prefix.pop();
  while (suffix.length && /^[\uFE0E\uFE0F]$/u.test(suffix[0])) suffix.shift();
  return emoji.test(prefix.at(-1) ?? '') && emoji.test(suffix[0] ?? '');
}

export function scanHiddenCharacters(text) {
  if (typeof text !== 'string') throw new TypeError('Post must be text');
  const found = [];
  flaggedPattern.lastIndex = 0;
  for (const match of text.matchAll(flaggedPattern)) {
    const code = match[0].codePointAt(0);
    if (code === 0x200D && legitimateEmojiJoiner(text, match.index)) continue;
    const codePoint = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    found.push({
      index: match.index,
      position: Array.from(text.slice(0, match.index)).length + 1,
      codePoint,
      label: descriptions.get(code) ?? 'Invisible character',
      length: match[0].length
    });
  }
  return found;
}

export function revealHiddenCharacters(text, findings = scanHiddenCharacters(text)) {
  let cursor = 0;
  let visible = '';
  for (const item of findings) {
    visible += text.slice(cursor, item.index) + `[${item.codePoint}: ${item.label}]`;
    cursor = item.index + item.length;
  }
  return visible + text.slice(cursor);
}

export function removeFlaggedHiddenCharacters(text) {
  const findings = scanHiddenCharacters(text);
  let cursor = 0;
  let cleaned = '';
  for (const item of findings) {
    cleaned += text.slice(cursor, item.index);
    cursor = item.index + item.length;
  }
  return cleaned + text.slice(cursor);
}
