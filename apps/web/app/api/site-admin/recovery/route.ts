import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { abusePolicy } from "../../../../lib/abuse-policy";
import { sendPasswordReset } from "../../../../lib/email";
import { clientAddress, enforceSubjectRateLimit } from "../../../../lib/rate-limit";
import { readUrlEncodedBody } from "../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../lib/same-origin";
import { normalizeSiteAdminEmail, tokenHash } from "../../../../lib/site-admin-auth";

const completed = (request: Request) =>
  NextResponse.redirect(new URL("/site-admin/forgot-password?sent=1", request.url), 303);

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Recovery request is unavailable." }, { status: 403 });
  const body = await readUrlEncodedBody(request, 2 * 1024);
  if (!body.ok) return completed(request);
  const email = normalizeSiteAdminEmail(body.value.get("email"));
  const repository = new PostgresSiteRepository({ boundary: "runtime" });
  const policy = abusePolicy.passwordReset;
  const [networkLimit, accountLimit] = await Promise.all([
    enforceSubjectRateLimit("password_reset_network", clientAddress(request.headers), policy.network.limit, policy.network.windowSeconds),
    enforceSubjectRateLimit("password_reset_account", email, policy.account.limit, policy.account.windowSeconds),
  ]);
  if (!networkLimit.allowed || !accountLimit.allowed) return completed(request);

  const account = email.includes("@")
    ? await repository.getAdminByEmail(email)
    : null;
  if (account) {
    try {
      const token = randomBytes(32).toString("hex");
      await repository.createPasswordReset(
        account.id,
        tokenHash(token),
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      );
      await sendPasswordReset({ to: account.email, token, locale: account.preferredLocale });
    } catch {
      // The public response deliberately remains identical for provider and account outcomes.
    }
  }
  return completed(request);
}
