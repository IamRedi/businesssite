import {
  PostgresInformationRepository,
  roleHasEditorialPermission,
  type EditorialPermission,
  type EditorialRole,
} from "@platform/site-data";
import { requireSiteAdmin, trustedSiteAdminSessionHash } from "./site-admin-auth";

export type EditorialAccess = {
  accountId: string;
  siteId: string;
  email: string;
  sessionHash: string;
  role: EditorialRole;
  can: (permission: EditorialPermission) => boolean;
};

export async function getEditorialAccess(slug: string): Promise<EditorialAccess | null> {
  const session = await requireSiteAdmin(slug);
  if (!session) return null;
  const sessionHash = trustedSiteAdminSessionHash(session);
  const role = await new PostgresInformationRepository({ boundary: "site_admin", sessionHash }).getEditorialRole(
    session.accountId,
    session.siteId,
  );
  if (!role) return null;
  return {
    ...session,
    sessionHash,
    role,
    can: (permission) => roleHasEditorialPermission(role, permission),
  };
}

export async function hasEditorialPermission(slug: string, permission: EditorialPermission) {
  const access = await getEditorialAccess(slug);
  return access?.can(permission) ? access : null;
}
