export type WritingStyleReference = {
  name: string;
  reference: string;
};

function normalizeStyleName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Extract complete individual style blocks from the persisted research library. */
export function extractWritingStyleReferences(source: unknown): WritingStyleReference[] {
  const text = String(source || "").trim();
  const libraryHeading = /(?:^|\n)##\s*爆款正文文风洞察\s*\n?/.exec(text);
  if (!libraryHeading || libraryHeading.index === undefined) return [];

  const afterHeading = text.slice(libraryHeading.index + libraryHeading[0].length);
  const nextSection = afterHeading.search(/\n##\s+[^#]/);
  const library = (nextSection >= 0 ? afterHeading.slice(0, nextSection) : afterHeading).trim();
  const headings = [...library.matchAll(/(?:^|\n)###\s*文风：\s*(.+?)\s*\n/g)];

  return headings.map((heading, index) => {
    const start = (heading.index || 0) + heading[0].length;
    const end = index + 1 < headings.length ? (headings[index + 1].index || library.length) : library.length;
    const name = normalizeStyleName(heading[1]);
    const reference = `### 文风：${name}\n${library.slice(start, end).trim()}`.trim();
    return { name, reference };
  }).filter((style) => style.name && style.reference);
}

export function findWritingStyleReference(source: unknown, name: string) {
  const expected = normalizeStyleName(name);
  return extractWritingStyleReferences(source).find((style) => normalizeStyleName(style.name) === expected);
}
