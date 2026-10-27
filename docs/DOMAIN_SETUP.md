# Custom domain setup

Custom domains are included in every active paid plan and require Vercel hosting integration. The current release supports domains the customer already owns. Direct in-platform registration is intentionally displayed as **Coming soon** and performs no purchase, reservation or charge.

Platform control-panel routes are served only on `PUBLIC_APP_URL`, exact Vercel runtime hosts and optional exact `PLATFORM_ADDITIONAL_HOSTS`. Do not add wildcard Vercel or customer-domain entries. On a customer domain, login/subscription navigation returns to the canonical platform host. Business sites retain their public homepage, media and appointment form; Information sites additionally expose only `/articles/[articleSlug]` and `/category/[categorySlug]` through the strict public allowlist.

1. Create a restricted Vercel token with access only to the buyer's project.
2. Set exact `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID` values. The accepted cleanup contract requires explicit team scope.
3. Optionally configure `DOMAIN_REGISTRAR_NAME` and the exact HTTPS `DOMAIN_REGISTRAR_URL`. This is an external customer redirect only; it is not a reseller integration.
4. Activate any paid subscription, open business admin and submit the customer-owned domain without a scheme, path or port.
5. The server attaches the domain to the configured Vercel team/project, validates Vercel's returned project ID and stores normalized setup evidence: exact project/team authority, ownership state, routing state, required DNS records and check time.
6. The customer copies the records shown in the panel into their DNS provider. Existing mail records, especially MX, must remain unchanged.
7. After DNS propagation, use **Check DNS now**. The domain becomes public only when ownership is verified **and** Vercel reports the DNS configuration as valid.

## Customer journeys

### Existing domain — implemented

`Business admin → Custom domain → enter domain → add exact DNS records → check DNS → live`

- Input is normalized and rejects schemes, credentials, paths, invalid ports and platform-owned hosts.
- Provider credentials remain server-only.
- The UI never asks for a registrar password.
- Verification remains fail closed: pending, partial and provider-error states cannot route customer traffic.
- Host allowlisting and exact verified-domain tenant lookup remain unchanged.
- Every setup/check mutation revalidates the authenticated site binding, active subscription and `custom_domain_existing` entitlement on the server before a Vercel call. Rendering the UI control is not authorization.
- In pilot, that preflight is an exact-session database routine. No Vercel call
  occurs after denial; normalized allowlisted evidence is persisted through a
  second exact-site routine.

### Buy externally — implemented as redirect

If `DOMAIN_REGISTRAR_URL` is a valid HTTPS URL, the panel opens that registrar in a new tab. The customer purchases the domain in their own name, returns to BusinessSite and uses the existing-domain journey. BusinessSite does not receive registrar credentials or payment details.

### Buy directly in BusinessSite — planned, disabled

The visible control is disabled and labelled **Coming soon**. A future implementation should use the provider-neutral `DomainProvider` boundary described below, with Openprovider or another audited reseller API. Do not replace the disabled control with a fake checkout or register domains in the platform owner's name.

Proposed provider contract:

```ts
interface DomainProvider {
  search(query: string): Promise<DomainOffer[]>;
  register(input: RegistrantOwnedOrder): Promise<DomainRegistration>;
  renew(registrationId: string): Promise<DomainRegistration>;
  configureDns(registrationId: string, records: DnsRecord[]): Promise<void>;
  getStatus(registrationId: string): Promise<DomainRegistrationStatus>;
}
```

Registration, renewal, registrant verification, refunds, expiry notices, transfer/auth codes, provider reconciliation and reseller accounting must be designed and accepted before enabling this path.

## Stored states

| State | Meaning | Public routing |
| --- | --- | --- |
| `not_requested` | No domain submitted | Denied |
| `pending_dns` | Domain attached but ownership or routing is incomplete | Denied |
| `verified` | Ownership verified and DNS correctly routed | Allowed for the exact active public site |
| `failed` | Provider/configuration request failed and needs review | Denied |

Normalized public setup evidence is stored in `sites.custom_domain_verification`. Migration 052 additionally stores canonical `vercel-project:{teamId}:{projectId}` authority in `sites.custom_domain_provider_authority`; legacy rows are not guessed and cannot authorize automatic cleanup.

## Operational checks

1. Test an apex domain and a `www`/subdomain case on staging.
2. Confirm ownership-only verification remains pending until routing is valid.
3. Confirm the final domain serves HTTPS with a valid certificate.
4. Confirm an unknown, inactive or differently mapped Host is denied.
5. Confirm owner/admin/API/internal routes remain inaccessible on the customer domain.
6. Confirm changing DNS away from the project is detected during the next explicit check; automated recurring health monitoring remains future work.
7. Before enabling deletion, run the guarded B5B matrix and confirm an exact project-domain detach, independent absence reinspection and unchanged unrelated project domains. Never use account-level domain deletion for customer closure.

If verification fails, confirm the domain is not attached to another Vercel project and use the exact dynamic DNS target shown in the BusinessSite panel. Do not hardcode legacy Vercel targets and do not expose Vercel tokens in browser code.
