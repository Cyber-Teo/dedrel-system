/**
 * "Web page" journal page (JournalEntryPage type `web`): shows a site page in an iframe.
 * Used for the rules pack — the pages point at dedrel.teo.uy, so the rules in Foundry
 * are always the current ones from the site. Sheet — src/sheets/web-page-sheet.mjs.
 */
import { contentLanguage } from "../../l10n/compendium-translation.mjs";

const fields = foundry.data.fields;

/** Only http(s) addresses may go into the iframe. */
function validateUrl(value) {
  if ( !value ) return;
  const url = URL.parse(value);
  if ( !url || !["http:", "https:"].includes(url.protocol) ) {
    throw new Error("must be an http(s) address");
  }
}

export default class DedrelWebPageData extends foundry.abstract.TypeDataModel {

  static LOCALIZATION_PREFIXES = ["DEDREL.JournalPages.Web"];

  static defineSchema() {
    return {
      src: new fields.StringField({ required: true, blank: true, initial: "", validate: validateUrl }),
      srcEn: new fields.StringField({ required: true, blank: true, initial: "", validate: validateUrl })
    };
  }

  /** The address for the active content language: `srcEn` for any language but Russian, if set. */
  get url() {
    return ((contentLanguage() !== "ru") && this.srcEn) || this.src;
  }
}
