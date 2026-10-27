"use client";

import { useEffect, useRef } from "react";

export function OwnerInvitationForm() {
  const form = useRef<HTMLFormElement>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const unavailable = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    const valid = /^[a-f0-9]{64}$/.test(value);
    if (valid && tokenInput.current && form.current) {
      tokenInput.current.value = value;
      form.current.hidden = false;
    } else if (unavailable.current) unavailable.current.hidden = false;
    window.history.replaceState(null, "", "/owner/invitation");
  }, []);
  return <>
    <p>Choose a password, then enroll multi-factor authentication to activate the account. Your email and role are bound to the invitation and cannot be changed here.</p>
    <p>Account and security data is processed to complete the invitation. <a href="/legal/privacy">Privacy notice</a></p>
    <p ref={unavailable} hidden>The invitation link is invalid. Ask an owner to issue a new invitation.</p>
    <form ref={form} hidden action="/api/owner/invitations/accept" method="post" className="admin-login">
      <input ref={tokenInput} type="hidden" name="token" defaultValue="" />
      <input required type="password" name="password" autoComplete="new-password" minLength={16} maxLength={200} placeholder="Password (16+ characters)" />
      <input required type="password" name="passwordConfirmation" autoComplete="new-password" minLength={16} maxLength={200} placeholder="Confirm password" />
      <button className="button">Continue to MFA setup</button>
    </form>
  </>;
}
