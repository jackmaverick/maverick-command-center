export function isCronAuthorized(
  headers: Pick<Headers, "get">,
  secret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!secret) return false;
  return (
    headers.get("authorization") === `Bearer ${secret}` ||
    headers.get("x-cron-secret") === secret
  );
}
