import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv, requireEnv } from "@/lib/env";
import { AppError, logger } from "@/server/errors";

// Proveedores de cobro. El driver se elige con PAYMENT_PROVIDER. El driver `izipay` implementa
// exactamente lo registrado en docs/verified/izipay.md (API REST V4 de micuentaweb):
// alta con Charge/CreatePaymentOrder (channelType URL + formAction REGISTER_PAY), renovación con
// Charge/CreateSubscription sobre el token, e IPN firmado con HMAC-SHA-256 del campo kr-answer
// usando la contraseña de la API REST, en hexadecimal, comparado con kr-hash.

export type ProviderName = "fake" | "izipay";
export type Currency = "PEN" | "USD";
export type EventType = "payment.succeeded" | "payment.failed" | "subscription.canceled" | string;

export type CheckoutInput = {
  userId: string;
  planCode: string;
  currency: Currency;
  amountMinor: number;
  orderId: string;
  returnUrl: string;
};

export type VerifiedEvent = {
  externalEventId: string;
  type: EventType;
  userId: string | null;
  planCode: string | null;
  currency: Currency | null;
  amountMinor: number | null;
  occurredAt: Date;
  providerRef: string | null;
  raw: unknown;
};

export interface PaymentProvider {
  name: ProviderName;
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string }>;
  /** Firma sobre el cuerpo crudo; null si no es auténtico o no se entiende. */
  verifyWebhook(rawBody: string, headers: Headers): VerifiedEvent | null;
  cancel(providerRef: string): Promise<void>;
  /**
   * Opcional: tras el primer pago con token, deja programada la renovación mensual.
   * Devuelve la nueva referencia a guardar en subscriptions.provider_ref.
   */
  startRecurring?(event: VerifiedEvent): Promise<string | null>;
}

function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

