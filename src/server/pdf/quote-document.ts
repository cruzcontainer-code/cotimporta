import {
  Document,
  type DocumentProps,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { createElement as h, type ReactElement, type ReactNode } from "react";
import type { Copy } from "@/i18n/messages";
import { formatPen, formatUsd } from "@/lib/engine/money";
import type { EngineResult, RuleRef, Stage, TaxLine } from "@/lib/engine/types";
import type { Specs } from "@/server/ai/extract-specs";
import type { Narrative } from "@/server/ai/narrative";

// PDF formal de la cotización (A4, Helvetica), modelado sobre reference/cotizacion-bg880-ejemplo.pdf.
// Sin JSX: React.createElement. Todos los montos salen del motor (formatUsd/formatPen), nunca de la IA.
// Helvetica estándar solo cubre WinAnsi: los textos fijos evitan flechas y casillas Unicode.

export type QuotePdfData = {
  referenceCode: string;
  title: string;
  productDescription: string;
  clientName: string;
  calculatedAt: Date;
  validityDays: number;
  fx: { penPerUsdE4: number; date: string; source: string };
  rulesAsOf: string;
  headingCode: string | null;
  advanceBps: number;
  result: EngineResult;
  snapshot: RuleRef[];
  specs: Specs;
  images: Uint8Array[];
  narrative: Narrative | null;
  costLines: { conceptCode: string; label: string }[];
  logo: Uint8Array | null;
};

type Locale = "es" | "en";

const NAVY = "#0F172A";
const MUTED = "#475569";
const LINE = "#CBD5E1";
const SOFT = "#F1F5F9";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: NAVY,
    paddingTop: 36,
    paddingBottom: 54,
    paddingHorizontal: 40,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  wordmark: { fontFamily: "Helvetica-Bold", fontSize: 18, color: NAVY },
  logo: { width: 110, height: 36, objectFit: "contain" },
  headRight: { alignItems: "flex-end", maxWidth: 300 },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 0.5 },
  product: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 2, textAlign: "right" },
  meta: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  rule: { borderBottomWidth: 2, borderBottomColor: NAVY, marginTop: 10, marginBottom: 10 },
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { fontFamily: "Helvetica-Bold", width: 110 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 3,
  },
  headRow: { flexDirection: "row", backgroundColor: NAVY, color: "#FFFFFF", paddingVertical: 4 },
  totalRow: { flexDirection: "row", backgroundColor: SOFT, paddingVertical: 5 },
  bold: { fontFamily: "Helvetica-Bold" },
  cell: { paddingHorizontal: 4 },
  right: { textAlign: "right" },
  muted: { color: MUTED },
  small: { fontSize: 7.5 },
  twoCols: { flexDirection: "row", flexWrap: "wrap" },
  check: { width: "50%", flexDirection: "row", marginBottom: 3, paddingRight: 8 },
  stageCard: {
    flexDirection: "row",
    borderWidth: 0.75,
    borderColor: LINE,
    borderRadius: 4,
    padding: 6,
    marginBottom: 5,
  },
  stageNo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: NAVY,
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 5,
    marginRight: 8,
  },
  stageBody: { flex: 1, paddingRight: 8 },
  stageAmount: { width: 95, alignItems: "flex-end" },
  note: { backgroundColor: SOFT, padding: 6, marginTop: 4, fontSize: 8 },
  photos: { flexDirection: "row", flexWrap: "wrap" },
  photo: { width: "31%", height: 120, objectFit: "contain", margin: "1%" },
  auxTitle: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 36 },
  signature: { width: "42%", borderTopWidth: 0.75, borderTopColor: NAVY, paddingTop: 4 },
  disclaimer: {
    marginTop: 14,
    padding: 6,
    borderWidth: 0.75,
    borderColor: NAVY,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 4,
  },
});

type Texts = {
  title: string;
  date: string;
  validity: (days: number) => string;
  fx: string;
  perUsd: string;
  attention: string;
  product: string;
  s1: string;
  concept: string;
  amountUsd: string;
  amountPen: string;
  summary: { label: string; hint: string }[];
  total: string;
  s2: string;
  s3: string;
  stageTitle: (stage: Stage, advancePct: number) => string;
  stageText: (stage: Stage) => string;
  approval: string;
  inTransit: string;
  stageNote: string;
  s4: string;
  s5: string;
  componentCols: [string, string, string, string];
  s6: string;
  s7: string;
  s8: string;
  acceptedBy: string;
  clientSignature: string;
  issuedBy: string;
  advisor: string;
  heading: string;
  adValorem: string;
  breakdown: string;
  breakdownCols: [string, string, string, string, string];
  sources: string;
  narrative: string;
  concepts: string;
  stagesLabel: string;
  disclaimer: (rulesAsOf: string) => string;
  page: (n: number, total: number) => string;
  footer: string;
  empty: string;
  days: (min: number | null, max: number | null) => string;
};

