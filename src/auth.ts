import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import {
  getAuthAccessConfig,
  isAllowedEmail,
  isRequestAuthorized,
} from "@/lib/auth-policy";

const accessConfig = getAuthAccessConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || "missing-auth-secret",
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID || "missing-google-client-id",
      clientSecret:
        process.env.AUTH_GOOGLE_SECRET || "missing-google-client-secret",
      authorization: {
        params: {
          hd: process.env.AUTH_ALLOWED_DOMAIN || "maverickexteriorskc.com",
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    signIn({ user }) {
      return isAllowedEmail(user.email, accessConfig);
    },
    authorized({ auth: session, request }) {
      return isRequestAuthorized(
        request.nextUrl.pathname,
        session,
        accessConfig
      );
    },
  },
});
