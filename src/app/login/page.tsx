import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAuthAccessConfig,
  getMissingAuthEnvironmentVariables,
  logMissingAuthConfiguration,
} from "@/lib/auth-policy";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const config = getAuthAccessConfig();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117] p-4">
      <Card className="w-full max-w-md border-[#30363d] bg-[#161b22]">
        <CardHeader className="items-center text-center">
          <div className="mb-3 rounded-full bg-[#58a6ff]/10 p-3">
            <ShieldCheck className="h-7 w-7 text-[#58a6ff]" />
          </div>
          <CardTitle className="text-xl text-[#e6edf3]">
            Maverick Command Center
          </CardTitle>
          <p className="text-sm text-[#8b949e]">
            Sign in with your Maverick Exteriors Google account.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!config.configured && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              Login is locked until the required authentication environment
              variables are configured.
            </div>
          )}
          {error && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              This Google account is not authorized for Maverick Command Center.
            </div>
          )}
          <form
            action={async () => {
              "use server";
              const runtimeConfig = getAuthAccessConfig();
              if (!runtimeConfig.configured) {
                logMissingAuthConfiguration(
                  getMissingAuthEnvironmentVariables()
                );
                redirect("/configuration-error");
              }
              await signIn("google", { redirectTo: "/homeowners" });
            }}
          >
            <Button
              type="submit"
              disabled={!config.configured}
              className="w-full"
            >
              Continue with Google
            </Button>
          </form>
          <p className="text-center text-xs text-[#6e7681]">
            Access is limited to the configured Workspace domain and explicit
            email exceptions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
