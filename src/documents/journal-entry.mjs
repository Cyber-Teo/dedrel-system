import { CompendiumTranslation } from "../l10n/compendium-translation.mjs";

/**
 * Journal entry of the Dedrel system. Only hooks the translation layer: the rules pack
 * (`dedrel.rules`) keeps Russian names, English ones come from translations/en/rules.json.
 */
export default class DedrelJournalEntry extends foundry.documents.JournalEntry {

  /** Translation of journals from the system's packs (src/l10n/compendium-translation.mjs). @override */
  _initializeSource(data, options = {}) {
    const source = super._initializeSource(data, options);
    return CompendiumTranslation.translateSource(source, options.pack, { creation: options.creation });
  }

  /** Don't let English text be written into the pack's Russian source. @override */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    CompendiumTranslation.stripTranslatedChanges(this, changes);
  }
}
