import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../lib/owner-authorization";
import { readJsonBody } from "../../../../lib/request-body";
import { googleDailyCeiling, parseProviderControlChange, providerControlError } from "../../../../lib/provider-controls";

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "platform.configure");
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody<unknown>(request, 4096);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  let change;
  try { change = parseProviderControlChange(parsed.value); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid settings." }, { status: 400 }); }
  if (change.settings && change.settings.googleDailyLimit > googleDailyCeiling(process.env.FINDER_PROVIDER_CALL_LIMIT)) return NextResponse.json({ error: `The server safety ceiling is ${googleDailyCeiling(process.env.FINDER_PROVIDER_CALL_LIMIT)} Google search requests per day.` }, { status: 400 });
  try {
    const { owner } = authorization;
    const repository = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const snapshot = await repository.ownerProviderControl(change.action, change);
    return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = providerControlError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
