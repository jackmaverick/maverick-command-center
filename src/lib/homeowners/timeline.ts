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

export interface TimelineCursor {
  occurredAt: string;
  source: string;
  id: string;
}

export function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTimelineCursor(value: string): TimelineCursor | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<TimelineCursor>;
    if (
      typeof decoded.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(decoded.occurredAt)) ||
      typeof decoded.source !== "string" ||
      !decoded.source ||
      typeof decoded.id !== "string" ||
      !decoded.id
    ) {
      return null;
    }
    return {
      occurredAt: new Date(decoded.occurredAt).toISOString(),
      source: decoded.source,
      id: decoded.id,
    };
  } catch {
    return null;
  }
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
