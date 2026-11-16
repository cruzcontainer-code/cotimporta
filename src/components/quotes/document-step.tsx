"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { type Specs, SpecsEditor } from "@/components/quotes/specs-editor";
import { ErrorAlert, type Res, useCopy } from "@/components/quotes/wizard-kit";

type DocumentInfo = { id: string; originalFilename: string; extractionStatus: string };
type ImageInfo = { id: string; width: number; height: number; included: boolean };
export type DocumentActions = {
  extract: (quoteId: string, documentId: string) => Promise<Res<Specs>>;
  saveSpecs: (quoteId: string, specs: Specs) => Promise<Res>;
  setIncluded: (quoteId: string, imageId: string, included: boolean) => Promise<Res>;
  moveImage: (quoteId: string, imageId: string, toPosition: number) => Promise<Res>;
};

const copy = {
  es: {
    uploadTitle: "Ficha técnica del proveedor (PDF)",
    file: "Archivo PDF (máx. 20 MB)",
    upload: "Subir PDF",
    uploading: "Subiendo y extrayendo fotos…",
    extract: "Extraer con IA",
    extracting: "Consultando…",
    extracted: "Ficha extraída. Revísala y guárdala.",
    saved: "Ficha guardada.",
    status: {
      pending: "pendiente",
      done: "extraída",
      failed: "falló: completa a mano",
      skipped: "omitida",
    },
    manual: "Si no tienes PDF o la IA no está disponible, escribe la ficha a mano.",
    photos: "Fotos del producto",
    noPhotos: "El PDF no trae fotos incrustadas.",
    include: "Incluir en el PDF",
    up: "Subir",
    down: "Bajar",
    editor: "Ficha técnica",
  },
  en: {
    uploadTitle: "Supplier technical sheet (PDF)",
    file: "PDF file (max 20 MB)",
    upload: "Upload PDF",
    uploading: "Uploading and extracting photos…",
    extract: "Extract with AI",
    extracting: "Working…",
    extracted: "Sheet extracted. Review and save it.",
    saved: "Sheet saved.",
    status: {
      pending: "pending",
      done: "extracted",
      failed: "failed: fill in manually",
      skipped: "skipped",
    },
    manual: "If you have no PDF or AI is unavailable, write the sheet manually.",
    photos: "Product photos",
    noPhotos: "The PDF has no embedded photos.",
    include: "Include in the PDF",
    up: "Up",
    down: "Down",
    editor: "Technical sheet",
  },
};

type Props = {
  quoteId: string;
  documents: DocumentInfo[];
  images: ImageInfo[];
  specs: Specs;
  actions: DocumentActions;
};

export function DocumentStep({ quoteId, documents, images, specs, actions }: Props) {
  const { t } = useCopy(copy);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState({ specs, version: 0 });
  // Estado optimista de "Incluir": la casilla cambia al instante; si el servidor falla se revierte.
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const isIncluded = (image: ImageInfo) => included[image.id] ?? image.included;
  const statusText = t.status as Record<string, string>;

  function act<T>(work: () => Promise<Res<T>>, onOk?: (data: T) => void, message?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onOk?.(result.data);
      if (message) setNotice(message);
      router.refresh();
    });
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice(t.uploading);
    act(async () => {
      const response = await fetch(`/api/v1/quotes/${quoteId}/documents`, {
        method: "POST",
        body: form,
      });
      return (await response.json()) as Res;
    });
  }

  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      <form onSubmit={upload} className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.uploadTitle}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.file}</span>
          <input type="file" name="file" accept="application/pdf,.pdf" className="input" required />
        </label>
        <button type="submit" className="btn btn-primary self-start" disabled={pending}>
          {t.upload}
        </button>
        <ul className="flex flex-col gap-2 text-sm">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2"
            >
              <span>
                {doc.originalFilename} ·{" "}
                <span className="badge">
                  {statusText[doc.extractionStatus] ?? doc.extractionStatus}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() =>
                  act(
                    () => actions.extract(quoteId, doc.id),
                    (data) =>
                      setEditor((current) => ({ specs: data, version: current.version + 1 })),
                    t.extracted,
                  )
                }
              >
                {pending ? t.extracting : t.extract}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-sm text-fg-muted">{t.manual}</p>
      </form>

      <p aria-live="polite" className="text-sm text-success">
        {notice}
      </p>
      <ErrorAlert error={error} />

      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.photos}</h2>
        {images.length === 0 && <p className="text-sm text-fg-muted">{t.noPhotos}</p>}
        <ul className="grid gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-2 rounded-md border border-border p-2">
              {/* biome-ignore lint/performance/noImgElement: imagen privada servida por el route handler */}
              <img
                src={`/api/v1/quotes/${quoteId}/documents?image=${image.id}`}
                alt={`${t.photos} ${index + 1}`}
                className="h-32 w-full object-contain"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isIncluded(image)}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIncluded((current) => ({ ...current, [image.id]: next }));
                    act(async () => {
                      const result = await actions.setIncluded(quoteId, image.id, next);
                      if (!result.ok) setIncluded((current) => ({ ...current, [image.id]: !next }));
                      return result;
                    });
                  }}
                />
                {t.include}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pending || index === 0}
                  onClick={() => act(() => actions.moveImage(quoteId, image.id, index - 1))}
                >
                  {t.up}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pending || index === images.length - 1}
                  onClick={() => act(() => actions.moveImage(quoteId, image.id, index + 1))}
                >
                  {t.down}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.editor}</h2>
        <SpecsEditor
          key={editor.version}
          initial={editor.specs}
          pending={pending}
          onSave={(next) => act(() => actions.saveSpecs(quoteId, next), undefined, t.saved)}
        />
      </section>
    </div>
  );
}
