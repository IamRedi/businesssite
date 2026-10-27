import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Subscription activation requires a verified billing webhook." },
    { status: 410 },
  );
}
