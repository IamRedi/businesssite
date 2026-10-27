import { NextResponse } from "next/server";
import { requireSiteAdmin } from "../../../../../../../lib/site-admin-auth";
import { isSameOriginRequest } from "../../../../../../../lib/same-origin";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Social Media checkout is unavailable." }, { status: 403 });
  const { slug } = await params;
  if (!(await requireSiteAdmin(slug)))
    return NextResponse.json({ error: "Business admin authorization required." }, { status: 403 });
  return NextResponse.json(
    { error: "Social Media is coming soon and cannot be purchased." },
    { status: 410 },
  );
}
