import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import {
  getAuthAccessConfig,
  isAllowedGoogleProfile,
  isRequestAuthorized,
} from "@/lib/auth-policy";

const accessConfig = getAuthAccessConfig();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          hd: process.env.AUTH_ALLOWED_DOMAIN,
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
    signIn({ user, profile }) {
      if (!profile) return false;
      return isAllowedGoogleProfile(
        {
          email: user.email,
          email_verified:
            typeof profile.email_verified === "boolean"
              ? profile.email_verified
              : false,
          hd: typeof profile.hd === "string" ? profile.hd : null,
        },
        accessConfig
      );
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
