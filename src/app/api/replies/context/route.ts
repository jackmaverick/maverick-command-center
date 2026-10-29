import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAuthorizedSession } from "@/lib/auth-policy";
import { resolveEmailContext, resolveTextContext } from "@/lib/replies/context";
import { getDrafts, listContactOutbound } from "@/lib/replies/repository";
import { replyPolicy } from "@/lib/replies/policy";
import { isGmailConfigured } from "@/lib/replies/providers";
import { logServerError } from "@/lib/server-error";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!isAuthorizedSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actorEmail = session?.user?.email?.toLowerCase();
  if (!actorEmail) {
    return NextResponse.json({ error: "Email identity required" }, { status: 403 });
  }
  const contactJnid = request.nextUrl.searchParams.get("contactJnid");
  const jobJnid = request.nextUrl.searchParams.get("jobJnid");
  if (!contactJnid) {
    return NextResponse.json({ error: "contactJnid is required" }, { status: 400 });
  }

  try {
    const [text, email, drafts, outbound] = await Promise.all([
      resolveTextContext(contactJnid, jobJnid, false),
      resolveEmailContext(contactJnid, jobJnid),
      getDrafts(contactJnid, actorEmail),
      listContactOutbound(contactJnid),
    ]);
    const textPolicy = replyPolicy(actorEmail, "text");
    const baseEmailPolicy = replyPolicy(actorEmail, "email");
    const emailPolicy = isGmailConfigured()
      ? baseEmailPolicy
      : {
          ...baseEmailPolicy,
          canCompose: false,
          sendNow: false,
          reason: "Email sending not set up yet",
        };
    return NextResponse.json({
      capabilities: {
        text: textPolicy,
        email: emailPolicy,
        note: replyPolicy(actorEmail, "note"),
      },
      text,
      email,
      drafts,
      outbound,
    });
  } catch (error) {
    logServerError("[Replies Context] Failed", error);
    return NextResponse.json(
      { error: "Unable to load reply context" },
      { status: 500 }
    );
  }
}
