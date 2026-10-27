import { getOwnerPostgresPool, getPostgresPool, getRuntimePostgresPool, type Pool } from "@platform/database";

export const taxDisplayModes = ["gross_inclusive", "net_plus_tax", "tax_exempt_or_special_note"] as const;
export type TaxDisplayMode = (typeof taxDisplayModes)[number];
export const businessTypes = ["company", "sole_proprietor", "other_business"] as const;
export type BusinessType = (typeof businessTypes)[number];
export const businessVerificationStates = ["self_attested", "provider_verified", "manually_verified", "rejected", "review_required"] as const;
export type BusinessVerificationState = (typeof businessVerificationStates)[number];
export const legalDocumentKeys = ["terms", "privacy", "imprint", "cancellation"] as const;
export type LegalDocumentKey = (typeof legalDocumentKeys)[number];
export type LegalDocumentStatus = "draft" | "legal_review_required" | "reviewed" | "active" | "retired";

export type PlatformLegalConfigInput = {
  legalBusinessName: string;
  legalForm?: string;
  street: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  countryCode: string;
  countryName: string;
  authorizedRepresentative?: string;
  contactEmail: string;
  supportEmail: string;
  phone?: string;
  registerName?: string;
  registerCourt?: string;
  registerNumber?: string;
  vatId?: string;
  supervisoryAuthority?: string;
  editorialResponsiblePerson?: string;
  disputeMetadata?: string;
  taxDisplayMode: TaxDisplayMode;
  currency: "EUR" | "USD" | "ALL";
  priceTaxLabel: string;
  specialTaxNote?: string;
};

export type PlatformLegalConfigVersion = PlatformLegalConfigInput & {
  id: string;
  version: number;
  legalReviewStatus: "legal_review_required" | "reviewed";
  status: "draft" | "active" | "retired";
  reviewedAt?: string;
  effectiveFrom?: string;
  createdAt: string;
};

export type PublicPlatformLegalConfig = Omit<PlatformLegalConfigVersion,
  "id" | "legalReviewStatus" | "status" | "reviewedAt" | "createdAt" | "disputeMetadata">;

export type CheckoutDocumentEvidence = {
  documentKey: "terms" | "privacy";
  locale: string;
  version: string;
  contentHash: string;
};

export type LegalDocumentVersion = {
  id: string;
  documentKey: LegalDocumentKey;
  locale: string;
  version: string;
  contentHash: string;
  status: LegalDocumentStatus;
  effectiveFrom?: string;
  reviewedAt?: string;
  reviewerReference?: string;
  createdAt: string;
};

export type FreshLegalActor = {
  actorId: string;
  currentPasswordHash: string;
  totpStep: number;
  correlationId?: string;
};

const optional = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : undefined;

