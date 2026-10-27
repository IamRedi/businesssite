import { OwnerInvitationForm } from "../../../components/owner-invitation-form";

export const dynamic = "force-dynamic";

export default async function OwnerInvitationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="shell">
    <p className="eyebrow">Secure team invitation</p>
    <h1>Accept your invitation</h1>
    <OwnerInvitationForm />
    {error ? <p className="error">The invitation could not be accepted.</p> : null}
  </main>;
}
