// Research-only ATX scanner. Not imported by production, not a Markdown parser.
// Recognizes top-level ATX headings and fenced code; Setext/HTML/container headings
// are unsupported. All offsets address only the exact supplied string.
export function markdownHeadings(markdown) {
  const headings = [];
  let offset = 0, fence;
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)\r?$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2].trim()) fence = undefined;
    } else if (marker && (marker[1][0] !== '`' || !marker[2].includes('`'))) {
      fence = { char: marker[1][0], size: marker[1].length };
    } else {
      const heading = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)\r?$/);
      if (heading) headings.push({ level: heading[1].length,
        title: (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim(), offset });
    }
    offset += line.length + 1;
  }
  return headings;
}
export function headingNavigation(headings) {
  // Labels only, not generated slugs/selectors. This deliberately handles simple
  // inline links, not all nested Markdown; source titles and body remain intact.
  return headings.map((heading, index) => `${index + 1}. ${'#'.repeat(heading.level)} ${heading.title.replace(/\[([^\]\n]+)\]\([^\)\n]*\)/g, '$1')}`).join('\n');
}
export function sectionFromSameText(markdown, headings, index) {
  const heading = headings[index];
  if (!heading) return null;
  const next = headings.slice(index + 1).find(row => row.level <= heading.level);
  return markdown.slice(heading.offset, next?.offset ?? markdown.length);
}
