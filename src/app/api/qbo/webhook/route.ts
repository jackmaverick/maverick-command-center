import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runIncrementalQboSync } from "@/lib/qbo-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function timingSafeBase64Equal(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyIntuitSignature(rawBody: string, signature: string | null): boolean {
  const verifierToken = process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
  if (!verifierToken) {
    console.warn("[QBO Webhook] QBO_WEBHOOK_VERIFIER_TOKEN not set; rejecting webhook");
    return false;
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", verifierToken)
    .update(rawBody)
    .digest("base64");

  return timingSafeBase64Equal(signature, expected);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("intuit-signature");

  if (!verifyIntuitSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let eventCount = 0;
  try {
    const payload = JSON.parse(rawBody) as {
      eventNotifications?: Array<{ dataChangeEvent?: { entities?: unknown[] } }>;
    };
    eventCount = payload.eventNotifications?.reduce(
      (count, notification) => count + (notification.dataChangeEvent?.entities?.length ?? 0),
      0
    ) ?? 0;
  } catch {
    // Signature was valid. Still run sync, but don't trust the body shape.
  }

  try {
    const result = await runIncrementalQboSync(45_000);
    return NextResponse.json({ success: true, source: "qbo-webhook", eventCount, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Webhook] Sync error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
