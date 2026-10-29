const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function cleanDisplayText(value: string | null | undefined): string {
  if (!value) return "";
  const withoutTags = value.replace(/<[^>]*>/g, " ");
  return withoutTags
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
      (_match, entity: string) => {
        const normalized = entity.toLowerCase();
        if (normalized.startsWith("#x")) {
          return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
        }
        if (normalized.startsWith("#")) {
          return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
        }
        return NAMED_ENTITIES[normalized] ?? _match;
      }
    )
    .replace(/\s+/g, " ")
    .trim();
}
