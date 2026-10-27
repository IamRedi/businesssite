import {
  PostgresLegalRepository,
  publicLegalConfig,
  taxDisplayModes,
  type PlatformLegalConfigInput,
  type PublicPlatformLegalConfig,
  type TaxDisplayMode,
} from "@platform/site-data";
import { developmentCheckoutDocuments, legalDocumentEvidence } from "./legal-documents";
import type { LegalDocumentLocale } from "./locale-model";
import { databaseRlsMode, getRuntimePostgresPool } from "@platform/database";

const value = (name: string) => process.env[name]?.trim() ?? "";
const optional = (name: string) => value(name) || undefined;
const email = (name: string) => value(name).toLowerCase();
const supportedCurrencies = ["EUR", "USD", "ALL"] as const;

export const legalCommercialEnvironmentErrors = () => {
  const required = [
    "LEGAL_OPERATOR_NAME", "LEGAL_OPERATOR_STREET", "LEGAL_OPERATOR_POSTAL_CODE",
    "LEGAL_OPERATOR_CITY", "LEGAL_OPERATOR_COUNTRY_CODE", "LEGAL_OPERATOR_COUNTRY",
    "LEGAL_CONTACT_EMAIL", "LEGAL_SUPPORT_EMAIL", "LEGAL_TAX_DISPLAY_MODE",
    "LEGAL_PRICE_TAX_LABEL", "LEGAL_COMMERCIAL_CURRENCY",
  ];
  const errors = required.filter((name) => !value(name)).map((name) => `${name} is required`);
  if (value("LEGAL_OPERATOR_COUNTRY_CODE") && !/^[A-Z]{2}$/.test(value("LEGAL_OPERATOR_COUNTRY_CODE")))
    errors.push("LEGAL_OPERATOR_COUNTRY_CODE must be an ISO 3166-1 alpha-2 code");
  if (value("LEGAL_TAX_DISPLAY_MODE") && !taxDisplayModes.includes(value("LEGAL_TAX_DISPLAY_MODE") as TaxDisplayMode))
    errors.push(`LEGAL_TAX_DISPLAY_MODE must be one of ${taxDisplayModes.join(", ")}`);
  if (value("LEGAL_COMMERCIAL_CURRENCY") && !supportedCurrencies.includes(value("LEGAL_COMMERCIAL_CURRENCY") as never))
    errors.push("LEGAL_COMMERCIAL_CURRENCY must be EUR, USD or ALL");
  if (value("LEGAL_TAX_DISPLAY_MODE") === "tax_exempt_or_special_note" && !value("LEGAL_SPECIAL_TAX_NOTE"))
    errors.push("LEGAL_SPECIAL_TAX_NOTE is required for tax_exempt_or_special_note");
  for (const name of ["LEGAL_CONTACT_EMAIL", "LEGAL_SUPPORT_EMAIL"])
    if (value(name) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(name))) errors.push(`${name} must be an email address`);
  return errors;
};

export function environmentLegalConfig(): PlatformLegalConfigInput {
  const configuredTaxMode = value("LEGAL_TAX_DISPLAY_MODE");
  const taxDisplayMode = taxDisplayModes.includes(configuredTaxMode as TaxDisplayMode)
    ? configuredTaxMode as TaxDisplayMode
    : "gross_inclusive";
  const configuredCurrency = value("LEGAL_COMMERCIAL_CURRENCY");
  const currency = supportedCurrencies.includes(configuredCurrency as never)
    ? configuredCurrency as PlatformLegalConfigInput["currency"]
    : "EUR";
  return {
    legalBusinessName: value("LEGAL_OPERATOR_NAME"),
    legalForm: optional("LEGAL_OPERATOR_LEGAL_FORM"),
    street: value("LEGAL_OPERATOR_STREET"),
    addressLine2: optional("LEGAL_OPERATOR_ADDRESS_LINE_2"),
    postalCode: value("LEGAL_OPERATOR_POSTAL_CODE"),
    city: value("LEGAL_OPERATOR_CITY"),
    countryCode: value("LEGAL_OPERATOR_COUNTRY_CODE") || "DE",
    countryName: value("LEGAL_OPERATOR_COUNTRY"),
    authorizedRepresentative: optional("LEGAL_OPERATOR_REPRESENTATIVE"),
    contactEmail: email("LEGAL_CONTACT_EMAIL"),
    supportEmail: email("LEGAL_SUPPORT_EMAIL"),
    phone: optional("LEGAL_CONTACT_PHONE"),
    registerName: optional("LEGAL_REGISTER_NAME"),
    registerCourt: optional("LEGAL_REGISTER_COURT"),
    registerNumber: optional("LEGAL_REGISTER_NUMBER"),
    vatId: optional("LEGAL_VAT_ID"),
    supervisoryAuthority: optional("LEGAL_SUPERVISORY_AUTHORITY"),
    editorialResponsiblePerson: optional("LEGAL_CONTENT_RESPONSIBLE"),
    disputeMetadata: optional("LEGAL_DISPUTE_METADATA"),
    taxDisplayMode,
    currency,
    priceTaxLabel: value("LEGAL_PRICE_TAX_LABEL"),
    specialTaxNote: optional("LEGAL_SPECIAL_TAX_NOTE"),
  };
}

