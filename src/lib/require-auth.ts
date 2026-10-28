import { auth } from "@/auth";
import { isAuthorizedSession } from "@/lib/auth-policy";

export async function hasAuthorizedSession(): Promise<boolean> {
  const session = await auth();
  return isAuthorizedSession(session);
}