const days = (word: string) => (min: number | null, max: number | null) =>
  min === null ? "" : min === max ? `${min} ${word}` : `${min}-${max} ${word}`;

const copy: Copy<Texts> = {
  es: {
    title: "PROPUESTA DE INVERSIÓN",
    date: "Fecha",
    validity: (n) => `Validez: ${n} días calendarios`,
    fx: "T.C. Ref.",
    perUsd: "por USD",
    attention: "Atención:",
    product: "Producto:",
    s1: "1. RESUMEN DE ESTRUCTURA DE INVERSIÓN",
    concept: "Concepto / Componente",
    amountUsd: "Monto (USD $)",
    amountPen: "Monto Equiv. (PEN S/)",
    summary: [
      { label: "Factura FOB", hint: "Valor de la mercadería en origen" },
      { label: "Monto Logístico + Destino", hint: "Flete, seguro y gastos locales" },
      { label: "IGV Compra (Impuestos Aduana)", hint: "Aranceles y tributos de importación" },
      { label: "Percepción SUNAT", hint: "Según condición tributaria del importador" },
      { label: "Gestión Comercial y Despacho", hint: "Trámite aduanero, liberación y entrega" },
    ],
    total: "INVERSIÓN TOTAL ESTIMADA",
    s2: "2. EQUIPAMIENTO INCLUIDO EN EL PAQUETE",
    s3: "3. CRONOGRAMA FINANCIERO Y FLUJO DE PAGOS POR ETAPAS",
    stageTitle: (stage, pct) =>
      ({
        advance: `Inicio de Orden y Producción (Adelanto ${pct}%)`,
        production: `Fabricación y Testeo (${days("días")(stage.daysMin, stage.daysMax)})`,
        balance: `Aprobación y Cancelación de Saldo (${100 - pct}%)`,
        transit: `Tránsito Internacional (${days("días")(stage.daysMin, stage.daysMax)})`,
        logistics_taxes: "Pagos Logísticos e Impuestos (antes del arribo)",
        management: "Liberación Aduanera, Gestión y Entrega Final",
      })[stage.kind],
    stageText: (stage) =>
      ({
        advance: "Pago del adelanto sobre la factura del proveedor al confirmar la orden.",
        production:
          "El proveedor fabrica y prueba el equipo; se envían fotos y video para su visto bueno.",
        balance: "Con el visto bueno se cancela el saldo de la factura y se coordina el embarque.",
        transit: "Transporte internacional desde el puerto de origen hasta el Perú.",
        logistics_taxes:
          "Se pagan los montos logísticos y los tributos de importación para la aduana.",
        management: "Pago final de la gestión tras la liberación aduanera y la entrega.",
      })[stage.kind],
    approval: "Visto Bueno / OK",
    inTransit: "En Tránsito",
    stageNote:
      "Nota sobre el flujo de pagos: los pagos siguen hitos de avance real. Los montos logísticos e impuestos no se desembolsan hasta poco antes de la llegada de la carga.",
    s4: "4. ESPECIFICACIONES TÉCNICAS",
    s5: "5. COMPONENTES PRINCIPALES Y MARCAS",
    componentCols: ["Componente", "Marca", "Origen", "Nota"],
    s6: "6. FICHA TÉCNICA DE EQUIPOS AUXILIARES",
    s7: "7. FOTOS DEL PRODUCTO",
    s8: "8. TÉRMINOS COMERCIALES, GARANTÍA Y SOPORTE",
    acceptedBy: "Aceptado y Conforme por el Cliente:",
    clientSignature: "Firma y Sello del Cliente / Empresa",
    issuedBy: "Emitido por el Departamento Comercial:",
    advisor: "Asesor Comercial & Comercio Exterior",
    heading: "Partida arancelaria aplicada",
    adValorem: "Ad valorem",
    breakdown: "Desglose tributario",
    breakdownCols: ["Tributo", "Base (USD)", "Tasa", "Monto (USD)", "Fuente"],
    sources: "Fuentes de las reglas",
    narrative: "Explicación de la cotización",
    concepts: "Conceptos",
    stagesLabel: "Etapas",
    disclaimer: (asOf) =>
      `Estimación referencial. No es una liquidación oficial de aduanas. Reglas vigentes al ${asOf}.`,
    page: (n, total) => `Página ${n} de ${total}`,
    footer: "Cotización Comercial",
    empty: "Sin datos registrados.",
    days: days("días"),
  },
  en: {
    title: "INVESTMENT PROPOSAL",
    date: "Date",
    validity: (n) => `Validity: ${n} calendar days`,
    fx: "FX Ref.",
    perUsd: "per USD",
    attention: "Attention:",
    product: "Product:",
    s1: "1. INVESTMENT STRUCTURE SUMMARY",
    concept: "Concept / Component",
    amountUsd: "Amount (USD $)",
    amountPen: "Equiv. Amount (PEN S/)",
    summary: [
      { label: "FOB Invoice", hint: "Value of the goods at origin" },
      { label: "Logistics + Destination", hint: "Freight, insurance and local charges" },
      { label: "Purchase VAT (Customs Taxes)", hint: "Import duties and taxes" },
      { label: "SUNAT Perception", hint: "Depends on the importer's tax status" },
      { label: "Commercial Management and Clearance", hint: "Customs, release and delivery" },
    ],
    total: "TOTAL ESTIMATED INVESTMENT",
    s2: "2. EQUIPMENT INCLUDED IN THE PACKAGE",
    s3: "3. FINANCIAL SCHEDULE AND PAYMENT FLOW BY STAGE",
    stageTitle: (stage, pct) =>
      ({
        advance: `Order Start and Production (${pct}% Advance)`,
        production: `Manufacturing and Testing (${days("days")(stage.daysMin, stage.daysMax)})`,
        balance: `Approval and Balance Payment (${100 - pct}%)`,
        transit: `International Transit (${days("days")(stage.daysMin, stage.daysMax)})`,
        logistics_taxes: "Logistics and Tax Payments (before arrival)",
        management: "Customs Release, Management and Final Delivery",
      })[stage.kind],
    stageText: (stage) =>
      ({
        advance: "Advance payment on the supplier invoice when the order is confirmed.",
        production:
          "The supplier builds and tests the equipment; photos and video are sent for approval.",
        balance: "After approval, the invoice balance is paid and shipping is arranged.",
        transit: "International transport from the port of origin to Peru.",
        logistics_taxes: "Logistics amounts and import taxes are paid for customs.",
        management: "Final management payment after customs release and delivery.",
      })[stage.kind],
    approval: "Approval / OK",
    inTransit: "In Transit",
    stageNote:
      "Payment flow note: payments follow real progress milestones. Logistics amounts and taxes are not paid until shortly before the cargo arrives.",
    s4: "4. TECHNICAL SPECIFICATIONS",
    s5: "5. MAIN COMPONENTS AND BRANDS",
    componentCols: ["Component", "Brand", "Origin", "Note"],
    s6: "6. AUXILIARY EQUIPMENT DATA SHEETS",
    s7: "7. PRODUCT PHOTOS",
    s8: "8. COMMERCIAL TERMS, WARRANTY AND SUPPORT",
    acceptedBy: "Accepted and Agreed by the Client:",
    clientSignature: "Client / Company Signature and Seal",
    issuedBy: "Issued by the Commercial Department:",
    advisor: "Commercial & Foreign Trade Advisor",
    heading: "Applied tariff heading",
    adValorem: "Ad valorem",
    breakdown: "Tax breakdown",
    breakdownCols: ["Tax", "Base (USD)", "Rate", "Amount (USD)", "Source"],
    sources: "Rule sources",
    narrative: "Quote explanation",
    concepts: "Concepts",
    stagesLabel: "Stages",
    disclaimer: (asOf) =>
      `Reference estimate. Not an official customs assessment. Rules in force as of ${asOf}.`,
    page: (n, total) => `Page ${n} of ${total}`,
    footer: "Commercial Quote",
    empty: "No data recorded.",
    days: days("days"),
  },
};

