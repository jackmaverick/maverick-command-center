import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMissingAuthEnvironmentVariables,
  logMissingAuthConfiguration,
} from "@/lib/auth-policy";

export default function AuthenticationConfigurationErrorPage() {
  logMissingAuthConfiguration(getMissingAuthEnvironmentVariables());

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117] p-4">
      <Card className="w-full max-w-md border-red-500/30 bg-[#161b22]">
        <CardHeader className="items-center text-center">
          <div className="mb-3 rounded-full bg-red-500/10 p-3">
            <ShieldAlert className="h-7 w-7 text-red-300" />
          </div>
          <CardTitle className="text-xl text-[#e6edf3]">
            Access denied
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          <p className="text-sm text-[#e6edf3]">
            Authentication is unavailable because required server
            configuration is incomplete.
          </p>
          <p className="text-xs text-[#8b949e]">
            No session was created. An administrator must correct the server
            configuration before anyone can sign in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
