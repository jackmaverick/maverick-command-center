import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { ReplyChannel } from "./types";

export const REPLIES_TIME_ZONE = "America/Chicago";
const SEND_START_HOUR = 8;
const SEND_END_HOUR = 19;

export function repliesEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REPLIES_ENABLED?.trim().toLowerCase() === "true";
}

export function repliesSendConfirmed(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REPLIES_SEND_CONFIRMED?.trim().toLowerCase() === "true";
}

export function repliesAllowedEmails(
  env: Record<string, string | undefined> = process.env
): Set<string> {
  return new Set(
    (env.REPLIES_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function canUserReply(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(
    email &&
      repliesEnabled(env) &&
      repliesAllowedEmails(env).has(email.trim().toLowerCase())
  );
}

export function isWithinReplyHours(
  now: Date,
  channel: ReplyChannel
): boolean {
  if (channel === "note") return true;
  const hour = Number(formatInTimeZone(now, REPLIES_TIME_ZONE, "H"));
  return hour >= SEND_START_HOUR && hour < SEND_END_HOUR;
}

export function nextAllowedReplyTime(now: Date): Date {
  const date = formatInTimeZone(now, REPLIES_TIME_ZONE, "yyyy-MM-dd");
  const hour = Number(formatInTimeZone(now, REPLIES_TIME_ZONE, "H"));
  const targetDate =
    hour < SEND_START_HOUR
      ? date
      : formatInTimeZone(
          new Date(now.getTime() + 24 * 60 * 60 * 1000),
          REPLIES_TIME_ZONE,
          "yyyy-MM-dd"
        );
  return fromZonedTime(
    `${targetDate} ${String(SEND_START_HOUR).padStart(2, "0")}:00:00`,
    REPLIES_TIME_ZONE
  );
}

export function replyPolicy(
  email: string | null | undefined,
  channel: ReplyChannel,
  now = new Date(),
  env: Record<string, string | undefined> = process.env
) {
  const enabled = repliesEnabled(env);
  const allowed = Boolean(
    email && repliesAllowedEmails(env).has(email.trim().toLowerCase())
  );
  const sendConfirmed = repliesSendConfirmed(env);
  const withinHours = isWithinReplyHours(now, channel);
  return {
    enabled,
    allowed,
    sendConfirmed,
    canCompose: enabled && allowed,
    sendNow: enabled && allowed && sendConfirmed && withinHours,
    queueFor: withinHours ? null : nextAllowedReplyTime(now).toISOString(),
    reason: !enabled
      ? "Replies are disabled"
      : !allowed
        ? "Your account is not allowed to send replies"
        : !sendConfirmed
          ? "Live send awaits Jack confirmation"
        : null,
  };
}