function configFromRow(row: Record<string, unknown>): PlatformLegalConfigVersion {
  return {
    id: row.id as string,
    version: Number(row.version),
    legalBusinessName: row.legal_business_name as string,
    legalForm: optional(row.legal_form),
    street: row.street as string,
    addressLine2: optional(row.address_line_2),
    postalCode: row.postal_code as string,
    city: row.city as string,
    countryCode: row.country_code as string,
    countryName: row.country_name as string,
    authorizedRepresentative: optional(row.authorized_representative),
    contactEmail: row.contact_email as string,
    supportEmail: row.support_email as string,
    phone: optional(row.phone),
    registerName: optional(row.register_name),
    registerCourt: optional(row.register_court),
    registerNumber: optional(row.register_number),
    vatId: optional(row.vat_id),
    supervisoryAuthority: optional(row.supervisory_authority),
    editorialResponsiblePerson: optional(row.editorial_responsible_person),
    disputeMetadata: optional(row.dispute_metadata),
    taxDisplayMode: row.tax_display_mode as TaxDisplayMode,
    currency: row.currency as PlatformLegalConfigInput["currency"],
    priceTaxLabel: row.price_tax_label as string,
    specialTaxNote: optional(row.special_tax_note),
    legalReviewStatus: row.legal_review_status as PlatformLegalConfigVersion["legalReviewStatus"],
    status: row.status as PlatformLegalConfigVersion["status"],
    reviewedAt: iso(row.reviewed_at),
    effectiveFrom: iso(row.effective_from),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function documentFromRow(row: Record<string, unknown>): LegalDocumentVersion {
  return {
    id: row.id as string,
    documentKey: row.document_key as LegalDocumentKey,
    locale: row.locale as string,
    version: row.version as string,
    contentHash: row.content_hash as string,
    status: row.status as LegalDocumentStatus,
    effectiveFrom: iso(row.effective_from),
    reviewedAt: iso(row.reviewed_at),
    reviewerReference: optional(row.reviewer_reference),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export function publicLegalConfig(config: PlatformLegalConfigVersion): PublicPlatformLegalConfig {
  const {
    id: _id, legalReviewStatus: _review, status: _status, reviewedAt: _reviewedAt,
    createdAt: _createdAt, disputeMetadata: _privateDisputeMetadata, ...projection
  } = config;
  return projection;
}

export function normalizeVatIdSyntax(value: unknown) {
  const normalized = typeof value === "string" ? value.toUpperCase().replace(/[\s.\-]/g, "").slice(0, 32) : "";
  return {
    normalized: normalized || undefined,
    syntacticallyPlausible: !normalized || /^[A-Z]{2}[A-Z0-9]{2,14}$/.test(normalized),
  };
}

export class PostgresLegalRepository {
  private readonly pool: Pool;
  private readonly ownerPool?: Pool;
  private readonly sessionHash?: string;
  private readonly boundary: "compatibility" | "runtime" | "owner";
  constructor(connectionOrBoundary?: string | { boundary: "runtime" | "owner"; sessionHash?: string }, legacySessionHash?: string) {
    const sessionHash = typeof connectionOrBoundary === "object" ? connectionOrBoundary.sessionHash : legacySessionHash;
    if (typeof connectionOrBoundary === "string") {
      this.pool = getPostgresPool(connectionOrBoundary);
      this.boundary = sessionHash ? "owner" : "compatibility";
    } else if (connectionOrBoundary?.boundary === "runtime") {
      this.pool = getRuntimePostgresPool();
      this.boundary = "runtime";
    } else if (connectionOrBoundary?.boundary === "owner" || sessionHash) {
      this.pool = getOwnerPostgresPool();
      this.boundary = "owner";
    } else {
      throw new Error("An explicit legal database actor boundary is required.");
    }
    this.ownerPool = this.boundary === "owner" ? this.pool : undefined;
    this.sessionHash = sessionHash;
  }

  async getActiveConfig() {
    const result = await this.pool.query(this.boundary === "runtime"
      ? "select * from resolve_public_legal_config()"
      : "select * from platform_legal_config_versions where status='active' and legal_review_status='reviewed' and effective_from <= now() order by version desc limit 1");
    return result.rows[0] ? configFromRow(result.rows[0]) : null;
  }

  async listConfigs() {
    if (!this.ownerPool || !this.sessionHash) return [];
    const result = await this.ownerPool.query("select * from owner_legal_configs($1)", [this.sessionHash]);
    return result.rows.map(configFromRow);
  }

  async createConfig(actor: FreshLegalActor, input: PlatformLegalConfigInput) {
    if (!this.ownerPool || !this.sessionHash) throw new Error("Authenticated owner context required.");
    const result=await this.ownerPool.query("select * from owner_legal_create_config($1,$2,$3,$4::jsonb,$5)",[this.sessionHash,actor.currentPasswordHash,actor.totpStep,JSON.stringify(input),actor.correlationId??null]);
    if(!result.rows[0]) throw new Error("Only a freshly authenticated owner may create legal configuration.");
    return configFromRow(result.rows[0]);
  }

  async activateConfig(actor: FreshLegalActor, configId: string) {
    if (!this.ownerPool || !this.sessionHash) return null;
    const result=await this.ownerPool.query("select * from owner_legal_activate_config($1,$2,$3,$4,$5)",[this.sessionHash,actor.currentPasswordHash,actor.totpStep,configId,actor.correlationId??null]);
    return result.rows[0]?configFromRow(result.rows[0]):null;
  }

  async listDocuments() {
    const result = this.ownerPool && this.sessionHash
      ? await this.ownerPool.query("select * from owner_legal_documents($1)", [this.sessionHash])
      : await this.pool.query(this.boundary === "runtime"
        ? "select * from resolve_public_legal_documents()"
        : "select * from platform_legal_document_versions order by document_key,locale,created_at desc");
    return result.rows.map(documentFromRow);
  }

  async registerDocument(actor: FreshLegalActor, input: CheckoutDocumentEvidence | (Omit<CheckoutDocumentEvidence, "documentKey"> & { documentKey: LegalDocumentKey })) {
    if(!this.ownerPool||!this.sessionHash) throw new Error("Authenticated owner context required.");
    const result=await this.ownerPool.query("select * from owner_legal_register_document($1,$2,$3,$4,$5,$6,$7,$8)",[this.sessionHash,actor.currentPasswordHash,actor.totpStep,input.documentKey,input.locale,input.version,input.contentHash,actor.correlationId??null]);
    if(!result.rows[0]) throw new Error("Only a freshly authenticated owner may register legal documents.");
    return documentFromRow(result.rows[0]);
  }

  async activateDocument(actor: FreshLegalActor, documentId: string, reviewerReference?: string) {
    if(!this.ownerPool||!this.sessionHash)return null;
    const result=await this.ownerPool.query("select * from owner_legal_activate_document($1,$2,$3,$4,$5,$6)",[this.sessionHash,actor.currentPasswordHash,actor.totpStep,documentId,reviewerReference??"",actor.correlationId??null]);
    return result.rows[0]?documentFromRow(result.rows[0]):null;
  }

  async getActiveCheckoutDocuments(locale: string) {
    if (locale !== "de" && locale !== "en") return [];
    const result = await this.pool.query(
      this.boundary === "runtime" ? `select distinct on(document_key) * from resolve_public_legal_documents()
       where document_key in ('terms','privacy') and locale=$1
       order by document_key,effective_from desc` : `select distinct on(document_key) * from platform_legal_document_versions
       where document_key in ('terms','privacy') and status='active' and effective_from <= now()
         and locale=$1
       order by document_key,effective_from desc`,
      [locale],
    );
    const documents = result.rows.map(documentFromRow);
    return documents.length === 2 ? documents : [];
  }

  async listAcceptances() {
    if(!this.ownerPool||!this.sessionHash)return [];
    const result = await this.ownerPool.query("select * from owner_legal_acceptances($1)",[this.sessionHash]);
    return result.rows.map((row) => ({
      id: row.id as string, siteId: row.site_id as string, intakeId: row.intake_id as string,
      acceptedAt: (row.accepted_at as Date).toISOString(), locale: row.locale as string,
      source: row.source as string, termsVersion: row.terms_version as string,
      privacyVersion: row.privacy_version as string,
      promotionTermsVersion: optional(row.promotion_terms_version),
      commercialConfigVersion: Number(row.platform_legal_config_version),
      planKey: row.plan_key as string, currency: row.currency as string,
      taxDisplayMode: row.tax_display_mode as TaxDisplayMode,
      priceTaxLabelSnapshot: row.price_tax_label_snapshot as string,
      normalPriceDisplaySnapshot: row.normal_price_display_snapshot as string,
      trialDurationDays: Number(row.trial_duration_days), billingInterval: row.billing_interval as string,
      businessIdentityId: row.business_identity_id as string,
      legalBusinessName: row.legal_business_name as string, countryCode: row.country_code as string,
      businessType: row.business_type as BusinessType,
      verificationState: row.verification_state as BusinessVerificationState,
    }));
  }

  async recordLegalConsoleAccess(actorId: string, correlationId?: string) {
    if(!this.ownerPool)return;
    await this.ownerPool.query("select owner_auth_record_audit($1::jsonb)",[JSON.stringify({ownerId:actorId,action:"owner.legal_console_access",outcome:"success",correlationId,details:{category:"sensitive_view"}})]);
  }

  async setBusinessVerification(actor: FreshLegalActor, identityId: string, state: Exclude<BusinessVerificationState, "provider_verified" | "self_attested">, reasonCode?: string) {
    if(!this.ownerPool||!this.sessionHash)return false;
    return Boolean((await this.ownerPool.query("select owner_legal_verify_business($1,$2,$3,$4,$5,$6,$7) as ok",[this.sessionHash,actor.currentPasswordHash,actor.totpStep,identityId,state,reasonCode??"",actor.correlationId??null])).rows[0]?.ok);
  }
}