function nonProductionProjection(): PublicPlatformLegalConfig {
  return { ...environmentLegalConfig(), version: 0, effectiveFrom: undefined };
}

export async function resolvedPlatformLegalConfig() {
  try {
    const active = await new PostgresLegalRepository({ boundary: "runtime" }).getActiveConfig();
    if (active) return { config: publicLegalConfig(active), reviewed: true as const, source: "database" as const };
  } catch {
    // Local legal pages remain renderable. Production checkout and release checks
    // independently require reviewed database configuration.
  }
  return { config: nonProductionProjection(), reviewed: false as const, source: "non_production_environment_fixture" as const };
}

export function publicOperatorAddress(config: PublicPlatformLegalConfig) {
  return [config.street, config.addressLine2,
    [config.postalCode, config.city].filter(Boolean).join(" "), config.countryName]
    .filter((line): line is string => Boolean(line));
}

export function priceTaxPresentation(config: PublicPlatformLegalConfig) {
  return config.taxDisplayMode === "tax_exempt_or_special_note"
    ? config.specialTaxNote || config.priceTaxLabel
    : config.priceTaxLabel;
}

export async function checkoutLegalContext(
  locale: LegalDocumentLocale,
  currency: PlatformLegalConfigInput["currency"],
  sessionHash?: string,
) {
  if (databaseRlsMode() !== "off") {
    if (!sessionHash) return { ok: false as const, reason: "legal_commercial_configuration_unavailable" as const };
    const result = await getRuntimePostgresPool().query(
      "select * from billing_checkout_legal_context($1,$2,$3)",
      [sessionHash, locale, currency],
    );
    const row = result.rows[0];
    const expected = [legalDocumentEvidence("terms", locale), legalDocumentEvidence("privacy", locale)];
    if (!row || !expected.every((source) => source.version === row[`${source.documentKey}_version`] &&
      source.contentHash === row[`${source.documentKey}_content_hash`]))
      return { ok: false as const, reason: "legal_commercial_configuration_unavailable" as const };
    return {
      ok: true as const,
      config: {
        ...nonProductionProjection(),
        version: Number(row.config_version),
        currency,
        taxDisplayMode: row.tax_display_mode,
        priceTaxLabel: row.price_tax_label,
        specialTaxNote: row.special_tax_note ?? undefined,
      } as PublicPlatformLegalConfig,
      documents: expected,
      evidenceSource: "reviewed_database" as const,
    };
  }
  const repository = new PostgresLegalRepository({ boundary: "runtime" });
  let activeConfig = null;
  let activeDocuments: Awaited<ReturnType<PostgresLegalRepository["getActiveCheckoutDocuments"]>> = [];
  try {
    [activeConfig, activeDocuments] = await Promise.all([
      repository.getActiveConfig(), repository.getActiveCheckoutDocuments(locale),
    ]);
  } catch {
    // Production fails closed below. Tests/development use explicitly labelled fixtures.
  }
  const expected = [legalDocumentEvidence("terms", locale), legalDocumentEvidence("privacy", locale)];
  const documentsMatchSource = activeDocuments.length === 2 && expected.every((source) =>
    activeDocuments.some((active) => active.documentKey === source.documentKey &&
      active.locale === source.locale && active.version === source.version &&
      active.contentHash === source.contentHash));
  if (process.env.NODE_ENV === "production") {
    if (!activeConfig || activeConfig.currency !== currency || !documentsMatchSource)
      return { ok: false as const, reason: "legal_commercial_configuration_unavailable" as const };
    return {
      ok: true as const,
      config: publicLegalConfig(activeConfig),
      documents: expected,
      evidenceSource: "reviewed_database" as const,
    };
  }
  const config = activeConfig ? publicLegalConfig(activeConfig) : nonProductionProjection();
  return {
    ok: true as const,
    config,
    documents: documentsMatchSource ? expected : developmentCheckoutDocuments(locale),
    evidenceSource: documentsMatchSource ? "reviewed_database" as const : "non_production_fixture" as const,
  };
}
