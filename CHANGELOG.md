# Changelog

What each version of 5e Character Sheet brings. The release of each version on GitHub uses its section as its notes.

## 1.5.0

### New
- **The 2024 rules.** Each character keeps its own rules, so 2014 and 2024 characters can be in the same vault. Under the 2024 rules backgrounds give the ability increases and an origin feat, species have lineages, and classes have weapon mastery, Fighting Style and Epic Boons, prepared spells from their tables, the 2024 exhaustion and all hit dice back on a long rest. (#3)
- **SRD 5.2.1 included,** with 9 species, 12 classes, 4 backgrounds, 17 feats and 339 spells.
- **Rules settings.** The *Rules data* page is now *Rules*: the rules of new characters, and the data of each edition. It lists any conflict between the rules chosen and their data. The *New character* dialog lets you choose the rules.
- **Importing the 2024 rules.** Each edition is imported into its own data. What was reprinted for 2024 stays out of the 2024 data, and classic content with no 2024 version is included, or left out with a setting. The report says at the top which homebrew is for rules you didn't import.
- **A compendium for each edition.** Set *Compendium folder for the 2024 rules* to use a separate compendium made from the 2024 books. A lineage links to the note of its species.
- **Change a sheet's rules** from the button next to its rules label. What it was stays in the sheet, and changing back brings it back.

### Fixes
- **A sheet whose data is missing keeps its hit points.** With the rules data not loaded, as on a device where the imported file isn't synced, any change used to cut current HP to the manual maximum. The sheet now says what is wrong and leaves its numbers as they are.
- `npm run data:srd` works again.

### After updating
- **2014 sheets don't change,** and neither does your data.
- **If your import mixes the 2014 and 2024 rules** (*Only 2014 rules* off, or *Only entries with a note* on, with 2024 entries in the data), it keeps working as it did. The *Rules* page offers to separate the editions.
- **Use the same version on all your devices.** An older version shows a 2024 sheet as a 2014 one, and changes to it there can limit its current hit points.
- **The plugin is larger** (`main.js` is about 2 MB), as it now has both SRDs.

## 1.4.0

### New
- **Custom data.** A new *Custom data* settings page where you make your own races, subraces, classes, subclasses, backgrounds, feats, spells and items, and add traits and features to the races and classes of your rules data. Press *Create an entry*, choose what to create, and fill in its form; the list has a search, and each entry can be edited, copied or deleted and linked to a note. With the SRD or imported data your entries are in the sheets' menus under *Custom data*; in manual mode, *From custom data…* fills a sheet's fields with them. They are kept in `.5e-character-sheet/custom-data.json` in your vault (you can set another file), and importing again doesn't touch them. (#19, #20–#27)
- **Feature choices.** Fighting Styles, Eldritch Invocations (with their prerequisites), Pact Boon, Metamagic, maneuvers, Totem Spirit, Expertise, Favored Enemy, Draconic Ancestry and other features with a choice show their options inside the feature, with the text of what you picked. *Character Creation* reminds you while a pick is missing or there are too many, and your picks are kept when you change level. Expertise picks count as expertise in skills. (#16)
- **What features grant.** *Character Creation* suggests what your features give, to add or dismiss: spells of feats, invocations and subclasses (*Add Mage Armor*), spells to choose (High Elf's cantrip, Magic Initiate after picking its list), natural weapons and breath weapons as attacks, and the uses of race traits such as Relentless Endurance. Added items are tagged with what granted them, and flagged if that goes. (#17)

### Fixes
- **Racial spells with limited uses are granted**: a tiefling gets *Hellish Rebuke* at 3rd level and *Darkness* at 5th. (#17)
- **Circle of the Land** gets the spells of the land you pick, not of every land. (#17)
- **Open features stay open** after a change on the sheet. (#16)

### After updating
- **If you import your own 5etools data,** press **Import now** in the plugin settings: it brings in the options of class features (Fighting Styles, invocations…) and the spells feats grant. The plugin reminds you until you do. The SRD data included with the plugin has them already.
- **Obsidian Sync doesn't sync hidden folders,** so custom data in the default `.5e-character-sheet` folder stays on each device. To sync it, set a file in a normal folder on the *Custom data* page.

## 1.3.1

### Fixes
- **Community review warnings**: no browser local storage (on Obsidian before 1.8.7 how each sheet is shown lasts until Obsidian closes), the note picker of *Import data* lists only the compendium folder when one is set, and a CSS property the review does not accept is gone.

## 1.3.0

### New
- **Import report.** After an import, a window shows what came from the 5etools data and from each homebrew file, by kind. Open a homebrew file to see its entries, whether each was imported or why not (e.g. *2024 edition*), and what in it the sheet does not use. (#71)
- **Homebrew without 5etools data.** With *Folder with 5etools data* empty, the import brings in only the homebrew files. (#71)
- **Import data page** in the settings: what the imported data holds and where each entry came from (the 5etools data or a homebrew file), with a search. Remove entries you don't want (they stay out of later imports until you restore them), and open or change the compendium note of each one. (#73)

### Fixes
- **Detect finds homebrew anywhere in the vault**, also with the whole 5etools homebrew repository there: it stopped after 500 JSON files. (#71)

### After updating
- **To see which homebrew file each entry came from** on the *Import data* page, press **Import now** once more.

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
