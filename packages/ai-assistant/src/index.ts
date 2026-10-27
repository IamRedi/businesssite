export type AiUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCostUsdMicros?: number | null;
  pricingKnown?: boolean;
  pricingVersion?: string;
  pricingAsOf?: string;
  estimateBasis?: "standard_list_price";
};

const OPENAI_PRICING_VERSION = "openai-standard-2026-09-13";
const OPENAI_PRICING_AS_OF = "2026-09-13";

const OPENAI_USD_PER_MILLION = {
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20, longContext: true },
  "gpt-5.6": { input: 4, cachedInput: 0.4, output: 20, longContext: true },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12, longContext: false },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2, longContext: true },
} as const;

export function priceOpenAiUsage(model: string, usage: AiUsage): AiUsage {
  const normalizedModel = model.trim().toLowerCase();
  const matchedModel = Object.keys(OPENAI_USD_PER_MILLION).sort((a, b) => b.length - a.length).find(
    (candidate) => normalizedModel === candidate || normalizedModel.startsWith(`${candidate}-`),
  ) as keyof typeof OPENAI_USD_PER_MILLION | undefined;
  const pricing = matchedModel ? OPENAI_USD_PER_MILLION[matchedModel] : undefined;
  if (!pricing) {
    return {
      ...usage,
      estimatedCostUsdMicros: null,
      pricingKnown: false,
      pricingVersion: OPENAI_PRICING_VERSION,
      pricingAsOf: OPENAI_PRICING_AS_OF,
      estimateBasis: "standard_list_price",
    };
  }
  const cachedInputTokens = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens ?? 0);
  const uncachedInputTokens = Math.max((usage.inputTokens ?? 0) - cachedInputTokens, 0);
  const longContext = pricing.longContext && (usage.inputTokens ?? 0) > 272_000;
  const estimatedCostUsdMicros = Math.round(
    uncachedInputTokens * pricing.input * (longContext ? 2 : 1)
      + cachedInputTokens * pricing.cachedInput * (longContext ? 2 : 1)
      + (usage.outputTokens ?? 0) * pricing.output * (longContext ? 1.5 : 1),
  );
  return {
    ...usage,
    cachedInputTokens,
    estimatedCostUsdMicros,
    pricingKnown: true,
    pricingVersion: OPENAI_PRICING_VERSION,
    pricingAsOf: OPENAI_PRICING_AS_OF,
    estimateBasis: "standard_list_price",
  };
}

export type AiStructuredRequest<T> = {
  model: string;
  instructions: string;
  input: string;
  /** Public, already-approved images the model may inspect alongside the text brief. */
  imageInputs?: Array<{ url: string; detail?: "low" | "auto" | "high" }>;
  schemaName: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => T;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  maxOutputTokens?: number;
  onUsage?: (model: string, usage: AiUsage) => Promise<void>;
};

export type AiStructuredResult<T> = {
  value: T;
  responseId: string;
  model: string;
  usage: AiUsage;
};

export interface AiProvider {
  structured<T>(request: AiStructuredRequest<T>): Promise<AiStructuredResult<T>>;
}

export const themeKeys = ["auto", "studio", "clarity", "forge", "gold"] as const;
export type AiThemeKey = (typeof themeKeys)[number];

export type WebsiteBlueprint = {
  summary: string;
  businessType: string;
  targetAudience: string;
  tone: string;
  templateKey: string;
  themeKey: AiThemeKey;
  reasons: string[];
  content: {
    description: string;
    heroTitle: string;
    heroSubtitle: string;
    aboutTitle: string;
    aboutBody: string;
    servicesTitle: string;
    contactTitle: string;
  };
  services: Array<{ title: string; description: string }>;
  media: {
    heroImageUrl: string;
    serviceImageUrls: string[];
    galleryImageUrls: string[];
  };
  businessDetails: {
    phone: string;
    email: string;
    address: string;
    city: string;
    country: string;
    socialLinks: { instagram: string; facebook: string; tiktok: string };
    openingHours: Array<{
      day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
      open: string;
      close: string;
      closed: boolean;
    }>;
  };
  sourceFindings: string[];
};

const string = (value: unknown, key: string, max: number) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`AI output is missing ${key}.`);
  return value.trim().slice(0, max);
};

