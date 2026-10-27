export const ownerRoles = ["owner", "admin", "operator", "viewer"] as const;
export type OwnerRole = (typeof ownerRoles)[number];

export const ownerPermissions = [
  "team.manage",
  "security.self",
  "security.accounts",
  "finder.read",
  "finder.write",
  "demos.manage",
  "websites.read",
  "websites.manage",
  "subscriptions.read",
  "billing.manage",
  "ai.manage",
  "information.manage",
  "audit.read",
  "platform.configure",
  "privacy.read",
  "privacy.manage",
] as const;
export type OwnerPermission = (typeof ownerPermissions)[number];

const all = [...ownerPermissions] as const;
export const ownerRolePermissions = Object.freeze({
  owner: all,
  admin: [
    "security.self", "finder.read", "finder.write", "demos.manage",
    "websites.read", "websites.manage", "subscriptions.read", "billing.manage",
    "ai.manage", "information.manage", "audit.read", "privacy.read",
  ],
  operator: [
    "security.self", "finder.read", "finder.write", "demos.manage",
    "websites.read", "websites.manage", "subscriptions.read", "ai.manage",
  ],
  viewer: ["security.self", "finder.read", "websites.read", "subscriptions.read"],
} satisfies Readonly<Record<OwnerRole, readonly OwnerPermission[]>>);

export function isOwnerRole(value: unknown): value is OwnerRole {
  return typeof value === "string" && ownerRoles.includes(value as OwnerRole);
}

export function isOwnerPermission(value: unknown): value is OwnerPermission {
  return typeof value === "string" && ownerPermissions.includes(value as OwnerPermission);
}

export function hasOwnerPermission(role: unknown, permission: unknown) {
  if (!isOwnerRole(role) || !isOwnerPermission(permission)) return false;
  return (ownerRolePermissions[role] as readonly OwnerPermission[]).includes(permission);
}

export type OwnerRouteClassification =
  | { access: "public-auth" | "public-invitation" }
  | { access: "authenticated"; permission: OwnerPermission };

export const ownerRoutePermissions = Object.freeze({
  "page:/owner": { access: "authenticated", permission: "finder.read" },
  "page:/owner/businesses": { access: "authenticated", permission: "finder.read" },
  "page:/owner/customers": { access: "authenticated", permission: "subscriptions.read" },
  "page:/owner/complimentary": { access: "authenticated", permission: "websites.manage" },
  "page:/owner/leads/[id]": { access: "authenticated", permission: "finder.read" },
  "page:/owner/login": { access: "public-auth" },
  "page:/owner/mfa": { access: "public-auth" },
  "page:/owner/promotions": { access: "authenticated", permission: "billing.manage" },
  "page:/owner/publications": { access: "authenticated", permission: "information.manage" },
  "page:/owner/searches": { access: "authenticated", permission: "finder.read" },
  "page:/owner/security": { access: "authenticated", permission: "security.self" },
  "page:/owner/sites/[slug]/usage": { access: "authenticated", permission: "subscriptions.read" },
  "page:/owner/sites/[slug]/custom-design": { access: "authenticated", permission: "websites.manage" },
  "page:/owner/team": { access: "authenticated", permission: "team.manage" },
  "page:/owner/invitation": { access: "public-invitation" },
  "page:/owner/legal": { access: "authenticated", permission: "audit.read" },
  "page:/owner/privacy": { access: "authenticated", permission: "privacy.read" },
  "page:/owner/provider-usage": { access: "authenticated", permission: "audit.read" },

  "api:POST:/api/owner/ai/analyze": { access: "authenticated", permission: "ai.manage" },
  "api:POST:/api/owner/ai/apply": { access: "authenticated", permission: "ai.manage" },
  "api:POST:/api/owner/demos": { access: "authenticated", permission: "demos.manage" },
  "api:POST:/api/owner/geocode": { access: "authenticated", permission: "finder.write" },
  "api:POST:/api/owner/search": { access: "authenticated", permission: "finder.write" },
  "api:POST:/api/owner/provider-controls": { access: "authenticated", permission: "platform.configure" },
  "api:POST:/api/owner/sites/[slug]/admin": { access: "authenticated", permission: "websites.manage" },
  "api:POST:/api/owner/sites/[slug]/invitation": { access: "authenticated", permission: "websites.manage" },
  "api:POST:/api/owner/sites/[slug]/preview-token": { access: "authenticated", permission: "websites.manage" },
  "api:POST:/api/owner/sites/[slug]/custom-design": { access: "authenticated", permission: "websites.manage" },
  "api:POST:/api/owner/sites/[slug]/custom-media": { access: "authenticated", permission: "websites.manage" },
  "api:POST:/api/owner/sites/[slug]/redi-information": { access: "authenticated", permission: "information.manage" },
  "api:POST:/api/owner/auth/login": { access: "public-auth" },
  "api:POST:/api/owner/auth/logout": { access: "public-auth" },
  "api:POST:/api/owner/auth/mfa/enroll": { access: "public-auth" },
  "api:POST:/api/owner/auth/mfa/verify": { access: "public-auth" },
  "api:POST:/api/owner/auth/password": { access: "authenticated", permission: "security.self" },
  "api:POST:/api/owner/auth/recovery-codes": { access: "authenticated", permission: "security.self" },
  "api:POST:/api/owner/invitations/accept": { access: "public-invitation" },
  "api:POST:/api/owner/team/invitations": { access: "authenticated", permission: "team.manage" },
  "api:POST:/api/owner/team/invitations/[id]/resend": { access: "authenticated", permission: "team.manage" },
  "api:POST:/api/owner/team/invitations/[id]/revoke": { access: "authenticated", permission: "team.manage" },
  "api:POST:/api/owner/team/accounts/[id]/role": { access: "authenticated", permission: "team.manage" },
  "api:POST:/api/owner/team/accounts/[id]/status": { access: "authenticated", permission: "team.manage" },
  "api:POST:/api/owner/team/accounts/[id]/sessions": { access: "authenticated", permission: "team.manage" },
  "api:POST:/api/owner/legal/config": { access: "authenticated", permission: "platform.configure" },
  "api:POST:/api/owner/legal/documents": { access: "authenticated", permission: "platform.configure" },
  "api:POST:/api/owner/legal/business-identities/[id]/verification": { access: "authenticated", permission: "platform.configure" },
  "api:POST:/api/owner/privacy": { access: "authenticated", permission: "privacy.manage" },
  "api:POST:/api/owner/privacy-export/request": { access: "authenticated", permission: "security.self" },
  "api:POST:/api/owner/privacy-export/capability": { access: "authenticated", permission: "security.self" },
  "api:POST:/api/owner/privacy-export/download": { access: "authenticated", permission: "security.self" },
} satisfies Readonly<Record<string, OwnerRouteClassification>>);

export const ownerActionPermissions = Object.freeze({
  "promotions.create": "billing.manage",
  "promotions.deactivate": "billing.manage",
  "publications.create": "information.manage",
  "usage.override": "websites.manage",
  "complimentary.create": "websites.manage",
  "complimentary.revoke": "websites.manage",
} satisfies Readonly<Record<string, OwnerPermission>>);
