import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { type Copy, isLocale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { requireAdmin } from "@/server/authz";
import { AppError, toResult } from "@/server/errors";
import {
  csvAdapter,
  discardRun,
  getRunDiff,
  listRuns,
  publishRun,
  runImport,
} from "@/server/rules/import";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

/** Sube un CSV y lo deja en staging; nunca publica. */
async function uploadCsv(formData: FormData): Promise<void> {
  "use server";
  const file = formData.get("file");
  const result = await toResult(async () => {
    const actor = await requireActor();
    if (!(file instanceof File) || file.size === 0)
      throw new AppError("VALIDATION", "Elige un archivo CSV");
    if (file.size > MAX_CSV_BYTES) throw new AppError("VALIDATION", "El CSV supera 5 MB");
    // Solo admins: runImport no recibe actor, así que se comprueba antes de crear la corrida
    // (una server action se puede invocar sin pasar por el layout admin).
    requireAdmin(actor);
    return runImport({
      adapter: csvAdapter(await file.text(), file.name),
      source: "csv",
      triggeredBy: actor.userId,
    });
  });
  redirect(
    result.ok
      ? `/admin/rules?run=${result.data.id}`
      : `/admin/rules?error=${encodeURIComponent(result.error.message)}`,
  );
}

async function decide(formData: FormData): Promise<void> {
  "use server";
  const runId = String(formData.get("runId") ?? "");
  const publish = formData.get("decision") === "publish";
  const result = await toResult(async () => {
    const actor = await requireActor();
    if (publish) await publishRun(actor, runId);
    else await discardRun(actor, runId);
  });
  redirect(
    result.ok
      ? `/admin/rules?run=${runId}`
      : `/admin/rules?run=${runId}&error=${encodeURIComponent(result.error.message)}`,
  );
}

type RulesCopy = {
  title: string;
  upload: string;
  file: string;
  send: string;
  runs: string;
  empty: string;
  head: [string, string, string, string, string, string];
  view: string;
  diff: string;
  diffHead: [string, string, string, string, string, string];
  publish: string;
  discard: string;
  note: string;
};

const copy: Copy<RulesCopy> = {
  es: {
    title: "Reglas arancelarias",
    upload: "Importar CSV",
    file: "Archivo CSV (formato de §4: una fila por derecho)",
    send: "Subir y comparar",
    runs: "Corridas",
    empty: "No hay corridas",
    head: ["Inicio", "Origen", "Estado", "Filas", "Cambios", "Error"],
    view: "Ver",
    diff: "Diferencias de la corrida",
    diffHead: ["Cambio", "Partida", "Derecho", "Base", "Tasa (bps)", "Vigente desde"],
    publish: "Publicar",
    discard: "Descartar",
    note: "Publicar copia estas filas a las reglas vigentes y cierra la versión anterior. Nada se publica solo.",
  },
  en: {
    title: "Tariff rules",
    upload: "Import CSV",
    file: "CSV file (§4 format: one row per duty)",
    send: "Upload and compare",
    runs: "Runs",
    empty: "No runs yet",
    head: ["Started", "Source", "Status", "Rows", "Changes", "Error"],
    view: "View",
    diff: "Run differences",
    diffHead: ["Change", "Heading", "Duty", "Base", "Rate (bps)", "Valid from"],
    publish: "Publish",
    discard: "Discard",
    note: "Publishing copies these rows to the rules in force and closes the previous version. Nothing is published automatically.",
  },
};

type Summary = { added: number; changed: number; removed: number; unchanged: number } | null;

type Props = { searchParams: Promise<{ run?: string; error?: string }> };

export default async function RulesPage({ searchParams }: Props) {
  const { run: runId, error } = await searchParams;
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];
  const actor = await requireActor();
  const runs = await listRuns(actor);
  const selected = runs.find((run) => run.id === runId);
  const diff = selected ? await getRunDiff(actor, selected.id) : [];

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <form action={uploadCsv} className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.upload}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.file}</span>
          <input type="file" name="file" accept=".csv,text/csv" className="input" required />
        </label>
        <button type="submit" className="btn btn-primary self-start">
          {t.send}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.runs}</h2>
        {runs.length === 0 ? (
          <p className="text-fg-muted">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base text-sm">
              <thead>
                <tr>
                  {[...t.head, ""].map((head) => (
                    <th key={head} className="py-2 pr-3 text-left">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const summary = run.diffSummary as Summary;
                  return (
                    <tr key={run.id} className="border-t border-border">
                      <td className="py-2 pr-3">
                        {run.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="py-2 pr-3">{run.source}</td>
                      <td className="py-2 pr-3">
                        <span className="badge">{run.status}</span>
                      </td>
                      <td className="py-2 pr-3">{run.rowsStaged}</td>
                      <td className="py-2 pr-3">
                        {summary
                          ? `+${summary.added} ~${summary.changed} −${summary.removed} =${summary.unchanged}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3">{run.error ?? ""}</td>
                      <td className="py-2">
                        <Link href={`/admin/rules?run=${run.id}`}>{t.view}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.diff}</h2>
          <div className="overflow-x-auto">
            <table className="table-base text-sm">
              <thead>
                <tr>
                  {t.diffHead.map((head) => (
                    <th key={head} className="py-2 pr-3 text-left">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diff.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <span className="badge">{row.change}</span>
                    </td>
                    <td className="py-2 pr-3">{row.headingCode}</td>
                    <td className="py-2 pr-3">{row.kind}</td>
                    <td className="py-2 pr-3">{row.base}</td>
                    <td className="py-2 pr-3">{row.rateBps ?? row.amountPerUnitMinor ?? "—"}</td>
                    <td className="py-2 pr-3">{row.effectiveFrom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected.status === "staged" && (
            <form action={decide} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="runId" value={selected.id} />
              <button type="submit" name="decision" value="publish" className="btn btn-primary">
                {t.publish}
              </button>
              <button type="submit" name="decision" value="discard" className="btn btn-ghost">
                {t.discard}
              </button>
              <span className="text-sm text-fg-muted">{t.note}</span>
            </form>
          )}
        </section>
      )}
    </section>
  );
}
