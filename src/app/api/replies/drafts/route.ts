import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAuthorizedSession } from "@/lib/auth-policy";
import {
  deleteDraft,
  getDrafts,
  saveDraft,
} from "@/lib/replies/repository";
import { replyRequestSchema } from "@/lib/replies/validation";
import { logServerError } from "@/lib/server-error";

async function actor() {
  const session = await auth();
  if (!isAuthorizedSession(session)) return null;
  return session?.user?.email?.toLowerCase() ?? null;
}

export async function GET(request: NextRequest) {
  const actorEmail = await actor();
  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contactJnid = request.nextUrl.searchParams.get("contactJnid");
  if (!contactJnid) {
    return NextResponse.json({ error: "contactJnid is required" }, { status: 400 });
  }
  return NextResponse.json({
    drafts: await getDrafts(contactJnid, actorEmail),
  });
}

export async function PUT(request: NextRequest) {
  const actorEmail = await actor();
  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = replyRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      draft: await saveDraft(parsed.data, actorEmail),
    });
  } catch (error) {
    logServerError("[Reply Draft] Save failed", error);
    return NextResponse.json({ error: "Unable to save draft" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const actorEmail = await actor();
  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contactJnid = request.nextUrl.searchParams.get("contactJnid");
  const channel = request.nextUrl.searchParams.get("channel");
  if (
    !contactJnid ||
    (channel !== "text" && channel !== "email" && channel !== "note")
  ) {
    return NextResponse.json({ error: "Invalid draft key" }, { status: 400 });
  }
  await deleteDraft(contactJnid, channel, actorEmail);
  return NextResponse.json({ success: true });
}
