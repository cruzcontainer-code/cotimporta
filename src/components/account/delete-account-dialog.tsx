"use client";

import { useRef, useState, useTransition } from "react";
import { type Res, useCopy } from "@/components/quotes/wizard-kit";

const copy = {
  es: {
    open: "Borrar mi cuenta",
    title: "¿Borrar tu cuenta para siempre?",
    body: "Se borrarán tus cotizaciones, archivos y datos. Escribe tu email para confirmar.",
    email: "Tu email",
    cancel: "Cancelar",
    confirm: "Borrar definitivamente",
  },
  en: {
    open: "Delete my account",
    title: "Delete your account forever?",
    body: "Your quotes, files and data will be deleted. Type your email to confirm.",
    email: "Your email",
    cancel: "Cancel",
    confirm: "Delete permanently",
  },
};

type Props = { action: (formData: FormData) => Promise<Res<null>> };

/** Borrado de cuenta confirmado con el email en un <dialog> nativo. */
export function DeleteAccountDialog({ action }: Props) {
  const { t } = useCopy(copy);
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // La sesión ya no existe: carga completa de la portada.
      window.location.assign("/");
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() => dialog.current?.showModal()}
      >
        {t.open}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-account-title"
        className="card m-auto max-w-md backdrop:bg-black/40"
      >
        <form action={confirm} className="flex flex-col gap-4">
          <h2 id="delete-account-title" className="text-lg font-semibold">
            {t.title}
          </h2>
          <p className="text-fg-muted">{t.body}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t.email}</span>
            <input type="email" name="email" required autoComplete="off" className="input" />
          </label>
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
              {t.confirm}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
