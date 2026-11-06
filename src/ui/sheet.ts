// A character sheet: one per `character-sheet-5e` code block. It holds the note's state, saves
// changes through the plugin and renders the sections (src/ui/sections), which it hands itself.
import { Component, MarkdownRenderChild, MarkdownRenderer, Menu, TFile } from "obsidian";
import type CharacterSheetPlugin from "../main";
import * as E from "../rules/engine";
import { CharState } from "../rules/engine";
import { button, iconButton, labeled, RichOpt, richSelect } from "./widgets";
import { roll } from "./dice";
import { isD20, withAdvantage, withPenalty } from "../rules/roll";
import { sheetConflicts } from "../rules/conflicts";
import { SECTIONS } from "../sections";
import { richText } from "./richtext";
import { rulesWarnings } from "./sections/rules-warnings";
import { header } from "./sections/header";
import { creation } from "./sections/creation";
import { abilities } from "./sections/abilities";
import { combat } from "./sections/combat";
import { skills } from "./sections/skills";
import { attacks } from "./sections/attacks";
import { classFeaturesSection, manualClassFeatures, manualRaceFeatures, raceFeatures } from "./sections/features";
import { feats, manualFeats } from "./sections/feats";
import { manualSpellcasting, spellcasting } from "./sections/spells";
import { inventory } from "./sections/inventory";
import { biography, personality, proficiencies } from "./sections/profile";

export class CharacterSheet extends MarkdownRenderChild {
  s!: CharState;
  /** what the rules engine reads: the state itself, or its manual-mode view */
  v!: CharState;
  /** what opens in edit mode on the next render: a list item ("list-key:index"), a custom feature
   *  ("feature:id") or a manual-mode spell ("spell:index") */
  focusItem: string | null = null;
  /** the features open in this sheet, by key (see details()), so a render keeps them open */
  openDetails = new Set<string>();
  /** owns what one render() makes (markdown children); unloaded by the next render */
  private renderScope: Component | null = null;

  /** `sourcePath`: the note's path, kept up to date by the plugin when the note is renamed or moved */
  constructor(readonly plugin: CharacterSheetPlugin, el: HTMLElement, public sourcePath: string) {
    super(el);
  }
  /** what this sheet works with: the context of its character's rules */
  get ctx() { return this.plugin.contextById(this.s.ruleset); }
  get r() { return this.ctx.rules; }
  get manual() { return this.ctx.manual; }
  /** the rules can say what this character's numbers are; if not, they are left as they are */
  get trusted() { return this.plugin.trusted(this.ctx, this.s); }
  /** what is wrong between this sheet and its rules */
  conflicts() {
    const c = this.ctx;
    return sheetConflicts({ ruleset: c.id, label: c.ruleset?.label ?? null, status: c.status, unresolved: c.manual ? [] : E.unresolvedIds(c.rules, this.s) });
  }
  /** called by the plugin when settings or rules data change, or the note's state was replaced
   *  (changed outside the sheet, or by another sheet of the same note) */
  reload() {
    this.s = this.plugin.states.get(this.sourcePath) ?? this.s;
    this.render();
  }

  onload() {
    this.plugin.sheets.add(this);
    const file = this.file();
    // every sheet of a note shares the plugin's copy of its state; the metadata cache lags behind our
    // own writes, so it is only read when there is no copy yet
    let s = this.plugin.states.get(this.sourcePath), migrateBody = false;
    if (!s) {
      const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
      const saved = fm?.dnd as Partial<CharState> | undefined;
      // an older note may keep its view in itself, and its biography and notes in its body
      this.plugin.view(this.sourcePath, E.legacyView(saved));
      migrateBody = !!saved && E.stateVersion(saved) < 2;
      s = E.normalize(saved ?? this.plugin.freshCharacter(file?.basename ?? ""));
      if (!s.name && file) s.name = file.basename;
      this.plugin.states.set(this.sourcePath, s);
    }
    this.s = s;
    this.render();
    if (file && migrateBody) void this.migrateBody(file);
  }
  // Move the old "## Biography" / "## Notes" note sections into the Biography & Diary box (notes from before state version 2)
  private async migrateBody(file: TFile) {
    const legacy = E.extractLegacySections(await this.app.vault.read(file));
    if (!legacy) return;
    this.change((x) => {
      if (legacy.biography) x.biography = x.biography ? `${x.biography}\n\n${legacy.biography}` : legacy.biography;
      if (legacy.diary) x.diary = x.diary ? `${x.diary}\n\n${legacy.diary}` : legacy.diary;
    });
    await this.app.vault.process(file, (text) => E.extractLegacySections(text)?.text ?? text);
  }
  onunload() { this.plugin.sheets.delete(this); }

  get app() { return this.plugin.app; }
  private file() { const f = this.app.vault.getAbstractFileByPath(this.sourcePath); return f instanceof TFile ? f : null; }