const pct = (bps: number | null) => (bps === null ? "-" : `${(bps / 100).toFixed(2)}%`);

function section(title: string, ...children: ReactNode[]): ReactElement {
  return h(
    View,
    { style: styles.section },
    h(Text, { style: styles.sectionTitle }, title),
    ...children,
  );
}

function table(
  widths: string[],
  head: string[] | null,
  rows: string[][],
  alignRight: number[] = [],
): ReactElement {
  const cells = (values: string[], bold = false) =>
    values.map((value, index) =>
      h(
        Text,
        {
          key: String(index),
          style: [
            styles.cell,
            { width: widths[index] ?? "auto" },
            ...(alignRight.includes(index) ? [styles.right] : []),
            ...(bold ? [styles.bold] : []),
          ],
        },
        value,
      ),
    );
  return h(
    View,
    null,
    head ? h(View, { style: styles.headRow, fixed: false }, ...cells(head, true)) : null,
    ...rows.map((values, index) =>
      h(View, { key: String(index), style: styles.row, wrap: false }, ...cells(values)),
    ),
  );
}

function header(data: QuotePdfData, t: Texts, locale: Locale): ReactElement {
  const date = new Intl.DateTimeFormat(locale === "es" ? "es-PE" : "en-US", {
    dateStyle: "long",
    timeZone: "America/Lima",
  }).format(data.calculatedAt);
  const rate = (data.fx.penPerUsdE4 / 10_000).toFixed(4);
  const brand = data.logo
    ? h(Image, { style: styles.logo, src: { data: Buffer.from(data.logo), format: "png" } })
    : h(Text, { style: styles.wordmark }, "Cotimporta");
  const product = data.specs.productName || data.title;
  return h(
    View,
    null,
    h(
      View,
      { style: styles.header },
      brand,
      h(
        View,
        { style: styles.headRight },
        h(Text, { style: styles.docTitle }, t.title),
        h(Text, { style: styles.product }, product.toUpperCase()),
        h(Text, { style: [styles.meta, styles.bold] }, data.referenceCode),
        h(Text, { style: styles.meta }, `${t.date}: ${date}`),
        h(Text, { style: styles.meta }, t.validity(data.validityDays)),
        h(
          Text,
          { style: styles.meta },
          `${t.fx}: S/ ${rate} ${t.perUsd} (${data.fx.date}, ${data.fx.source})`,
        ),
      ),
    ),
    h(View, { style: styles.rule }),
    data.clientName
      ? h(
          View,
          { style: styles.infoRow },
          h(Text, { style: styles.infoLabel }, t.attention),
          h(Text, null, data.clientName),
        )
      : null,
    data.productDescription
      ? h(
          View,
          { style: styles.infoRow },
          h(Text, { style: styles.infoLabel }, t.product),
          h(Text, { style: { flex: 1 } }, data.productDescription),
        )
      : null,
  );
}

