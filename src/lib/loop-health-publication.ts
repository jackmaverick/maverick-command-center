const SPECIALIZED_LOOP_IDS = new Set([
  "production-communication-closed-loop",
  "gaf_measurements_to_jobnimbus",
  "invoice-due-date-alignment-loop",
]);

export function shouldPublishGenericLoopSnapshot(loopId: string): boolean {
  return !SPECIALIZED_LOOP_IDS.has(loopId);
}
