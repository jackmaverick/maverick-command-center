import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAuthorizedSession } from "@/lib/auth-policy";
import { createReply, ReplySafetyError } from "@/lib/replies/service";
import { replyRequestSchema } from "@/lib/replies/validation";
import { getSafeServerError, logServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!isAuthorizedSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actorEmail = session?.user?.email?.toLowerCase();
  if (!actorEmail) {
    return NextResponse.json({ error: "Email identity required" }, { status: 403 });
  }
  const parsed = replyRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reply", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const message = await createReply(parsed.data, actorEmail);
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof ReplySafetyError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    logServerError("[Replies] Send failed", error);
    const safe = getSafeServerError(error);
    return NextResponse.json(
      { error: safe.message, code: safe.code ?? "SEND_FAILED" },
      { status: 502 }
    );
  }
}