/** Comparación en tiempo constante de dos firmas hexadecimales. */
function sameSignature(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const isCurrency = (value: unknown): value is Currency => value === "PEN" || value === "USD";

// --- Driver falso (desarrollo y pruebas) -----------------------------------------------------

export type FakeEventBody = {
  id: string;
  type: EventType;
  userId: string;
  planCode: string;
  currency: Currency;
  amountMinor: number;
  occurredAt: string;
  providerRef: string;
};

/** Checkouts pedidos al driver falso (las pruebas leen la moneda y el monto pedidos). */
export const fakeCheckouts: CheckoutInput[] = [];

/** Firma un evento falso como lo haría el proveedor: HMAC-SHA256 hex del cuerpo exacto. */
export function signFakeEvent(rawBody: string): string {
  return hmacHex(requireEnv("FAKE_PAYMENT_WEBHOOK_SECRET"), rawBody);
}

const fakeProvider: PaymentProvider = {
  name: "fake",
  async createCheckout(input) {
    fakeCheckouts.push(input);
    return {
      redirectUrl: `/app/billing?fake_checkout=${encodeURIComponent(input.orderId)}`,
      providerRef: `fake_${input.orderId}`,
    };
  },
  verifyWebhook(rawBody, headers) {
    const expected = signFakeEvent(rawBody);
    if (!sameSignature(expected, headers.get("x-fake-signature"))) return null;
    let body: Partial<FakeEventBody>;
    try {
      body = JSON.parse(rawBody) as Partial<FakeEventBody>;
    } catch {
      return null;
    }
    const occurredAt = new Date(body.occurredAt ?? "");
    if (!body.id || !body.type || Number.isNaN(occurredAt.getTime())) return null;
    return {
      externalEventId: body.id,
      type: body.type,
      userId: body.userId ?? null,
      planCode: body.planCode ?? null,
      currency: isCurrency(body.currency) ? body.currency : null,
      amountMinor: typeof body.amountMinor === "number" ? body.amountMinor : null,
      occurredAt,
      providerRef: body.providerRef ?? null,
      raw: body,
    };
  },
  async cancel() {},
};

// --- Driver Izipay (API REST V4 de micuentaweb) ----------------------------------------------

type IzipayAnswer = {
  orderStatus?: string;
  serverDate?: string;
  orderDetails?: {
    orderId?: string;
    orderTotalAmount?: number;
    orderCurrency?: string;
    metadata?: Record<string, unknown> | null;
  };
  customer?: { reference?: string | null };
  transactions?: {
    uuid?: string;
    status?: string;
    amount?: number;
    currency?: string;
    paymentMethodToken?: string | null;
    creationDate?: string;
    metadata?: Record<string, unknown> | null;
    transactionDetails?: { subscriptionDetails?: { subscriptionId?: string | null } | null };
  }[];
};

async function izipayCall(path: string, body: unknown): Promise<Record<string, unknown>> {
  const base = requireEnv("IZIPAY_API_BASE_URL").replace(/\/$/, "");
  const auth = Buffer.from(
    `${requireEnv("IZIPAY_SHOP_ID")}:${requireEnv("IZIPAY_API_PASSWORD")}`,
  ).toString("base64");
  const response = await fetch(`${base}/api-payment/V4/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => ({}))) as {
    status?: string;
    answer?: Record<string, unknown>;
  };
  if (!response.ok || json.status !== "SUCCESS" || !json.answer) {
    logger.warn("izipay: respuesta no exitosa", {
      path,
      httpStatus: response.status,
      errorCode: json.answer?.errorCode,
    });
    throw new AppError("UPSTREAM_UNAVAILABLE", "El proveedor de pagos no respondió");
  }
  return json.answer;
}

/** providerRef de una suscripción recurrente: "<token>:<subscriptionId>". */
const recurringRef = (token: string, subscriptionId: string) => `${token}:${subscriptionId}`;

const izipayProvider: PaymentProvider = {
  name: "izipay",
  async createCheckout(input) {
    const answer = await izipayCall("Charge/CreatePaymentOrder", {
      amount: input.amountMinor,
      currency: input.currency,
      orderId: input.orderId,
      channelOptions: { channelType: "URL" },
      formAction: "REGISTER_PAY",
      customer: { reference: input.userId },
      metadata: { planCode: input.planCode },
      returnUrl: input.returnUrl,
    });
    const redirectUrl = String(answer.paymentURL ?? "");
    const providerRef = String(answer.paymentOrderId ?? "");
    if (!redirectUrl || !providerRef) {
      throw new AppError("UPSTREAM_UNAVAILABLE", "El proveedor de pagos no devolvió el enlace");
    }
    return { redirectUrl, providerRef };
  },
  verifyWebhook(rawBody) {
    // El IPN llega como application/x-www-form-urlencoded con kr-answer, kr-hash, kr-hash-algorithm.
    const form = new URLSearchParams(rawBody);
    const answerText = form.get("kr-answer");
    if (!answerText || form.get("kr-hash-algorithm") !== "sha256_hmac") return null;
    const expected = hmacHex(requireEnv("IZIPAY_API_PASSWORD"), answerText);
    if (!sameSignature(expected, form.get("kr-hash"))) return null;

    let answer: IzipayAnswer;
    try {
      answer = JSON.parse(answerText) as IzipayAnswer;
    } catch {
      return null;
    }
    const transaction = answer.transactions?.[0];
    if (!transaction?.uuid) return null;
    const occurredAt = new Date(transaction.creationDate ?? answer.serverDate ?? "");
    const metadata = { ...answer.orderDetails?.metadata, ...transaction.metadata };
    const currency = transaction.currency ?? answer.orderDetails?.orderCurrency;
    const subscriptionId = transaction.transactionDetails?.subscriptionDetails?.subscriptionId;
    const token = transaction.paymentMethodToken ?? null;
    return {
      externalEventId: transaction.uuid,
      type:
        answer.orderStatus === "PAID"
          ? "payment.succeeded"
          : answer.orderStatus === "UNPAID"
            ? "payment.failed"
            : `izipay.${answer.orderStatus ?? "unknown"}`,
      userId: answer.customer?.reference ?? null,
      planCode: typeof metadata.planCode === "string" ? metadata.planCode : null,
      currency: isCurrency(currency) ? currency : null,
      amountMinor: transaction.amount ?? answer.orderDetails?.orderTotalAmount ?? null,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      providerRef: token && subscriptionId ? recurringRef(token, subscriptionId) : token,
      raw: answer,
    };
  },
  async cancel(providerRef) {
    const [token, subscriptionId] = providerRef.split(":");
    if (!token || !subscriptionId) return;
    await izipayCall("Subscription/Cancel", { paymentMethodToken: token, subscriptionId });
  },
  async startRecurring(event) {
    // Solo en modo recurrente y solo para el primer pago (token sin suscripción todavía).
    if (getEnv().IZIPAY_MODE !== "recurring") return null;
    const token = event.providerRef;
    if (!token || token.includes(":") || !event.amountMinor || !event.currency) return null;
    const answer = await izipayCall("Charge/CreateSubscription", {
      amount: event.amountMinor,
      currency: event.currency,
      paymentMethodToken: token,
      orderId: `renew-${event.externalEventId}`,
      // Renovación mensual a partir del mes siguiente al pago.
      effectDate: nextMonth(event.occurredAt).toISOString(),
      rrule: "RRULE:FREQ=MONTHLY",
      metadata: { planCode: event.planCode },
    });
    const subscriptionId = String(answer.subscriptionId ?? "");
    return subscriptionId ? recurringRef(token, subscriptionId) : null;
  },
};

/** +1 mes calendario en UTC; si el día no existe (31 → abril), el último día del mes siguiente. */
export function nextMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** Proveedor configurado. Con `name`, solo lo devuelve si coincide con PAYMENT_PROVIDER. */
export function getPaymentProvider(name?: string): PaymentProvider | null {
  const configured = getEnv().PAYMENT_PROVIDER;
  if (!configured) throw new AppError("INTERNAL", "Falta la variable de entorno PAYMENT_PROVIDER");
  if (name !== undefined && name !== configured) return null;
  return configured === "izipay" ? izipayProvider : fakeProvider;
}
