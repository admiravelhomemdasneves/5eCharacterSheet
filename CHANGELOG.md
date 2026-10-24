# Changelog

What each version of 5e Character Sheet brings. The release of each version on GitHub uses its section as its notes.

## 1.2.0

### New
- **Homebrew in the 5etools format.** Add 5etools homebrew files (JSON, inside your vault) in *Settings → Rules data*: their races, classes, subclasses, backgrounds, feats, spells and items are imported with your 5etools data. Homebrew subclasses can add spells to their class's spell list (`subclassSpells`). (#13)
- **Notes on features.** Class, race and background features have a *Notes* field for your reminders, uses and rulings; a feature with notes is tagged while it is closed. (#14)
- **Your own features.** Add features from the rules data to one character, write custom ones, and hide or remove the ones you don't want on the sheet. (#15)
- **Detect.** In the import settings, *Detect* finds 5etools data folders, 5etools homebrew and a compendium folder in your vault, hidden folders included, and lets you choose what to use. (#35, #38)
- **Settings in pages:** General, Sheet template, Rules data and Compendium, with a step-by-step guide to setting up 5etools data. (#18, #5)
- **Spell slots by the rules.** The ⓘ next to *Spell Slots* shows how many slots of each level the rules give the character (and Pact Magic), marks any level where the sheet has other slots, and *Reset* brings them back. (#68)
- **Manual mode: hit dice you can set.** The pencil next to *Hit Dice used* opens an editor for the number and die of your hit dice, several for a multiclass. (#28)

### Fixes
- **The maximum hit dice in manual mode** no longer comes only from the text you typed: "1d10" for a level 5 character gave one hit die. (#28)
- **Changes made to a note outside its sheet show on it**: the properties editor, Sync from another device, git or another plugin. Two panes of the same note stay in step. (#40)
- **A sheet keeps saving after its note, or the folder it is in, is renamed or moved.** Its changes were lost until the note was opened again. (#45)
- **Collapsing a section or opening an edit mode no longer changes the note**; how each sheet is shown is kept on each device. Hiding a section still saves it in the note. (#50)
- **Spell slot levels with no slots leave the grid**, and adding a slot of a higher level no longer adds empty lower levels. (#67)
- **Homebrew classes get the rules of their features**: Unarmored Defense, Unarmored Movement, Fast Movement, Jack of All Trades, Draconic Resilience. (#55)
- **Dropdowns open in the sheet's own window** when it is in a pop-out window. (#44)
- **New characters with a name that can't be a file name** (with `/`, `:`, `?`…) are refused with a message, instead of failing silently or creating folders. (#49)
- **Variant backgrounds link to their compendium notes.**
- **Sheets with embeds or code blocks** no longer use more memory the longer they stay open. (#41)
- **Faster with large imported data**, and the included SRD data is smaller and read only when you use it. (#42, #43, #52, #56)

### After updating
- **If you import your own 5etools data,** press **Import now** in the plugin settings: it completes the entries 5etools copies from others and adds the extra spells of homebrew subclasses. The plugin reminds you until you do.
- **Collapsed sections and edit modes** are now kept on each device: each sheet keeps the ones it had, once.
- **Manual mode hit dice** typed as text are read as before ("5d10" is five d10). If you typed only the die (e.g. "1d10" for a level 5 character), set the number with the pencil next to *Hit Dice used*.
- **Obsidian before 1.13:** the compendium folder setting is saved when you leave the field; there is no *Apply* button any more.
- **Several devices:** update the plugin on all of them. Until then, sheets saved with 1.2.0 still open with 1.1.0.

## 1.1.0

### New
- **Theme setting.** Choose the sheet's accent colour: *Original* (the plugin's red), *Obsidian theme* (your theme's accent colour) or *Custom* (any colour). Checkboxes and the death save icons now use the accent colour too. (#4)
- **Hide sections.** Hover a section's title to hide that section on the sheet. A **Hidden sections** menu at the top of the sheet brings them back. In **Settings → Sheet template** you can choose which sections new sheets show. (#1)
- **One editor per ability score.** Each ability has a single +/− editor. With point buy, base points are spent first and anything beyond goes to Adjust. Under the score, a formula shows where it comes from (base, race, ASI, feat, class, adjust) along with the ability's maximum. (#2)

### Fixes
- **Humans get their racial ability increases.** The standard Human gets +1 to every ability. With imported 5etools data you can choose **Standard** or **Variant** Human, and Variant Human's two +1 of your choice are applied. (#6)
- **Scores are no longer silently capped at 20.** The maximum is 20, or 24 for STR and CON with the Barbarian's Primal Champion, which is now applied automatically. A score above its maximum shows a warning while editing. (#2)
- **Manual mode:** new characters start with the Manual method, so scores aren't stuck at the point-buy maximum of 15. The Attacks and Spellcasting sections show even while empty. (#1, #2)

### After updating
- **If you import your own 5etools data,** press **Import now** in the plugin settings to get the Standard and Variant Human subraces. The plugin reminds you until you do. Nothing else needs re-importing.
- **Some ability scores may change:**
  - SRD Humans gain +1 to every ability.
  - Scores whose bonuses add up past 20 now show their real total instead of 20.
  - **Level 20 Barbarians:** Primal Champion's +4 is now automatic. If you had added it yourself in **Adjust**, remove it, or STR and CON are counted twice. The warning in edit mode points it out.
- Existing characters keep all their data, and characters saved with 1.1.0 still open in 1.0.x.

## 1.0.2

Review fixes (types, lint, settings search, attestations).

## 1.0.1

Clamp current HP, flag extra ASIs (Ability Score Improvements), button for image removal in the character portrait.

## 1.0.0

First release.
