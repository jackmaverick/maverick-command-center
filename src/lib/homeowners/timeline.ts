export type MatchType = "direct" | "job" | "phone_fallback" | "email_fallback";

export interface TimelineEntry {
  id: string;
  source: string;
  channel: string;
  direction: string | null;
  line: string | null;
  occurredAt: string;
  preview: string;
  body: string | null;
  matchType: MatchType;
}

export function mergeTimelineEntries(
  sources: TimelineEntry[][],
  limit = 100
): TimelineEntry[] {
  const unique = new Map<string, TimelineEntry>();
  for (const entry of sources.flat()) {
    const key = `${entry.source}:${entry.id}`;
    if (!unique.has(key)) unique.set(key, entry);
  }

  return [...unique.values()]
    .sort((left, right) => {
      const dateOrder =
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime();
      return dateOrder || right.id.localeCompare(left.id);
    })
    .slice(0, limit);
}
