import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { type DocumentActions, DocumentStep } from "@/components/quotes/document-step";
import { QuoteResult } from "@/components/quotes/quote-result";
import { QuoteWizard, type WizardStep } from "@/components/quotes/quote-wizard";
import { EMPTY_SPECS, type Specs } from "@/components/quotes/specs-editor";
import { type Copy, isLocale, type Locale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { extractSpecs, SpecsSchema, saveQuoteSpecs } from "@/server/ai/extract-specs";
import { listDocuments, listImages, moveImage, setImageIncluded } from "@/server/documents/service";
import { AppError, toResult } from "@/server/errors";
import { getQuoteView } from "@/server/quotes/service";
import * as quoteActions from "../actions";

const STEPS = ["producto", "partida", "documento", "costos", "resultado"] as const;
type Step = (typeof STEPS)[number];

const actions = {
  updateProduct: quoteActions.updateProductAction,
  saveItems: quoteActions.saveItemsAction,
  searchHeadings: quoteActions.searchHeadingsAction,
  suggestHeadings: quoteActions.suggestHeadingsAction,
  confirmHeading: quoteActions.confirmHeadingAction,
  saveCostLines: quoteActions.saveCostLinesAction,
  saveSupplierTerms: quoteActions.saveSupplierTermsAction,
  saveFx: quoteActions.saveFxAction,
  calculate: quoteActions.calculateQuoteAction,
};

// Acciones del paso Documento (E3-T2): transporte delgado, el servicio valida y aplica la propiedad.
async function extractAction(quoteId: string, documentId: string) {
  "use server";
  return toResult(async () => extractSpecs(await requireActor(), quoteId, documentId));
}
async function saveSpecsAction(quoteId: string, specs: Specs) {
  "use server";
  return toResult(async () => {
    await saveQuoteSpecs(await requireActor(), quoteId, specs);
  });
}
async function setIncludedAction(quoteId: string, imageId: string, included: boolean) {
  "use server";
  return toResult(async () =>
    setImageIncluded(await requireActor(), quoteId, imageId, included === true),
  );
}
async function moveImageAction(quoteId: string, imageId: string, toPosition: number) {
  "use server";
  return toResult(async () =>
    moveImage(await requireActor(), quoteId, imageId, Number(toPosition)),
  );
}
const documentActions: DocumentActions = {
  extract: extractAction,
  saveSpecs: saveSpecsAction,
  setIncluded: setIncludedAction,
  moveImage: moveImageAction,
};

const copy: Copy<{ nav: string; steps: Record<Step, string> }> = {
  es: {
    nav: "Pasos de la cotización",
    steps: {
      producto: "Producto",
      partida: "Partida",
      documento: "Ficha técnica",
      costos: "Costos y términos",
      resultado: "Resultado",
    },
  },
  en: {
    nav: "Quote steps",
    steps: {
      producto: "Product",
      partida: "Tariff heading",
      documento: "Technical sheet",
      costos: "Costs and terms",
      resultado: "Result",
    },
  },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paso?: string | string[] }>;
};

export default async function QuotePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { paso } = await searchParams;
  const actor = await requireActor();
  const view = await getQuoteView(actor, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const localeValue = await getLocale();
  const locale: Locale = isLocale(localeValue) ? localeValue : "es";
  const t = copy[locale];
  const step: Step = (STEPS as readonly string[]).includes(String(paso))
    ? (paso as Step)
    : "producto";
  const { quote, items, terms } = view;
  const hasFx = Boolean(quote.fxPenPerUsdE4 && quote.fxDate && quote.fxSource);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-fg-muted">{quote.referenceCode}</p>
        <h1 className="text-2xl font-bold tracking-tight">{quote.title}</h1>
        {quote.status === "calculated" && (
          <div className="flex flex-wrap gap-2 pt-2">
            {/* Descarga directa (route handler), no navegación del cliente. */}
            <a className="btn btn-ghost" href={`/api/v1/quotes/${quote.id}/pdf?locale=es`} download>
              Descargar PDF (ES)
            </a>
            <a className="btn btn-ghost" href={`/api/v1/quotes/${quote.id}/pdf?locale=en`} download>
              Download PDF (EN)
            </a>
          </div>
        )}
      </div>
      <nav aria-label={t.nav} className="flex flex-wrap gap-2">
        {STEPS.map((name, index) => (
          <Link
            key={name}
            href={`/app/quotes/${quote.id}?paso=${name}`}
            aria-current={step === name ? "step" : undefined}
            className={`btn ${step === name ? "btn-primary" : "btn-ghost"}`}
          >
            {index + 1}. {t.steps[name]}
          </Link>
        ))}
      </nav>
      {step === "documento" ? (
        <DocumentStep
          quoteId={quote.id}
          documents={(await listDocuments(actor, quote.id)).map(
            ({ id: docId, originalFilename, extractionStatus }) => ({
              id: docId,
              originalFilename,
              extractionStatus,
            }),
          )}
          images={(await listImages(actor, quote.id)).map(
            ({ id: imageId, width, height, included }) => ({
              id: imageId,
              width,
              height,
              included,
            }),
          )}
          specs={SpecsSchema.safeParse(quote.specs).data ?? EMPTY_SPECS}
          actions={documentActions}
        />
      ) : step === "resultado" ? (
        <QuoteResult
          result={view.result}
          rulesAsOf={quote.rulesAsOf}
          unverifiedRules={view.unverifiedRules}
          missing={{
            heading: !quote.tariffHeadingCode,
            items: !items.some((item) => item.totalMinor > 0),
            fx: !hasFx,
            terms: !terms,
          }}
        />
      ) : (
        <QuoteWizard
          step={step satisfies WizardStep}
          quoteId={quote.id}
          actions={actions}
          product={{
            title: quote.title,
            productDescription: quote.productDescription,
            clientName: quote.clientName,
            originCountry: quote.originCountry,
            hasOriginCertificate: quote.hasOriginCertificate,
            importerCondition: quote.importerCondition,
            dutiableUnits: quote.dutiableUnits,
          }}
          items={items.map(({ description, quantity, totalMinor }) => ({
            description,
            quantity,
            totalMinor,
          }))}
          headingCode={quote.tariffHeadingCode}
          costLines={view.costLines.map((line) => ({
            conceptCode: line.conceptCode,
            label: line.label,
            group: line.group,
            origin: line.origin,
            igvApplicable: line.igvApplicable,
            inCif: line.inCif,
            amountMinor: line.amountMinor,
            currency: line.currency,
          }))}
          terms={terms}
          fx={
            hasFx
              ? {
                  penPerUsdE4: quote.fxPenPerUsdE4 ?? 0,
                  date: quote.fxDate ?? "",
                  source: quote.fxSource ?? "",
                }
              : null
          }
          conditions={view.perceptionConditions.map((condition) => ({
            code: condition.conditionCode,
            label: locale === "es" ? condition.descriptionEs : condition.descriptionEn,
          }))}
        />
      )}
    </section>
  );
}
