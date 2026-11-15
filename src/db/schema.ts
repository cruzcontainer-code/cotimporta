// src/db/schema.ts — fuente única de tablas. Solo importa drizzle-orm: `pnpm db:seed` lo ejecuta Node puro.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => bigint(name, { mode: "number" });

export const localeEnum = pgEnum("locale", ["es", "en"]);
export const currencyEnum = pgEnum("currency", ["USD", "PEN"]);
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "incomplete",
  "active",
  "past_due",
  "canceled",
  "expired",
]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "calculated", "archived"]);
export const costGroupEnum = pgEnum("cost_group", [
  "origin_freight",
  "other_charges",
  "local_soles",
  "management_fee",
]);
export const costOriginEnum = pgEnum("cost_origin", ["international", "local"]);
export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "done",
  "failed",
  "skipped",
]);
export const taxKindEnum = pgEnum("tax_kind", ["igv", "ipm", "uit", "tasa_despacho"]);
export const tariffRateKindEnum = pgEnum("tariff_rate_kind", [
  "ad_valorem",
  "sobretasa",
  "antidumping",
  "derecho_especifico",
  "isc",
]);
export const rateBaseEnum = pgEnum("rate_base", ["cif", "fob", "cif_plus_duties", "per_unit"]);
export const verificationStatusEnum = pgEnum("verification_status", ["unverified", "verified"]);
export const importSourceEnum = pgEnum("import_source", ["official", "csv"]);
export const importRunStatusEnum = pgEnum("import_run_status", [
  "running",
  "staged",
  "failed",
  "published",
  "discarded",
]);
export const stagingChangeEnum = pgEnum("staging_change", [
  "added",
  "changed",
  "removed",
  "unchanged",
]);
export const usageKindEnum = pgEnum("usage_kind", ["free", "subscription"]);
export const aiCallStatusEnum = pgEnum("ai_call_status", [
  "ok",
  "error",
  "timeout",
  "invalid_output",
  "rate_limited",
]);

// ---------- Auth (better-auth, usePlural) ----------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------- Cuenta y cobro ----------
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  locale: localeEnum("locale").notNull().default("es"),
  country: char("country", { length: 2 }).notNull().default("PE"),
  currency: currencyEnum("currency").notNull().default("PEN"),
  companyName: text("company_name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nameEs: text("name_es").notNull(),
  nameEn: text("name_en").notNull(),
  pricePenMinor: money("price_pen_minor").notNull().default(0),
  priceUsdMinor: money("price_usd_minor").notNull().default(0),
  quotaPerPeriod: integer("quota_per_period").notNull(),
  active: boolean("active").notNull().default(false),
  providerRefPen: text("provider_ref_pen"),
  providerRefUsd: text("provider_ref_usd"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  planCode: text("plan_code")
    .notNull()
    .references(() => plans.code, { onDelete: "restrict" }),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  currency: currencyEnum("currency").notNull(),
  status: subscriptionStatusEnum("status").notNull().default("incomplete"),
  currentPeriodStart: ts("current_period_start"),
  currentPeriodEnd: ts("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    type: text("type").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    amountMinor: money("amount_minor"),
    currency: currencyEnum("currency"),
    payload: jsonb("payload").notNull(),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_events_provider_event_uq").on(t.provider, t.externalEventId)],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: usageKindEnum("kind").notNull(),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end"),
    quotesUsed: integer("quotes_used").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("usage_counters_user_kind_period_uq").on(t.userId, t.kind, t.periodStart)],
);

export const referenceCounters = pgTable("reference_counters", {
  year: integer("year").primaryKey(),
  last: integer("last").notNull().default(0),
});

// ---------- Reglas aduaneras (publicadas) ----------
export const tariffHeadings = pgTable(
  "tariff_headings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 10 }).notNull(),
    descriptionEs: text("description_es").notNull(),
    descriptionEn: text("description_en").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    importedAt: ts("imported_at").notNull().defaultNow(),
    importRunId: uuid("import_run_id"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
  },
  (t) => [
    uniqueIndex("tariff_headings_code_from_uq").on(t.code, t.effectiveFrom),
    index("tariff_headings_code_idx").on(t.code),
  ],
);

