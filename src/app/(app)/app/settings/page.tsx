import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { type Copy, isLocale, type Locale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { deleteAccount, getPreferences, updatePreferences } from "@/server/account/service";
import { type Result, toResult } from "@/server/errors";

export const dynamic = "force-dynamic";

const COUNTRIES = ["PE", "CL", "CO", "EC", "BO", "MX", "AR", "US", "ES"] as const;

type Texts = {
  title: string;
  preferences: string;
  language: string;
  country: string;
  countryHint: string;
  save: string;
  saved: string;
  invalid: string;
  data: string;
  dataBody: string;
  export: string;
  danger: string;
  dangerBody: string;
  countries: Record<(typeof COUNTRIES)[number], string>;
};

const copy: Copy<Texts> = {
  es: {
    title: "Ajustes",
    preferences: "Preferencias",
    language: "Idioma",
    country: "País",
    countryHint: "Perú cobra el plan en soles; otros países, en dólares.",
    save: "Guardar",
    saved: "Preferencias guardadas.",
    invalid: "Revisa el idioma y el país.",
    data: "Tus datos",
    dataBody: "Descarga un archivo JSON con tu perfil, cotizaciones y la lista de tus archivos.",
    export: "Exportar mis datos",
    danger: "Borrar cuenta",
    dangerBody: "Borra tu cuenta, tus cotizaciones y tus archivos. No se puede deshacer.",
    countries: {
      PE: "Perú",
      CL: "Chile",
      CO: "Colombia",
      EC: "Ecuador",
      BO: "Bolivia",
      MX: "México",
      AR: "Argentina",
      US: "Estados Unidos",
      ES: "España",
    },
  },
  en: {
    title: "Settings",
    preferences: "Preferences",
    language: "Language",
    country: "Country",
    countryHint: "Peru is billed in soles; other countries in US dollars.",
    save: "Save",
    saved: "Preferences saved.",
    invalid: "Check the language and the country.",
    data: "Your data",
    dataBody: "Download a JSON file with your profile, quotes and the list of your files.",
    export: "Export my data",
    danger: "Delete account",
    dangerBody: "Deletes your account, quotes and files. This cannot be undone.",
    countries: {
      PE: "Peru",
      CL: "Chile",
      CO: "Colombia",
      EC: "Ecuador",
      BO: "Bolivia",
      MX: "Mexico",
      AR: "Argentina",
      US: "United States",
      ES: "Spain",
    },
  },
};

async function savePreferencesAction(formData: FormData): Promise<void> {
  "use server";
  const locale = String(formData.get("locale") ?? "");
  const country = String(formData.get("country") ?? "");
  const result = await toResult(async () =>
    updatePreferences(await requireActor(), { locale: locale as Locale, country }),
  );
  if (result.ok && isLocale(locale)) {
    (await cookies()).set("NEXT_LOCALE", locale, { path: "/", sameSite: "lax" });
  }
  revalidatePath("/app", "layout");
  redirect(result.ok ? "/app/settings?saved=1" : "/app/settings?error=invalid");
}

async function deleteAccountAction(formData: FormData): Promise<Result<null>> {
  "use server";
  return toResult(async () => {
    await deleteAccount(await requireActor(), String(formData.get("email") ?? ""));
    return null;
  });
}

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const preferences = await getPreferences(await requireActor());
  const localeValue = await getLocale();
  const t = copy[isLocale(localeValue) ? localeValue : "es"];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      {params.saved && (
        <p aria-live="polite" className="text-success">
          {t.saved}
        </p>
      )}
      {params.error && (
        <p role="alert" className="text-danger">
          {t.invalid}
        </p>
      )}

      <form action={savePreferencesAction} className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.preferences}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.language}</span>
          <select name="locale" defaultValue={preferences.locale} className="input">
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.country}</span>
          <select name="country" defaultValue={preferences.country} className="input">
            {COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {t.countries[code]}
              </option>
            ))}
          </select>
          <span className="text-fg-muted">{t.countryHint}</span>
        </label>
        <button type="submit" className="btn btn-primary self-start">
          {t.save}
        </button>
      </form>

      <article className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.data}</h2>
        <p className="text-fg-muted">{t.dataBody}</p>
        <a className="btn btn-ghost self-start" href="/api/v1/account/export" download>
          {t.export}
        </a>
      </article>

      <article className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.danger}</h2>
        <p className="text-fg-muted">{t.dangerBody}</p>
        <DeleteAccountDialog action={deleteAccountAction} />
      </article>
    </section>
  );
}
