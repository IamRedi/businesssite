import { NextResponse } from "next/server";
import {
  InformationRepositoryError,
  PostgresInformationRepository,
  rediInboundPermissions,
  type RediInboundPermission,
} from "@platform/site-data";
import { readJsonBody } from "../../../../../../lib/request-body";
import { authorizeOwnerRequest } from "../../../../../../lib/owner-authorization";

type RequestBody = { enabled?: unknown; permissions?: unknown };

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const authorization = await authorizeOwnerRequest(request, "information.manage");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  const { slug } = await params;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/.test(slug))
    return NextResponse.json({ error: "Invalid site." }, { status: 400 });
  const body = await readJsonBody<RequestBody>(request, 16 * 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value))
    return NextResponse.json({ error: "Invalid inbound permission grant." }, { status: 400 });
  const keys = Object.keys(body.value);
  const permissions = body.value.permissions;
  if (
    keys.some((key) => key !== "enabled" && key !== "permissions") ||
    typeof body.value.enabled !== "boolean" ||
    !Array.isArray(permissions) ||
    permissions.some((permission) => typeof permission !== "string" || !rediInboundPermissions.includes(permission as RediInboundPermission))
  ) return NextResponse.json({ error: "Invalid inbound permission grant." }, { status: 400 });
  try {
    const repository = new PostgresInformationRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
    const grant = await repository.configureRediInboundAccess({
      actorType: "owner",
      actorId: owner.ownerId,
      siteId: slug,
      enabled: body.value.enabled,
      permissions: permissions as RediInboundPermission[],
    });
    return NextResponse.json({ grant }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof InformationRepositoryError && error.code === "integration_not_ready")
      return NextResponse.json({ error: "REDI CONTROL installation is not active for this information site." }, { status: 409 });
    throw error;
  }
}
