import QRCode from "qrcode";
import Image from "next/image";
import { redirect } from "next/navigation";
import { decryptOwnerMfaSecret, ownerMfaEnrollmentUri, requireOwnerChallenge } from "../../../lib/owner-auth";

export const dynamic = "force-dynamic";

export default async function OwnerMfaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const current = await requireOwnerChallenge();
  if (!current) redirect("/owner/login?error=invalid");
  const enrollment = current.challenge.purpose === "mfa_enroll";
  let qrCode: string | undefined;
  if (enrollment) {
    const secret = decryptOwnerMfaSecret(current.challenge.pendingMfaSecretEncrypted!);
    qrCode = await QRCode.toDataURL(ownerMfaEnrollmentUri(secret, current.challenge.email), { errorCorrectionLevel: "M", margin: 1, width: 240 });
  }
  const error = (await searchParams).error;
  return <main className="shell">
    <p className="eyebrow">Owner security</p>
    <h1>{enrollment ? "Set up multi-factor authentication" : "Verify your sign-in"}</h1>
    {enrollment ? <>
      <p>Scan this QR code with your authenticator app, then enter the current six-digit code.</p>
      {/* The data URL is generated server-side and is intentionally shown only during enrollment. */}
      <Image unoptimized src={qrCode!} width={240} height={240} alt="Authenticator enrollment QR code" />
    </> : <p>Enter the current code from your authenticator app.</p>}
    <form action={enrollment ? "/api/owner/auth/mfa/enroll" : "/api/owner/auth/mfa/verify"} method="post" className="admin-login">
      <input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="123456" />
      <button className="button">Verify</button>
    </form>
    {!enrollment ? <form action="/api/owner/auth/mfa/verify" method="post" className="admin-login">
      <label htmlFor="recoveryCode">Or use a one-time recovery code</label>
      <input required id="recoveryCode" name="recoveryCode" autoComplete="off" maxLength={32} />
      <button className="button secondary">Use recovery code</button>
    </form> : null}
    {error ? <p className="error">The verification code is invalid, expired, or already used.</p> : null}
  </main>;
}
