import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAuthorizedSession } from "@/lib/auth-policy";
import { repliesAllowedEmails } from "@/lib/replies/policy";
import { cancelQueuedMessage } from "@/lib/replies/repository";
import { ReplySafetyError, retryReply } from "@/lib/replies/service";
import { logServerError } from "@/lib/server-error";

async function actorEmail() {
  const session = await auth();
  if (!isAuthorizedSession(session)) return null;
  const email = session?.user?.email?.toLowerCase() ?? null;
  return email && repliesAllowedEmails().has(email) ? email : null;
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await actorEmail();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const message = await cancelQueuedMessage(id, actor);
  if (!message) {
    return NextResponse.json(
      { error: "Queued reply not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ message });
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await actorEmail();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    return NextResponse.json({ message: await retryReply(id, actor) });
  } catch (error) {
    if (error instanceof ReplySafetyError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    logServerError("[Replies] Retry failed", error);
    return NextResponse.json({ error: "Retry failed" }, { status: 502 });
  }
}
