/**
 * Eagerly registers all locale bundles.
 * Imported once at app startup so translations are available immediately.
 */
import { registerLocale } from "./index";

import cs from "./locales/cs.json";
import da from "./locales/da.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import fi from "./locales/fi.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import nb from "./locales/nb.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import ptBR from "./locales/pt-BR.json";
import ru from "./locales/ru.json";
import sv from "./locales/sv.json";
import tr from "./locales/tr.json";
import uk from "./locales/uk.json";
import zhHans from "./locales/zh-Hans.json";
import zhHant from "./locales/zh-Hant.json";

const locales: Record<string, Record<string, string>> = {
  cs,
  da,
  de,
  es,
  fi,
  fr,
  it,
  ja,
  ko,
  nb,
  nl,
  pl,
  "pt-BR": ptBR,
  ru,
  sv,
  tr,
  uk,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
};

for (const [locale, strings] of Object.entries(locales)) {
  registerLocale(locale as never, strings);
}