function summary(data: QuotePdfData, t: Texts): ReactElement {
  const r = data.result;
  const amounts: [number, number][] = [
    [r.fobMinor, r.pen.fobMinor],
    [r.logisticMinor, r.pen.logisticMinor],
    [r.purchaseTaxesMinor, r.pen.purchaseTaxesMinor],
    [r.perceptionMinor, r.pen.perceptionMinor],
    [r.managementFeeMinor, r.pen.managementFeeMinor],
  ];
  const widths = ["56%", "22%", "22%"];
  return section(
    t.s1,
    table(
      widths,
      [t.concept, t.amountUsd, t.amountPen],
      t.summary.map((line, index) => {
        const [usd, pen] = amounts[index] ?? [0, 0];
        return [`${line.label}: ${line.hint}`, formatUsd(usd), formatPen(pen)];
      }),
      [1, 2],
    ),
    h(
      View,
      { style: styles.totalRow, wrap: false },
      h(Text, { style: [styles.cell, styles.bold, { width: widths[0] }] }, t.total),
      h(
        Text,
        { style: [styles.cell, styles.bold, styles.right, { width: widths[1] }] },
        formatUsd(r.totalMinor),
      ),
      h(
        Text,
        { style: [styles.cell, styles.bold, styles.right, { width: widths[2] }] },
        formatPen(r.pen.totalMinor),
      ),
    ),
  );
}

function equipment(data: QuotePdfData, t: Texts): ReactElement {
  const list = data.specs.equipment;
  return section(
    t.s2,
    list.length
      ? h(
          View,
          { style: styles.twoCols },
          ...list.map((item, index) =>
            h(
              View,
              { key: String(index), style: styles.check },
              h(Text, { style: [styles.bold, { marginRight: 4 }] }, "•"),
              h(Text, null, `${item.quantity > 1 ? `${item.quantity} x ` : ""}${item.name}`),
            ),
          ),
        )
      : h(Text, { style: styles.muted }, t.empty),
  );
}