export function websiteBlueprintSchema(templateKeys: readonly string[]) {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      businessType: { type: "string" },
      targetAudience: { type: "string" },
      tone: { type: "string" },
      templateKey: { type: "string", enum: [...templateKeys] },
      themeKey: { type: "string", enum: [...themeKeys] },
      reasons: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
      content: {
        type: "object",
        properties: {
          description: { type: "string" }, heroTitle: { type: "string" }, heroSubtitle: { type: "string" },
          aboutTitle: { type: "string" }, aboutBody: { type: "string" }, servicesTitle: { type: "string" }, contactTitle: { type: "string" },
        },
        required: ["description", "heroTitle", "heroSubtitle", "aboutTitle", "aboutBody", "servicesTitle", "contactTitle"],
        additionalProperties: false,
      },
      services: {
        type: "array", minItems: 3, maxItems: 6,
        items: {
          type: "object",
          properties: { title: { type: "string" }, description: { type: "string" } },
          required: ["title", "description"], additionalProperties: false,
        },
      },
      media: {
        type: "object",
        properties: {
          heroImageUrl: { type: "string" },
          serviceImageUrls: { type: "array", maxItems: 6, items: { type: "string" } },
          galleryImageUrls: { type: "array", maxItems: 6, items: { type: "string" } },
        },
        required: ["heroImageUrl", "serviceImageUrls", "galleryImageUrls"],
        additionalProperties: false,
      },
      businessDetails: {
        type: "object",
        properties: {
          phone: { type: "string" }, email: { type: "string" }, address: { type: "string" }, city: { type: "string" }, country: { type: "string" },
          socialLinks: {
            type: "object",
            properties: { instagram: { type: "string" }, facebook: { type: "string" }, tiktok: { type: "string" } },
            required: ["instagram", "facebook", "tiktok"], additionalProperties: false,
          },
          openingHours: {
            type: "array", maxItems: 7,
            items: {
              type: "object",
              properties: {
                day: { type: "string", enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
                open: { type: "string" }, close: { type: "string" }, closed: { type: "boolean" },
              },
              required: ["day", "open", "close", "closed"], additionalProperties: false,
            },
          },
        },
        required: ["phone", "email", "address", "city", "country", "socialLinks", "openingHours"], additionalProperties: false,
      },
      sourceFindings: { type: "array", items: { type: "string" }, maxItems: 12 },
    },
    required: ["summary", "businessType", "targetAudience", "tone", "templateKey", "themeKey", "reasons", "content", "services", "media", "businessDetails", "sourceFindings"],
    additionalProperties: false,
  };
}

export function validateWebsiteBlueprint(value: unknown, templateKeys: readonly string[]): WebsiteBlueprint {
  if (!value || typeof value !== "object") throw new Error("AI returned an invalid website plan.");
  const root = value as Record<string, unknown>;
  const content = root.content as Record<string, unknown> | undefined;
  const services = root.services;
  const reasons = root.reasons;
  const media = (root.media && typeof root.media === "object" ? root.media : {}) as Record<string, unknown>;
  const businessDetails = (root.businessDetails && typeof root.businessDetails === "object" ? root.businessDetails : {}) as Record<string, unknown>;
  const sourceFindings = Array.isArray(root.sourceFindings) ? root.sourceFindings : [];
  const templateKey = string(root.templateKey, "templateKey", 80);
  const themeKey = string(root.themeKey, "themeKey", 20);
  if (!templateKeys.includes(templateKey)) throw new Error("AI selected an unknown template.");
  if (!themeKeys.includes(themeKey as AiThemeKey)) throw new Error("AI selected an unknown theme.");
  if (!content || !Array.isArray(services) || services.length < 3 || services.length > 6 || !Array.isArray(reasons)) {
    throw new Error("AI returned an incomplete website plan.");
  }
  const socialLinks = (businessDetails.socialLinks && typeof businessDetails.socialLinks === "object" ? businessDetails.socialLinks : {}) as Record<string, unknown>;
  const openingHours = Array.isArray(businessDetails.openingHours) ? businessDetails.openingHours : [];
  if (openingHours.length > 7) throw new Error("AI returned invalid business details.");
  const optional = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const seenDays = new Set<string>();
  const normalizedHours = openingHours.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`AI opening-hours entry ${index + 1} is invalid.`);
    const hour = item as Record<string, unknown>;
    const day = optional(hour.day, 12) as (typeof days)[number];
    const closed = hour.closed === true;
    const open = optional(hour.open, 5);
    const close = optional(hour.close, 5);
    if (!days.includes(day) || seenDays.has(day) || typeof hour.closed !== "boolean") throw new Error("AI returned invalid opening hours.");
    if (!closed && (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close))) throw new Error("AI returned invalid opening times.");
    seenDays.add(day);
    return { day, open: closed ? "" : open, close: closed ? "" : close, closed };
  });
  return {
    summary: string(root.summary, "summary", 800),
    businessType: string(root.businessType, "businessType", 120),
    targetAudience: string(root.targetAudience, "targetAudience", 300),
    tone: string(root.tone, "tone", 120),
    templateKey,
    themeKey: themeKey as AiThemeKey,
    reasons: reasons.slice(0, 5).map((item, index) => string(item, `reason ${index + 1}`, 300)),
    content: {
      description: string(content.description, "description", 600),
      heroTitle: string(content.heroTitle, "heroTitle", 140),
      heroSubtitle: string(content.heroSubtitle, "heroSubtitle", 360),
      aboutTitle: string(content.aboutTitle, "aboutTitle", 120),
      aboutBody: string(content.aboutBody, "aboutBody", 1000),
      servicesTitle: string(content.servicesTitle, "servicesTitle", 120),
      contactTitle: string(content.contactTitle, "contactTitle", 120),
    },
    services: services.map((item, index) => {
      if (!item || typeof item !== "object") throw new Error(`AI service ${index + 1} is invalid.`);
      const service = item as Record<string, unknown>;
      return { title: string(service.title, `service ${index + 1} title`, 120), description: string(service.description, `service ${index + 1} description`, 500) };
    }),
    media: {
      heroImageUrl: optional(media.heroImageUrl, 1_000),
      serviceImageUrls: (Array.isArray(media.serviceImageUrls) ? media.serviceImageUrls : []).slice(0, 6).map((item) => optional(item, 1_000)).filter(Boolean),
      galleryImageUrls: (Array.isArray(media.galleryImageUrls) ? media.galleryImageUrls : []).slice(0, 6).map((item) => optional(item, 1_000)).filter(Boolean),
    },
    businessDetails: {
      phone: optional(businessDetails.phone, 80), email: optional(businessDetails.email, 200), address: optional(businessDetails.address, 300),
      city: optional(businessDetails.city, 120), country: optional(businessDetails.country, 120),
      socialLinks: { instagram: optional(socialLinks.instagram, 500), facebook: optional(socialLinks.facebook, 500), tiktok: optional(socialLinks.tiktok, 500) },
      openingHours: normalizedHours,
    },
    sourceFindings: sourceFindings.slice(0, 12).map((item) => optional(item, 400)).filter(Boolean),
  };
}

