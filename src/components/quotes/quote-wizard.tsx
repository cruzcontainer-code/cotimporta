import { CostsStep } from "@/components/quotes/costs-step";
import { HeadingStep } from "@/components/quotes/heading-step";
import { ProductStep } from "@/components/quotes/product-step";
import type { Fx, Item, Line, Product, Terms, WizardActions } from "@/components/quotes/wizard-kit";

export type { WizardActions } from "@/components/quotes/wizard-kit";
export type WizardStep = "producto" | "partida" | "costos";

type Props = {
  step: WizardStep;
  quoteId: string;
  product: Product;
  items: Item[];
  headingCode: string | null;
  costLines: Line[];
  terms: Terms | null;
  fx: Fx | null;
  conditions: { code: string; label: string }[];
  actions: WizardActions;
};

/** Asistente de cotización: cada paso es una hoja cliente; el resultado lo pinta la página. */
export function QuoteWizard({ step, quoteId, actions, ...data }: Props) {
  if (step === "producto") {
    return (
      <ProductStep quoteId={quoteId} actions={actions} product={data.product} items={data.items} />
    );
  }
  if (step === "partida") {
    return <HeadingStep quoteId={quoteId} actions={actions} headingCode={data.headingCode} />;
  }
  return (
    <CostsStep
      quoteId={quoteId}
      actions={actions}
      product={data.product}
      costLines={data.costLines}
      terms={data.terms}
      fx={data.fx}
      conditions={data.conditions}
    />
  );
}
