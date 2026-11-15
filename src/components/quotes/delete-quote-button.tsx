"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { type Res, useCopy } from "@/components/quotes/wizard-kit";

const copy = {
  es: {
    delete: "Borrar",
    title: "¿Borrar esta cotización?",
    body: "Dejará de aparecer en tu listado.",
    cancel: "Cancelar",
  },
  en: {
    delete: "Delete",
    title: "Delete this quote?",
    body: "It will no longer appear in your list.",
    cancel: "Cancel",
  },
};

type Props = {
  quoteId: string;
  referenceCode: string;
  action: (formData: FormData) => Promise<Res<null>>;
};

/** Botón de borrado con confirmación en un <dialog> nativo. */
export function DeleteQuoteButton({ quoteId, referenceCode, action }: Props) {
  const { t } = useCopy(copy);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      dialog.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        aria-label={`${t.delete} ${referenceCode}`}
        onClick={() => dialog.current?.showModal()}
      >
        {t.delete}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`delete-${quoteId}`}
        className="card m-auto max-w-sm backdrop:bg-black/40"
      >
        <form action={confirm} className="flex flex-col gap-4">
          <input type="hidden" name="quoteId" value={quoteId} />
          <h2 id={`delete-${quoteId}`} className="text-lg font-semibold">
            {t.title}
          </h2>
          <p className="text-fg-muted">
            {referenceCode} · {t.body}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>
              {t.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {t.delete}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
