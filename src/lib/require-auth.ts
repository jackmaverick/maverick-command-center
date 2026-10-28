import { auth } from "@/auth";
import {
  getAuthAccessConfig,
  getMissingAuthEnvironmentVariables,
  isAuthorizedSession,
  logMissingAuthConfiguration,
} from "@/lib/auth-policy";

export async function hasAuthorizedSession(): Promise<boolean> {
  const accessConfig = getAuthAccessConfig();
  if (!accessConfig.configured) {
    logMissingAuthConfiguration(getMissingAuthEnvironmentVariables());
    return false;
  }
  const session = await auth();
  return isAuthorizedSession(session, accessConfig);
}
