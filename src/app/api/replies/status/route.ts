import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAuthorizedSession } from "@/lib/auth-policy";
import { replyPolicy } from "@/lib/replies/policy";

export async function GET() {
  const session = await auth();
  if (!isAuthorizedSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = session?.user?.email?.toLowerCase();
  const policy = replyPolicy(email, "note");
  return NextResponse.json({
    repliesOn: policy.canCompose,
    reason: policy.reason,
  });
}
