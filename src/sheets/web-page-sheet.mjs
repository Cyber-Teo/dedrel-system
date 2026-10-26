/**
 * Sheet of the "web page" journal page: an iframe in view mode, two address fields in edit mode.
 * Built like the core PDF page sheet (JournalEntryPagePDFSheet).
 */
const { JournalEntryPageHandlebarsSheet } = foundry.applications.sheets.journal;

export default class DedrelWebPageSheet extends JournalEntryPageHandlebarsSheet {

  // Embedded in a journal, the sheet's own classes are stripped: the page wrapper only gets
  // the page type and `viewClasses` (JournalEntrySheet#_renderPageViews), so the CSS hook goes there too.
  static DEFAULT_OPTIONS = {
    classes: ["dedrel-web-page"],
    viewClasses: ["dedrel-web-page"],
    window: {
      icon: "fa-solid fa-globe"
    }
  };

  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: "systems/dedrel/templates/journal/web-page-edit.hbs",
      classes: ["standard-form"]
    },
    footer: super.EDIT_PARTS.footer
  };

  static VIEW_PARTS = {
    content: {
      template: "systems/dedrel/templates/journal/web-page-view.hbs",
      root: true
    }
  };

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    await super._prepareContentContext(context, options);
    Object.assign(context, {
      url: this.page.system.url,
      systemFields: this.page.system.schema.fields
    });
  }
}
