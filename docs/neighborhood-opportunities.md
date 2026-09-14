# Neighborhood opportunities and yard signs

The Direct Mail page includes a Neighborhoods & signs tab. Its separate read-only
endpoint validates an allowlisted projection produced by the Direct Mail
repository's `direct_mail_neighborhood_refresh` module. It shows insurance roofs
regardless of acquisition source, map/audience decisions, separate postal promises
and actual evidence, conditional sign timing, and provisional/reconciled profit.

## Data contract

`neighborhoodSchema` validates the optional `neighborhoodReview` field of the
existing `direct_mail_weekly_reviews.payload`. No new table, public write endpoint
or sender is introduced. Recipient names, street addresses, field-owner identities,
photo paths and email bodies stay in the private Campaign Files runtime. Job IDs
and numbers allow navigation to the existing CRM. Evidence older than 24 hours is
visibly stale; preparation and sign claims remain unavailable until refreshed.

Prepare a reviewed full weekly payload, preserving every existing costReview,
cashReview, jobCostHold and attribution field:

```sh
npx tsx scripts/attach-direct-mail-neighborhoods.ts \
  "$WEEKLY_JSON" "$NEIGHBORHOOD_JSON" "$PRIVATE_OUTPUT_JSON"
npx tsx scripts/publish-direct-mail-weekly.ts "$PRIVATE_OUTPUT_JSON"
```

The first command writes a new local file exclusively. The second validates it.
The existing publisher's `--apply` remains the explicit database publication
step after coordinated production rollout. The old weekly evidence date is not
changed to the neighborhood refresh date. Preserve both when regenerating weekly
reviews. Concurrent reviewers must read the latest approved weekly snapshot before
preparing an extension, so newer financial review data is not dropped.

For local development only, `DIRECT_MAIL_NEIGHBORHOOD_REVIEW_PATH` can point to the
private `dashboard.json`; the read-only route ignores that variable in production.
No recipient export is exposed, and the same strict schema applies.

## Validation and current limits

Use schema tests, TypeScript checking, scoped ESLint, the production build and an
isolated-browser check. Verify `/api/direct-mail/neighborhoods` against the local
source hash/date/counts after publication. A successful local page is not a live
deployment or scheduled-run receipt. The old JobNimbus Order Direct Mail rule is
separate and must be verified before claiming it has stopped creating tasks.

The initial local pilot identifies Carriage Crossing, Highlands of Kensington,
Terrybrook Farms, Hamptonshire and Persimmon Pointe. Historical counts are list/PDF
associations, not current eligible counts or verified neighborhood-wide coverage.
Keep incomplete evidence explicit, and never treat a high margin with missing
major costs as a confirmed profitable example. No mail, spend, field assignment or
customer messages are performed by this tab.

## September 14 rollout

The production tab and both API payloads were verified against the reviewed local
projection after PR #22 deployed. The existing direct-mail heartbeat now owns
weekday 8 a.m. Chicago neighborhood reviews and retains its complete Friday
financial/creative review. Configuration is verified; its first scheduled run is
still pending. The daily queue LaunchAgent and legacy JobNimbus rule are unchanged.

The snapshot publisher compares validated payloads structurally, because PostgreSQL
JSONB may reorder object keys. It still requires every value and array order to
match. Retrying the same payload uses the same immutable ID and cannot add a
duplicate row. Dated deployment, publication and automation receipts remain in
the private neighborhood runtime.