export const tariffRates = pgTable(
  "tariff_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    headingCode: varchar("heading_code", { length: 10 }).notNull(),
    kind: tariffRateKindEnum("kind").notNull(),
    base: rateBaseEnum("base").notNull(),
    rateBps: integer("rate_bps"),
    amountPerUnitMinor: money("amount_per_unit_minor"),
    unit: text("unit"),
    currency: currencyEnum("currency").notNull().default("USD"),
    inIgvBase: boolean("in_igv_base").notNull().default(true),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    importedAt: ts("imported_at").notNull().defaultNow(),
    importRunId: uuid("import_run_id"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
  },
  (t) => [
    uniqueIndex("tariff_rates_heading_kind_from_uq").on(t.headingCode, t.kind, t.effectiveFrom),
  ],
);

export const tradeAgreements = pgTable(
  "trade_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    agreementCode: text("agreement_code").notNull(),
    nameEs: text("name_es").notNull(),
    nameEn: text("name_en").notNull(),
    exemptKinds: text("exempt_kinds").array().notNull(),
    requiresOriginCertificate: boolean("requires_origin_certificate").notNull().default(true),
    headingPrefix: text("heading_prefix").notNull().default(""),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("trade_agreements_uq").on(
      t.countryCode,
      t.agreementCode,
      t.headingPrefix,
      t.effectiveFrom,
    ),
  ],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: taxKindEnum("kind").notNull(),
    rateBps: integer("rate_bps"),
    amountMinor: money("amount_minor"),
    currency: currencyEnum("currency").notNull().default("PEN"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tax_rates_kind_from_uq").on(t.kind, t.effectiveFrom)],
);

export const perceptionRules = pgTable(
  "perception_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conditionCode: text("condition_code").notNull(),
    headingPrefix: text("heading_prefix").notNull().default(""),
    rateBps: integer("rate_bps").notNull(),
    descriptionEs: text("description_es").notNull(),
    descriptionEn: text("description_en").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("perception_rules_uq").on(t.conditionCode, t.headingPrefix, t.effectiveFrom)],
);

export const defaultLocalCharges = pgTable(
  "default_local_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptCode: text("concept_code").notNull(),
    labelEs: text("label_es").notNull(),
    labelEn: text("label_en").notNull(),
    group: costGroupEnum("group").notNull(),
    origin: costOriginEnum("origin").notNull(),
    igvApplicable: boolean("igv_applicable").notNull(),
    inCif: boolean("in_cif").notNull().default(false),
    amountMinor: money("amount_minor").notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),
    validFrom: date("valid_from").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("default_local_charges_concept_from_uq").on(t.conceptCode, t.validFrom)],
);

// ---------- Importación de reglas (staging) ----------
export const ruleImportRuns = pgTable("rule_import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: importSourceEnum("source").notNull(),
  sourceUrl: text("source_url"),
  status: importRunStatusEnum("status").notNull().default("running"),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  rowsStaged: integer("rows_staged").notNull().default(0),
  diffSummary: jsonb("diff_summary"),
  error: text("error"),
  triggeredBy: text("triggered_by").notNull(),
  publishedBy: text("published_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: ts("published_at"),
  createdAt: createdAt(),
});

export const stagingTariffHeadings = pgTable("staging_tariff_headings", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => ruleImportRuns.id, { onDelete: "cascade" }),
  change: stagingChangeEnum("change").notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  descriptionEs: text("description_es").notNull(),
  descriptionEn: text("description_en").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const stagingTariffRates = pgTable("staging_tariff_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => ruleImportRuns.id, { onDelete: "cascade" }),
  change: stagingChangeEnum("change").notNull(),
  headingCode: varchar("heading_code", { length: 10 }).notNull(),
  kind: tariffRateKindEnum("kind").notNull(),
  base: rateBaseEnum("base").notNull(),
  rateBps: integer("rate_bps"),
  amountPerUnitMinor: money("amount_per_unit_minor"),
  unit: text("unit"),
  inIgvBase: boolean("in_igv_base").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  sourceUrl: text("source_url").notNull(),
});

// ---------- Cotizaciones ----------
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referenceCode: text("reference_code").notNull().unique(),
    title: text("title").notNull(),
    productDescription: text("product_description").notNull().default(""),
    clientName: text("client_name").notNull().default(""),
    status: quoteStatusEnum("status").notNull().default("draft"),
    locale: localeEnum("locale").notNull().default("es"),
    tariffHeadingCode: varchar("tariff_heading_code", { length: 10 }),
    headingConfirmedAt: ts("heading_confirmed_at"),
    originCountry: char("origin_country", { length: 2 }),
    hasOriginCertificate: boolean("has_origin_certificate").notNull().default(false),
    importerCondition: text("importer_condition").notNull().default("no_aplica"),
    dutiableUnits: integer("dutiable_units").notNull().default(1),
    fxPenPerUsdE4: integer("fx_pen_per_usd_e4"),
    fxDate: date("fx_date"),
    fxSource: text("fx_source"),
    validityDays: integer("validity_days").notNull().default(15),
    marginsBps: integer("margins_bps")
      .array()
      .notNull()
      .default(sql`'{1000,2000,3500}'::integer[]`),
    specs: jsonb("specs"),
    result: jsonb("result"),
    ruleSnapshot: jsonb("rule_snapshot"),
    rulesAsOf: date("rules_as_of"),
    narrative: jsonb("narrative"),
    calculatedAt: ts("calculated_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("quotes_user_created_idx").on(t.userId, t.createdAt),
    index("quotes_user_deleted_idx").on(t.userId, t.deletedAt),
  ],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    totalMinor: money("total_minor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId)],
);