export type TextRewrite = { text: string };
export const textRewriteSchema = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
};
export function validateTextRewrite(value: unknown): TextRewrite {
  const text = value && typeof value === "object" ? (value as Record<string, unknown>).text : undefined;
  return { text: string(text, "text", 1200) };
}

type ResponsesPayload = {
  id?: string;
  model?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
};

export class OpenAiResponsesProvider implements AiProvider {
  constructor(private readonly apiKey: string, private readonly baseUrl = "https://api.openai.com/v1") {
    if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai.");
  }

  async structured<T>(request: AiStructuredRequest<T>): Promise<AiStructuredResult<T>> {
    const supportsReasoningEffort = /^(?:gpt-5(?:[.-]|$)|o[134](?:-|$))/i.test(request.model);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        store: false,
        ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
        ...(supportsReasoningEffort ? { reasoning: { effort: request.reasoningEffort ?? "low" } } : {}),
        instructions: request.instructions,
        input: request.imageInputs?.length
          ? [{
            role: "user",
            content: [
              { type: "input_text", text: request.input },
              ...request.imageInputs.map((image) => ({ type: "input_image", image_url: image.url, detail: image.detail ?? "low" })),
            ],
          }]
          : request.input,
        text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = (await response.json().catch(() => ({}))) as ResponsesPayload;
    if (!response.ok) throw new Error(payload.error?.message || `OpenAI request failed (${response.status}).`);
    const recordedModel = payload.model ?? request.model;
    const recordedUsage = priceOpenAiUsage(recordedModel, {
      inputTokens: payload.usage?.input_tokens,
      cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens,
      outputTokens: payload.usage?.output_tokens,
      reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens,
      totalTokens: payload.usage?.total_tokens,
    });
    if (request.onUsage && payload.usage && Number.isSafeInteger(payload.usage.input_tokens) && Number.isSafeInteger(payload.usage.output_tokens) && payload.usage.input_tokens! >= 0 && payload.usage.output_tokens! >= 0) {
      await request.onUsage(recordedModel, recordedUsage);
    }
    const part = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text");
    if (!part?.text) {
      const refusal = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.refusal)?.refusal;
      throw new Error(refusal || "OpenAI returned no structured output.");
    }
    let decoded: unknown;
    try { decoded = JSON.parse(part.text); } catch { throw new Error("OpenAI returned malformed structured output."); }
    return {
      value: request.validate(decoded), responseId: payload.id ?? "unknown", model: payload.model ?? request.model,
      usage: priceOpenAiUsage(payload.model ?? request.model, {
        inputTokens: payload.usage?.input_tokens,
        cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens,
        outputTokens: payload.usage?.output_tokens,
        reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens,
        totalTokens: payload.usage?.total_tokens,
      }),
    };
  }
}

export * from "./website-understanding";

export function createAiProvider(environment: Record<string, string | undefined> = process.env): AiProvider {
  const provider = (environment.AI_PROVIDER ?? "disabled").trim().toLowerCase();
  if (provider === "openai") return new OpenAiResponsesProvider(environment.OPENAI_API_KEY ?? "", environment.OPENAI_BASE_URL);
  throw new Error("AI is disabled. Set AI_PROVIDER=openai and configure OPENAI_API_KEY.");
}