  /** How this sheet is shown (collapsed sections, edit mode): on this device, not in the note. */
  get view() { return this.plugin.view(this.sourcePath); }
  /** Change how the sheet is shown: re-rendered, the note is not saved. */
  changeView(mutate: (v: E.SheetView) => void) {
    mutate(this.view);
    this.plugin.saveViews();
    this.render();
  }

  // ---------------------------------------------------------------- persistence
  change(mutate: (s: CharState) => void, rerender = true) {
    mutate(this.s);
    // current HP is not used by derive(), so the render below can use it after the HP check
    const d = this.derive();
    // a lower maximum (level down, CON down, manual edit) must not leave current HP above it
    if (this.s.hp.current != null) this.s.hp.current = E.settledHp(this.s, this.trusted, this.manual ? this.s.manual.maxHp : d.hp.max);
    this.plugin.states.set(this.sourcePath, this.s);
    this.plugin.requestSave(this.sourcePath);
    if (rerender) this.render(d);
    // other sheets of the same note (another pane) show the change too
    this.plugin.reloadSheets(this.sourcePath, this);
  }

  // ---------------------------------------------------------------- rendering
  // Theme from the settings. The custom colour is an inline style, which empty() keeps, so it is
  // set or cleared ("" removes the property) on every render.
  private applyTheme(root: HTMLElement) {
    const st = this.plugin.settings;
    root.toggleClass("dnd-theme-obsidian", st.theme === "obsidian");
    root.setCssProps({ "--dnd-accent": st.theme === "custom" ? st.customAccent : "" });
  }
  /** What the rules engine reads (the state, or its manual-mode view) and everything worked out from it. */
  private derive() {
    this.v = this.manual ? E.manualView(this.s) : this.s;
    return E.derive(this.r, this.v);
  }
  /** `d`: this state's derive(), when the caller already has it */
  render(d = this.derive()) {
    const root = this.containerEl;
    root.empty();
    if (this.renderScope) this.removeChild(this.renderScope);
    this.renderScope = this.addChild(new Component());
    root.addClass("dnd-sheet");
    this.applyTheme(root);
    this.hiddenSectionsMenu(root);
    rulesWarnings(this, root);
    header(this, root, d);
    creation(this, root, d);
    abilities(this, root, d);
    // Combat and Skills share a row; a hidden one leaves no empty column (see .dnd-combat-row)
    const grid = root.createDiv({ cls: "dnd-grid-2 dnd-combat-row" });
    if (!this.isHidden("combat")) combat(this, grid.createDiv(), d);
    if (!this.isHidden("skills")) skills(this, grid.createDiv(), d);
    if (!grid.childElementCount) grid.remove();
    attacks(this, root, d);
    // manual mode lists what the player types instead of what the rules data gives
    if (this.manual) {
      manualRaceFeatures(this, root);
      manualClassFeatures(this, root);
      manualFeats(this, root);
      manualSpellcasting(this, root, d);
    } else {
      raceFeatures(this, root, d);
      classFeaturesSection(this, root, d);
      feats(this, root, d);
      spellcasting(this, root, d);
    }
    inventory(this, root, d);
    proficiencies(this, root);
    personality(this, root);
    biography(this, root);
  }

  // ---------------------------------------------------------------- what the sections build with
  section(parent: HTMLElement, key: string, label: string, build: (el: HTMLElement) => void, actions?: (el: HTMLElement) => void) {
    if (this.isHidden(key)) return;
    const sec = parent.createDiv({ cls: "dnd-section" });
    const head = sec.createDiv({ cls: "dnd-section-head" });
    const collapsed = !!this.view.collapsed[key];
    const tog = head.createSpan({ cls: "dnd-collapse", text: collapsed ? "▸" : "▾" });
    head.createEl("h3", { text: label });
    // hide button, shown while the title row is hovered (see .dnd-section-hide)
    if (SECTIONS.some((x) => x.key === key)) iconButton(head, "eye-off", "Hide this section", () => this.change((x) => { x.ui.hidden[key] = true; }), "dnd-section-hide");
    if (actions) actions(head.createDiv({ cls: "dnd-section-actions" }));
    const body = sec.createDiv({ cls: "dnd-section-body" });
    const toggle = () => this.changeView((v) => { v.collapsed[key] = !collapsed; });
    tog.onclick = toggle; head.querySelector("h3")!.addEventListener("click", toggle);
    if (!collapsed) build(body);
  }

