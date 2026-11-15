CREATE TYPE "public"."ai_call_status" AS ENUM('ok', 'error', 'timeout', 'invalid_output', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."cost_group" AS ENUM('origin_freight', 'other_charges', 'local_soles', 'management_fee');--> statement-breakpoint
CREATE TYPE "public"."cost_origin" AS ENUM('international', 'local');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'PEN');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."import_run_status" AS ENUM('running', 'staged', 'failed', 'published', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('official', 'csv');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('es', 'en');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'calculated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."rate_base" AS ENUM('cif', 'fob', 'cif_plus_duties', 'per_unit');--> statement-breakpoint
CREATE TYPE "public"."staging_change" AS ENUM('added', 'changed', 'removed', 'unchanged');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."tariff_rate_kind" AS ENUM('ad_valorem', 'sobretasa', 'antidumping', 'derecho_especifico', 'isc');--> statement-breakpoint
CREATE TYPE "public"."tax_kind" AS ENUM('igv', 'ipm', 'uit', 'tasa_despacho');--> statement-breakpoint
CREATE TYPE "public"."usage_kind" AS ENUM('free', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'verified');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"quote_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"status" "ai_call_status" NOT NULL,
	"attempt" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_export_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "default_local_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_code" text NOT NULL,
	"label_es" text NOT NULL,
	"label_en" text NOT NULL,
	"group" "cost_group" NOT NULL,
	"origin" "cost_origin" NOT NULL,
	"igv_applicable" boolean NOT NULL,
	"in_cif" boolean DEFAULT false NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"valid_from" date NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"page" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"position" integer NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_images_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "generated_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"locale" "locale" NOT NULL,
	"version" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"size_bytes" integer NOT NULL,
	"result_calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"type" text NOT NULL,
	"user_id" text,
	"amount_minor" bigint,
	"currency" "currency",
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perception_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"condition_code" text NOT NULL,
	"heading_prefix" text DEFAULT '' NOT NULL,
	"rate_bps" integer NOT NULL,
	"description_es" text NOT NULL,
	"description_en" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_url" text NOT NULL,
	"reviewed_by" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"price_pen_minor" bigint DEFAULT 0 NOT NULL,
	"price_usd_minor" bigint DEFAULT 0 NOT NULL,
	"quota_per_period" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"provider_ref_pen" text,
	"provider_ref_usd" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" "locale" DEFAULT 'es' NOT NULL,
	"country" char(2) DEFAULT 'PE' NOT NULL,
	"currency" "currency" DEFAULT 'PEN' NOT NULL,
	"company_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"concept_code" text NOT NULL,
	"label" text NOT NULL,
	"group" "cost_group" NOT NULL,
	"provider_name" text,
	"origin" "cost_origin" NOT NULL,
	"igv_applicable" boolean NOT NULL,
	"in_cif" boolean DEFAULT false NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"default_charge_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"stage_no" integer NOT NULL,
	"kind" text NOT NULL,
	"amount_usd_minor" bigint NOT NULL,
	"amount_pen_minor" bigint NOT NULL,
	"days_min" integer,
	"days_max" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_supplier_terms" (
	"quote_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"advance_bps" integer DEFAULT 3000 NOT NULL,
	"balance_bps" integer DEFAULT 7000 NOT NULL,
	"production_days_min" integer DEFAULT 30 NOT NULL,
	"production_days_max" integer DEFAULT 35 NOT NULL,
	"shipping_coordination_days" integer DEFAULT 7 NOT NULL,
	"transit_days_min" integer DEFAULT 30 NOT NULL,
	"transit_days_max" integer DEFAULT 40 NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_tax_breakdown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"component" text NOT NULL,
	"scope" text NOT NULL,
	"concept_code" text,
	"base_minor" bigint NOT NULL,
	"rate_bps" integer,
	"amount_minor" bigint NOT NULL,
	"exempted" boolean DEFAULT false NOT NULL,
	"exemption_reason" text,
	"rule_table" text,
	"rule_id" text,
	"rule_effective_from" date,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reference_code" text NOT NULL,
	"title" text NOT NULL,
	"product_description" text DEFAULT '' NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"locale" "locale" DEFAULT 'es' NOT NULL,
	"tariff_heading_code" varchar(10),
	"heading_confirmed_at" timestamp with time zone,
	"origin_country" char(2),
	"has_origin_certificate" boolean DEFAULT false NOT NULL,
	"importer_condition" text DEFAULT 'no_aplica' NOT NULL,
	"dutiable_units" integer DEFAULT 1 NOT NULL,
	"fx_pen_per_usd_e4" integer,
	"fx_date" date,
	"fx_source" text,
	"validity_days" integer DEFAULT 15 NOT NULL,
	"margins_bps" integer[] DEFAULT '{1000,2000,3500}'::integer[] NOT NULL,
	"specs" jsonb,
	"result" jsonb,
	"rule_snapshot" jsonb,
	"rules_as_of" date,
	"narrative" jsonb,
	"calculated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_reference_code_unique" UNIQUE("reference_code")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "import_source" NOT NULL,
	"source_url" text,
	"status" "import_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_staged" integer DEFAULT 0 NOT NULL,
	"diff_summary" jsonb,
	"error" text,
	"triggered_by" text NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staging_tariff_headings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"change" "staging_change" NOT NULL,
	"code" varchar(10) NOT NULL,
	"description_es" text NOT NULL,
	"description_en" text NOT NULL,
	"effective_from" date NOT NULL,
	"source_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staging_tariff_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"change" "staging_change" NOT NULL,
	"heading_code" varchar(10) NOT NULL,
	"kind" "tariff_rate_kind" NOT NULL,
	"base" "rate_base" NOT NULL,
	"rate_bps" integer,
	"amount_per_unit_minor" bigint,
	"unit" text,
	"in_igv_base" boolean NOT NULL,
	"effective_from" date NOT NULL,
	"source_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_code" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"currency" "currency" NOT NULL,
	"status" "subscription_status" DEFAULT 'incomplete' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"language" "locale",
	"extraction_status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"extracted_specs" jsonb,
	"extraction_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "tariff_headings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"description_es" text NOT NULL,
	"description_en" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_url" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_run_id" uuid,
	"reviewed_by" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"heading_code" varchar(10) NOT NULL,
	"kind" "tariff_rate_kind" NOT NULL,
	"base" "rate_base" NOT NULL,
	"rate_bps" integer,
	"amount_per_unit_minor" bigint,
	"unit" text,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"in_igv_base" boolean DEFAULT true NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_url" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_run_id" uuid,
	"reviewed_by" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"rate_bps" integer,
	"amount_minor" bigint,
	"currency" "currency" DEFAULT 'PEN' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_url" text NOT NULL,
	"reviewed_by" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" char(2) NOT NULL,
	"agreement_code" text NOT NULL,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"exempt_kinds" text[] NOT NULL,
	"requires_origin_certificate" boolean DEFAULT true NOT NULL,
	"heading_prefix" text DEFAULT '' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_url" text NOT NULL,
	"reviewed_by" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "usage_kind" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone,
	"quotes_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_local_charges" ADD CONSTRAINT "default_local_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_supplier_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."supplier_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_rules" ADD CONSTRAINT "perception_rules_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_cost_lines" ADD CONSTRAINT "quote_cost_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_cost_lines" ADD CONSTRAINT "quote_cost_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_cost_lines" ADD CONSTRAINT "quote_cost_lines_default_charge_id_default_local_charges_id_fk" FOREIGN KEY ("default_charge_id") REFERENCES "public"."default_local_charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_stages" ADD CONSTRAINT "quote_stages_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_stages" ADD CONSTRAINT "quote_stages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_supplier_terms" ADD CONSTRAINT "quote_supplier_terms_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_supplier_terms" ADD CONSTRAINT "quote_supplier_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_tax_breakdown" ADD CONSTRAINT "quote_tax_breakdown_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_tax_breakdown" ADD CONSTRAINT "quote_tax_breakdown_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_import_runs" ADD CONSTRAINT "rule_import_runs_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_tariff_headings" ADD CONSTRAINT "staging_tariff_headings_run_id_rule_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rule_import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging_tariff_rates" ADD CONSTRAINT "staging_tariff_rates_run_id_rule_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rule_import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_headings" ADD CONSTRAINT "tariff_headings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_agreements" ADD CONSTRAINT "trade_agreements_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_calls_user_created_idx" ON "ai_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "default_local_charges_concept_from_uq" ON "default_local_charges" USING btree ("concept_code","valid_from");--> statement-breakpoint
CREATE INDEX "document_images_quote_idx" ON "document_images" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_documents_quote_locale_version_uq" ON "generated_documents" USING btree ("quote_id","locale","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uq" ON "payment_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "perception_rules_uq" ON "perception_rules" USING btree ("condition_code","heading_prefix","effective_from");--> statement-breakpoint
CREATE INDEX "quote_cost_lines_quote_idx" ON "quote_cost_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_lines_quote_idx" ON "quote_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_stages_quote_stage_uq" ON "quote_stages" USING btree ("quote_id","stage_no");--> statement-breakpoint
CREATE INDEX "quote_tax_breakdown_quote_idx" ON "quote_tax_breakdown" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotes_user_created_idx" ON "quotes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "quotes_user_deleted_idx" ON "quotes" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supplier_documents_quote_idx" ON "supplier_documents" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_headings_code_from_uq" ON "tariff_headings" USING btree ("code","effective_from");--> statement-breakpoint
CREATE INDEX "tariff_headings_code_idx" ON "tariff_headings" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_rates_heading_kind_from_uq" ON "tariff_rates" USING btree ("heading_code","kind","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_kind_from_uq" ON "tax_rates" USING btree ("kind","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_agreements_uq" ON "trade_agreements" USING btree ("country_code","agreement_code","heading_prefix","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_user_kind_period_uq" ON "usage_counters" USING btree ("user_id","kind","period_start");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");