export const quoteCostLines = pgTable(
  "quote_cost_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    conceptCode: text("concept_code").notNull(),
    label: text("label").notNull(),
    group: costGroupEnum("group").notNull(),
    providerName: text("provider_name"),
    origin: costOriginEnum("origin").notNull(),
    igvApplicable: boolean("igv_applicable").notNull(),
    inCif: boolean("in_cif").notNull().default(false),
    amountMinor: money("amount_minor").notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),
    defaultChargeId: uuid("default_charge_id").references(() => defaultLocalCharges.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("quote_cost_lines_quote_idx").on(t.quoteId)],
);

export const quoteSupplierTerms = pgTable("quote_supplier_terms", {
  quoteId: uuid("quote_id")
    .primaryKey()
    .references(() => quotes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  advanceBps: integer("advance_bps").notNull().default(3000),
  balanceBps: integer("balance_bps").notNull().default(7000),
  productionDaysMin: integer("production_days_min").notNull().default(30),
  productionDaysMax: integer("production_days_max").notNull().default(35),
  shippingCoordinationDays: integer("shipping_coordination_days").notNull().default(7),
  transitDaysMin: integer("transit_days_min").notNull().default(30),
  transitDaysMax: integer("transit_days_max").notNull().default(40),
  note: text("note"),
  updatedAt: updatedAt(),
});

export const quoteStages = pgTable(
  "quote_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stageNo: integer("stage_no").notNull(),
    kind: text("kind").notNull(),
    amountUsdMinor: money("amount_usd_minor").notNull(),
    amountPenMinor: money("amount_pen_minor").notNull(),
    daysMin: integer("days_min"),
    daysMax: integer("days_max"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quote_stages_quote_stage_uq").on(t.quoteId, t.stageNo)],
);

export const quoteTaxBreakdown = pgTable(
  "quote_tax_breakdown",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    component: text("component").notNull(),
    scope: text("scope").notNull(),
    conceptCode: text("concept_code"),
    baseMinor: money("base_minor").notNull(),
    rateBps: integer("rate_bps"),
    amountMinor: money("amount_minor").notNull(),
    exempted: boolean("exempted").notNull().default(false),
    exemptionReason: text("exemption_reason"),
    ruleTable: text("rule_table"),
    ruleId: text("rule_id"),
    ruleEffectiveFrom: date("rule_effective_from"),
    sourceUrl: text("source_url"),
    createdAt: createdAt(),
  },
  (t) => [index("quote_tax_breakdown_quote_idx").on(t.quoteId)],
);

export const supplierDocuments = pgTable(
  "supplier_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    language: localeEnum("language"),
    extractionStatus: extractionStatusEnum("extraction_status").notNull().default("pending"),
    extractedSpecs: jsonb("extracted_specs"),
    extractionError: text("extraction_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("supplier_documents_quote_idx").on(t.quoteId)],
);

export const documentImages = pgTable(
  "document_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => supplierDocuments.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    page: integer("page").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    position: integer("position").notNull(),
    included: boolean("included").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("document_images_quote_idx").on(t.quoteId)],
);

export const generatedDocuments = pgTable(
  "generated_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    locale: localeEnum("locale").notNull(),
    version: integer("version").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    resultCalculatedAt: ts("result_calculated_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("generated_documents_quote_locale_version_uq").on(t.quoteId, t.locale, t.version),
  ],
);

// ---------- Operación ----------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_entity_idx").on(t.entity, t.entityId)],
);

export const dataExportRequests = pgTable("data_export_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  createdAt: createdAt(),
  completedAt: ts("completed_at"),
});

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    status: aiCallStatusEnum("status").notNull(),
    attempt: integer("attempt").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_user_created_idx").on(t.userId, t.createdAt)],
);