  link(parent: HTMLElement, text: string, target: string | null | undefined, cls = "") {
    if (!target) return parent.createSpan({ text, cls });
    const a = parent.createEl("a", { text, cls: `internal-link ${cls}`, href: target, attr: { "data-href": target } });
    a.addEventListener("click", (e) => { e.preventDefault(); void this.app.workspace.openLinkText(target, this.sourcePath, e.ctrlKey || e.metaKey); });
    a.addEventListener("mouseover", (e) => this.hoverLink(e, a, target));
    return a;
  }
  /** Obsidian's page preview of `linktext` while `targetEl` is hovered */
  hoverLink(event: MouseEvent, targetEl: HTMLElement, linktext: string) {
    this.app.workspace.trigger("hover-link", { event, source: "preview", hoverParent: this, targetEl, linktext, sourcePath: this.sourcePath });
  }
  md(parent: HTMLElement, text: string) {
    const el = parent.createDiv({ cls: "dnd-md" });
    void MarkdownRenderer.render(this.app, this.ctx.linker.text(text), el, this.sourcePath, this.renderScope ?? this);
    return el;
  }
  rollable(parent: HTMLElement, text: string, formula: string, label: string, cls = "") {
    const tip = isD20(formula) ? `Roll ${formula} · Shift: advantage · Ctrl: disadvantage` : `Roll ${formula}`;
    const b = parent.createSpan({ text, cls: `dnd-roll ${cls}`, attr: { "aria-label": tip } });
    b.onclick = (e) => {
      e.stopPropagation();
      // Shift = advantage, Ctrl/Cmd = disadvantage (d20 rolls only)
      const mode = !isD20(formula) ? "normal" : e.shiftKey ? "adv" : e.ctrlKey || e.metaKey ? "dis" : "normal";
      const penalty = isD20(formula) ? E.exhaustionPenalty(this.r, this.s) : 0;
      void roll(this.app, withAdvantage(withPenalty(formula, penalty), mode), label + (mode === "adv" ? " (advantage)" : mode === "dis" ? " (disadvantage)" : "") + (penalty ? ` (exhaustion −${penalty})` : ""));
    };
    return b;
  }
  /**
   * `noteKey`: the feature's E.featureKey(); adds the player's notes field under the text, and the
   * feature stays open across renders (e.g. after a pick in it), as one with an `openKey` does.
   * `extra`: more under the text (a choice).
   */
  details(parent: HTMLElement, summary: (el: HTMLElement) => void, text: string, noteKey?: string, extra?: (el: HTMLElement) => void, openKey = noteKey) {
    const d = parent.createEl("details", { cls: "dnd-details" });
    const sm = d.createEl("summary");
    summary(sm);
    // shows, while closed, that the feature has notes; kept in step as they are edited
    const tag = noteKey ? sm.createSpan({ cls: "dnd-tag", text: "notes" }) : null;
    tag?.toggle(!!this.s.featureNotes[noteKey!]);
    let done = false;
    const build = () => {
      if (done) return;
      done = true;
      this.md(d, text);
      extra?.(d);
      if (noteKey) richText(this, labeled(d, "Notes", "dnd-feature-notes"), this.s.featureNotes[noteKey] ?? "", (v) => {
        tag?.toggle(!!v.trim());
        this.change((x) => { if (v.trim()) x.featureNotes[noteKey] = v; else delete x.featureNotes[noteKey]; }, false);
      }, { placeholder: "Your notes: reminders, uses, rulings… Type [[ to link a note." });
    };
    if (openKey && this.openDetails.has(openKey)) { d.open = true; build(); }
    d.addEventListener("toggle", () => {
      if (openKey) { if (d.open) this.openDetails.add(openKey); else this.openDetails.delete(openKey); }
      if (d.open) build();
    });
    return d;
  }

  // Searchable dropdown whose options show the compendium note preview on hover
  pick(parent: HTMLElement, opts: RichOpt[], value: string | null, onChange: (v: string) => void, placeholder: string, disabled = false, cls = "") {
    return richSelect(parent, opts, value, onChange, {
      placeholder, disabled, cls,
      hover: (ev, target, link) => this.hoverLink(ev, target, link),
      // close any preview still open when the menu closes (e.g. after picking an option)
      onClose: () => (this as { hoverPopover?: { hide?: () => void } | null }).hoverPopover?.hide?.(),
    });
  }
  sourceName(src: string) { return this.r.data.meta.sources[src] || src; }

  // ---------------------------------------------------------------- hidden sections
  isHidden(key: string) { return !!this.s.ui.hidden[key]; }
  /** "Hidden sections" button at the top of the sheet, only when some are hidden: a menu to show them again. */
  private hiddenSectionsMenu(root: HTMLElement) {
    const hidden = SECTIONS.filter((x) => this.isHidden(x.key));
    if (!hidden.length) return;
    const bar = root.createDiv({ cls: "dnd-hidden-bar" });
    const btn = button(bar, `Hidden sections (${hidden.length}) ▾`, () => {});
    // the menu opens at the click, so the button takes the mouse event itself
    btn.onclick = (e) => {
      e.preventDefault();
      const menu = new Menu();
      for (const x of hidden) menu.addItem((i) => i.setTitle(x.label).setIcon("eye").onClick(() => this.change((st) => { delete st.ui.hidden[x.key]; })));
      menu.addSeparator();
      menu.addItem((i) => i.setTitle("Show all").setIcon("eye").onClick(() => this.change((st) => { st.ui.hidden = {}; })));
      menu.showAtMouseEvent(e);
    };
  }
}
