# Category Tab Labels — Design

**Date:** 2026-10-26
**Status:** Approved in brainstorming, awaiting spec review
**Repo:** LD-Labels (`index.html`, single-file editor)

## Goal

Make vials from different research areas easy to tell apart at a glance (on
the shelf, when packing orders, in a customer's hand) without breaking the
one-brand look. The NIIMBOT M2 prints black only on holographic stock, so
the categories are distinguished by shape and words, not colour.

## Decisions made during brainstorming

- **Chosen:** a solid category tab with a code word, plus a solid band
  behind the name. The layout is the same for every category; only the tab
  word changes.
- **Rejected:** a category icon in place of the atom (too small to read on
  a vial), a pattern band per category, and a different layout per category
  (framed layouts bring back the left/right drift problem, and six
  categories would run out of distinct layouts).
- **Tab word source:** a lookup table built into the editor, with a manual
  override. Reading categories from the storefront database was rejected
  because the label tool is deliberately kept separate from the store's
  backend and identity.

## Categories

The groups mirror the storefront's six Find Your Fit research areas
(`src/data/researchAreas.ts` in the storefront repo). They are named by
mechanism, never by outcome, which is a compliance rule the brand already
follows. A compound that appears in two areas on the site is assigned to
one here.

| Tab word    | Compounds (live catalog, 2026-10-26)                         |
|-------------|--------------------------------------------------------------|
| `TISSUE`    | BPC-157, TB-500, GHK-Cu, KPV, KLOW, Wolverine Blend          |
| `GH AXIS`   | Ipamorelin, CJC-1295 No DAC, Tesamorelin, CJC/Ipamorelin Blend |
| `METABOLIC` | Retatrutide (20mg, 40mg)                                     |
| `NEURO`     | Semax, Selank                                                |
| `MITO`      | NAD+, SS-31, MOTS-c                                          |
| `MELANO`    | Melanotan II, PT-141                                         |

- Tesamorelin goes under `GH AXIS` (GHRH analogue), not Metabolic.
- MOTS-c goes under `MITO` (mitochondrial-derived peptide), not Metabolic.
- BAC Water and other accessories get **no tab**.
- Bundles are not labelled as bundles. Each vial in a bundle gets its own
  compound's tab.

## Template: "Category Tab" style

A new entry in the Style dropdown: `Category Tab — research-area tab + name band`
(value `cattab`). The original four styles and both v2 styles are not
modified.

It is built on Ruled Frame v2: the same measure-then-draw, fill-to-full-height
layout (`gapDealer`), top and bottom rails, atom brand icon, and all existing
font-size overrides (Brand, Name, Disclaimer, Storage/Batch).

- **Tab.** A solid rectangle on the left edge, about 4.5mm wide (144px on the
  1280px canvas). It runs off the top, bottom and left canvas edges, so it has
  no visible outer edge for print drift to expose. The word is knocked out
  (background colour), reads bottom to top, is bold with wide letter-spacing,
  and is auto-sized to fit both the tab's height and its width. The longest
  word, `METABOLIC`, must fit.
- **Name band.** A solid band behind the name and pill row, running from the
  tab's inner edge (or the canvas edge when there's no tab) off the right
  edge. The name is knocked out. The pill is inverted relative to the band
  (band-coloured text on a background-coloured pill). The pill's colour
  selection and border toggle don't apply inside the band.
- **Ink.** The tab and band are drawn in the foreground colour (the same as
  the text), so on the physical print they come out exactly like the text
  does, whichever way the Inverted toggle is set.
- **Content area.** Everything except the tab (brand row, band, fine rows,
  rails) starts after the tab. The name auto-shrinks to the narrower width,
  as it already does.
- **No tab.** When the resolved tab is none, the tab isn't drawn and the
  content area starts at the normal left padding. The name band stays.

## Tab word resolution

### Lookup table

The table lives in the editor's script as one list of aliases per tab word.
Matching normalizes both sides: lowercase, then strip everything except
`a-z0-9`. A name matches an alias when the normalized name **contains** the
normalized alias.

| Tab word    | Aliases                                                       |
|-------------|---------------------------------------------------------------|
| `TISSUE`    | `bpc157`, `tb500`, `ghkcu`, `kpv`, `klow`, `wolverine`        |
| `GH AXIS`   | `ipamorelin`, `cjc1295`, `cjc`, `tesamorelin`                 |
| `METABOLIC` | `retatrutide`                                                 |
| `NEURO`     | `semax`, `selank`                                             |
| `MITO`      | `nad`, `ss31`, `motsc`                                        |
| `MELANO`    | `melanotan`, `mt2`, `pt141`                                   |

- If the name matches aliases from exactly one tab word, that word is used.
  This covers blends whose compounds share a tab, e.g. CJC + Ipamorelin.
- If it matches aliases from two or more different tab words, or none at
  all, the result is no tab. The editor never guesses between categories.
- The resolver runs on the name after any dosage has been stripped.
  Batch entries are already split into name and dosage by `DOSAGE_RE`.

### Editor control

A new `Category Tab` select under Label Content (id `categoryTab`):

- `Auto` (default). Its option text shows the live result, e.g.
  `Auto (TISSUE)` or `Auto (none found)`, updated as the name changes.
- The six tab words, to force one.
- `None`.
- `Custom`. This reveals a text input (id `categoryCustom`, max 10
  characters), uppercased when drawn.

The control only affects the Category Tab style. The other styles ignore it.

### Batch export

Each batch entry resolves its tab with **Auto** on its own name, ignoring a
forced word or Custom (either would put the same tab on every label in the
batch). The exception is `None`, which turns tabs off for the whole batch.

## Out of scope

- Category icons, pattern bands, a separate layout per category.
- A dedicated BAC Water / accessory template.
- Remembering editor settings between visits.
- Any change to the existing six styles.

## Testing

Automated preview renders (Playwright against the local file) before pushing:

1. Every tab word fits its tab, including `METABOLIC` and `MELANO`.
2. Every live product name resolves to the tab in the table above. BAC
   Water, syringe packs and an unknown name resolve to none.
3. Long names (e.g. `CJC-1295 & Ipamorelin`) shrink without hitting the
   pill or the right edge.
4. The Inverted toggle on and off both render correctly. The no-tab layout
   renders correctly.
5. A mixed batch export gives each label its own correct tab.
6. The four original styles and both v2 styles render pixel-identical to the
   current live version (the same check used for the v2 push).

## Rollout

Push to `main` (GitHub Pages) once the checks pass. Nothing existing
changes, so it's safe to push before a physical test print. The owner then
test-prints from mobile, and any tuning (tab width, word size, band
padding) follows from that print.
