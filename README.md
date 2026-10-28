This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Authentication and homeowner MVP

The application is protected by Auth.js with Google sign-in. Access fails closed
unless all required auth settings are present, and signed-in users must either
belong to the configured Google Workspace domain or appear in the explicit
exception list.

Copy `.env.example` to `.env.local` and set:

- `DATABASE_URL` — server-only Supabase Postgres connection string.
- `AUTH_SECRET` — random secret of at least 32 bytes (`openssl rand -base64 32`).
- `AUTH_GOOGLE_ID` — Google OAuth web client ID.
- `AUTH_GOOGLE_SECRET` — Google OAuth client secret.
- `AUTH_ALLOWED_DOMAIN` — allowed Workspace domain (normally
  `maverickexteriorskc.com`).
- `AUTH_ALLOWED_EMAILS` — optional comma-separated exception emails.
- `CRON_SECRET` — existing Vercel Cron bearer secret.

Configure this authorized redirect URI in the Google OAuth client:

```text
http://localhost:3000/api/auth/callback/google
```

Add the equivalent URI for each stable Vercel preview/production domain that
should support sign-in. Do not use wildcard redirect URIs; Google does not
support them.

The Phase 1 read-only pages are:

- `/homeowners` — contact search by name or street address.
- `/homeowners/[contactJnid]` — JobNimbus jobs, campaign state,
  communication restrictions, identity-match warnings, and a paginated merged
  timeline.
- `/campaign-board` — read-only enrollment board grouped by campaign.

Homeowner queries are parameterized `SELECT` statements only. Phase 1 excludes
contacts/jobs whose names contain the whole word `test`, plus jobs with a
`seq_job_exclusions` reason containing `test`. Jack should confirm that rule
before production rollout.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