function schedule(data: QuotePdfData, t: Texts): ReactElement {
  const advancePct = Math.round(data.advanceBps / 100);
  return section(
    t.s3,
    ...data.result.stages.map((stage) => {
      const status =
        stage.kind === "production" ? t.approval : stage.kind === "transit" ? t.inTransit : null;
      const amount =
        stage.amountMinor === 0 && status
          ? [h(Text, { key: "s", style: styles.bold }, status)]
          : [
              h(Text, { key: "u", style: styles.bold }, formatUsd(stage.amountMinor)),
              h(Text, { key: "p", style: styles.muted }, formatPen(stage.amountPenMinor)),
            ];
      return h(
        View,
        { key: String(stage.stageNo), style: styles.stageCard, wrap: false },
        h(Text, { style: styles.stageNo }, String(stage.stageNo)),
        h(
          View,
          { style: styles.stageBody },
          h(Text, { style: styles.bold }, t.stageTitle(stage, advancePct)),
          h(Text, { style: styles.muted }, t.stageText(stage)),
          data.narrative?.stages[String(stage.stageNo) as "1"]
            ? h(Text, { style: styles.small }, data.narrative.stages[String(stage.stageNo) as "1"])
            : null,
        ),
        h(View, { style: styles.stageAmount }, ...amount),
      );
    }),
    h(Text, { style: styles.note }, t.stageNote),
  );
}

function specifications(data: QuotePdfData, t: Texts): ReactElement {
  const { specs } = data;
  return section(
    t.s4,
    specs.summary ? h(Text, { style: { marginBottom: 6 } }, specs.summary) : null,
    ...(specs.specGroups.length
      ? specs.specGroups.map((group, index) =>
          h(
            View,
            { key: String(index), style: { marginBottom: 6 } },
            group.title
              ? h(Text, { style: [styles.bold, { marginBottom: 2 }] }, group.title)
              : null,
            table(
              ["45%", "55%"],
              null,
              group.rows.map((row) => [row.label, row.value]),
            ),
          ),
        )
      : [h(Text, { key: "e", style: styles.muted }, t.empty)]),
  );
}

function components(data: QuotePdfData, t: Texts): ReactElement {
  const list = data.specs.components;
  return section(
    t.s5,
    list.length
      ? table(
          ["30%", "22%", "22%", "26%"],
          t.componentCols,
          list.map((c) => [c.component, c.brand, c.origin, c.note]),
        )
      : h(Text, { style: styles.muted }, t.empty),
  );
}

function auxiliaries(data: QuotePdfData, t: Texts): ReactElement {
  const list = data.specs.auxiliaries;
  return section(
    t.s6,
    ...(list.length
      ? list.map((aux, index) =>
          h(
            View,
            { key: String(index), wrap: false, style: { marginBottom: 6 } },
            h(
              View,
              { style: styles.auxTitle },
              h(Text, { style: styles.bold }, aux.name),
              h(Text, { style: styles.muted }, aux.model),
            ),
            table(
              ["45%", "55%"],
              null,
              aux.rows.map((row) => [row.label, row.value]),
            ),
          ),
        )
      : [h(Text, { key: "e", style: styles.muted }, t.empty)]),
  );
}

function photos(data: QuotePdfData, t: Texts): ReactElement | null {
  if (data.images.length === 0) return null;
  return section(
    t.s7,
    h(
      View,
      { style: styles.photos },
      ...data.images.map((bytes, index) =>
        h(Image, {
          key: String(index),
          style: styles.photo,
          src: { data: Buffer.from(bytes), format: "png" },
        }),
      ),
    ),
  );
}

function terms(data: QuotePdfData, t: Texts): ReactElement {
  const list = data.specs.warranty;
  return section(
    t.s8,
    ...(list.length
      ? list.map((item, index) =>
          h(
            View,
            { key: String(index), style: styles.infoRow },
            h(Text, { style: [styles.infoLabel, { width: 140 }] }, `${item.title}:`),
            h(Text, { style: { flex: 1 } }, item.text),
          ),
        )
      : [h(Text, { key: "e", style: styles.muted }, t.empty)]),
    h(
      View,
      { style: styles.signatures, wrap: false },
      h(
        View,
        { style: { width: "42%" } },
        h(Text, { style: [styles.bold, { marginBottom: 30 }] }, t.acceptedBy),
        h(Text, { style: styles.signature }, t.clientSignature),
      ),
      h(
        View,
        { style: { width: "42%" } },
        h(Text, { style: [styles.bold, { marginBottom: 30 }] }, t.issuedBy),
        h(Text, { style: styles.signature }, t.advisor),
      ),
    ),
  );
}

