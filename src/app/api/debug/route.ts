import { NextResponse } from "next/server";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const hasDb = !!dbUrl;
  const dbHost = dbUrl ? dbUrl.split("@")[1]?.split(":")[0] : "not set";

  return NextResponse.json({
    hasDatabase: hasDb,
    dbHost: dbHost,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
