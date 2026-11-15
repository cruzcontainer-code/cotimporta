import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, type Locale, messages } from "./messages";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  let locale: Locale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const acceptLanguage = (await headers()).get("accept-language") ?? "";
    locale = acceptLanguage.toLowerCase().startsWith("en") ? "en" : "es";
  }
  return { locale, messages: messages[locale] };
});