const TAX_NAMES: Copy<Record<TaxLine["component"], string> & { exempt: string }> = {
  es: {
    ad_valorem: "Ad valorem",
    sobretasa: "Sobretasa",
    antidumping: "Antidumping",
    derecho_especifico: "Derecho específico",
    isc: "ISC",
    igv: "IGV",
    ipm: "IPM",
    tasa_despacho: "Tasa de despacho",
    percepcion: "Percepción",
    exempt: "exonerado",
  },
  en: {
    ad_valorem: "Ad valorem",
    sobretasa: "Surcharge",
    antidumping: "Antidumping",
    derecho_especifico: "Specific duty",
    isc: "Excise tax (ISC)",
    igv: "VAT (IGV)",
    ipm: "Municipal tax (IPM)",
    tasa_despacho: "Dispatch fee",
    percepcion: "Perception",
    exempt: "exempt",
  },
};

function taxRow(line: TaxLine, locale: Locale): string[] {
  const names = TAX_NAMES[locale];
  return [
    names[line.component] + (line.exempted ? ` (${names.exempt})` : ""),
    line.component === "tasa_despacho" ? "-" : formatUsd(line.baseMinor),
    pct(line.rateBps),
    formatUsd(line.amountMinor),
    line.rule?.sourceUrl ?? "-",
  ];
}

function rulesAndBreakdown(data: QuotePdfData, t: Texts, locale: Locale): ReactElement {
  const adValorem = data.result.taxLines.find((line) => line.component === "ad_valorem");
  return h(
    View,
    { style: styles.section, break: true },
    h(Text, { style: styles.sectionTitle }, `${t.heading}: ${data.headingCode ?? "-"}`),
    h(Text, null, `${t.adValorem}: ${pct(adValorem?.rateBps ?? null)}`),
    h(Text, { style: [styles.bold, { marginTop: 8, marginBottom: 3 }] }, t.breakdown),
    table(
      ["20%", "16%", "12%", "16%", "36%"],
      t.breakdownCols,
      data.result.taxLines.map((line) => taxRow(line, locale)),
      [1, 2, 3],
    ),
    h(Text, { style: [styles.bold, { marginTop: 8, marginBottom: 3 }] }, t.sources),
    table(
      ["26%", "16%", "58%"],
      null,
      data.snapshot.map((ref) => [ref.table, ref.effectiveFrom, ref.sourceUrl]),
    ),
  );
}

function narrative(data: QuotePdfData, t: Texts): ReactElement | null {
  const story = data.narrative;
  if (!story) return null;
  const labels = new Map(data.costLines.map((line) => [line.conceptCode, line.label]));
  return section(
    t.narrative,
    ...Object.entries(story.concepts).map(([code, text]) =>
      h(
        View,
        { key: code, style: styles.infoRow, wrap: false },
        h(Text, { style: [styles.infoLabel, { width: 140 }] }, labels.get(code) ?? code),
        h(Text, { style: { flex: 1 } }, text),
      ),
    ),
  );
}

/** Documento completo para un locale. */
export function quoteDocument(data: QuotePdfData, locale: Locale): ReactElement<DocumentProps> {
  const t = copy[locale];
  return h(
    Document,
    { title: `${data.referenceCode} - ${t.title}`, author: "Cotimporta", language: locale },
    h(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      header(data, t, locale),
      summary(data, t),
      equipment(data, t),
      schedule(data, t),
      specifications(data, t),
      components(data, t),
      auxiliaries(data, t),
      photos(data, t),
      terms(data, t),
      rulesAndBreakdown(data, t, locale),
      narrative(data, t),
      h(Text, { style: styles.disclaimer, wrap: false }, t.disclaimer(data.rulesAsOf)),
      h(
        View,
        { style: styles.footer, fixed: true },
        h(Text, null, `${t.footer} - ${data.referenceCode}`),
        h(Text, { render: ({ pageNumber, totalPages }) => t.page(pageNumber, totalPages) }),
      ),
    ),
  );
}
