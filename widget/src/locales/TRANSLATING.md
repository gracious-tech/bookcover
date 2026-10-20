
# Translating the widget

Every catalog except `en.ts` is written by AI, and this file is the brief. Read it, then work
with `en.ts` open: its comments are the context for each string.

## Files

- `en.ts` — the source of truth. Context comments sit above ambiguous keys, and `[max N]` marks
  a label in a tight space (aim for N characters or fewer; a CJK character counts as two).
- `<code>.ts` — one catalog per language, typed `const x:Messages` so `tsc` rejects a missing or
  extra key. Codes are canonical BCP 47 tags, as browsers use: just the language (`fr`, `ar`),
  plus a subtag only where it tells catalogs apart — a script for Chinese (`zh-Hans`/`zh-Hant`,
  since each serves several regions) or a region where that's what differs (`pt-BR`). Write a
  script variant as its own translation in its own region's vocabulary, never as a character
  conversion of its sibling.
- Each catalog's header comment holds that language's own decisions: formality, punctuation
  and its glossary of fixed terms. Follow them so the whole catalog reads as one voice, and
  record any new decision there rather than making it silently.
- `../i18n.ts` (`AVAILABLE_LOCALES`) registers each language. `../option_labels.ts` translates
  names that come from data (printing-services options, font groups) with English fallbacks.

## Workflow

**Changing English.** Update every catalog in the same change. A changed meaning needs a fresh
translation everywhere, and nothing detects that automatically, because the keys stay the
same. Use `git diff src/locales/en.ts` to see what to redo.

**Adding a language.** Add an entry to `AVAILABLE_LOCALES` in `../i18n.ts`, then write
`<code>.ts`, header first. No package release is needed: embed hosts send the code as a plain
string, so it works for them as soon as the widget deploys. For an RTL language set `dir: 'rtl'`; for a script that joins letters or stacks marks,
add its tag to the letter-spacing rule in `../styles.sss`.

**Verify.** From `widget/`:

```bash
npx tsc --noEmit && npx vitest run tests/locales.test.ts
```

The test checks catalog/registry agreement, keys, placeholders, message syntax, and that
`en.ts` still matches printing-services and `font_config.json` (so an upstream rename or a new
option fails here and gets translated, instead of quietly showing English).

## Rules

- **Translate meaning, in that language's normal software voice.** These are short UI labels:
  use the wording a native user expects from a well-localized app, not a literal rendering.
  Buttons are verbs where the language does that.
- **Don't assume the user's gender.** Where the language marks it (past tenses, adjectives,
  "I understood" buttons), pick a neutral construction ("Got it" → "Understood", not "I
  understood (m.)").
- **Placeholders** like `{n}`, `{pages}` and `{id}` stay exactly as written. Move them to wherever
  the grammar needs them.
- **Never use `{ } @ |`** outside a placeholder. vue-i18n treats them as syntax. Use another
  character, such as a different bracket or dash.
- **Keep names unchanged:** Iconify, Google Fonts, Typst, wasm, PDF, ISBN, 3D, A4/A5, file
  extensions (`.zip`, `.ttf`, `.otf`), `collection:name`, and Google's button labels "Get font" and
  "Download all" (the user will see those in English on Google's site). In `print_options`, keep
  trademarked paper names ("Supreme Laser", "Sovereign Silk") and weights ("60#", "80gsm").
- **Numbers stay in Western digits.** The inputs, previews and printed cover all use them.
- **Punctuation follows the language:** its quotation marks, its spacing before `:` or `%`, its
  ellipsis. Keep `…` where English has it as a "click to continue" hint.
- **Don't add direction marks** or zero-width spaces (the joiners ZWNJ/ZWJ are fine where the
  language's spelling needs them, as in Persian and Bengali). Write RTL text naturally;
  the app sets `dir` itself. A Latin token that starts or ends with punctuation (`.zip`)
  displays out of order inside RTL text, so write it without the punctuation (`ZIP`).
- **Split sentences** (`*_prefix` + link + `*_suffix`) may be reordered by leaving one half empty.

## Glossary concepts

Each catalog's header fixes one translation per concept, using the term that language's
self-publishing and print-on-demand industry actually uses.

| Concept | Meaning here |
|---|---|
| cover | the printed wraparound cover (front + spine + back) |
| front cover / back cover | the two panels; the back carries the blurb and barcode |
| spine | the narrow panel along the book's bound edge, with title and author |
| blurb | the sales description printed on the back cover |
| trim size | the finished page size of the book after cutting |
| bleed | extra image area beyond the trim edge, cut off after printing |
| binding | how pages are fastened; perfect bound = glued spine (normal paperback), saddle stitch = stapled through the fold, coil/spiral/wire bound, case wrap = printed hardcover |
| interior | the book's pages, as opposed to its cover |
| printing service | the print-on-demand company (KDP, Lulu…) |
| mockup | a realistic photo-style render of the book |
| background / pattern / icon | the cover's design layers |

## Not translated

- Pattern and vector design names (`bookcover-core` metadata): hover tooltips only.
- Printing service names, font family names, and host-supplied suggestion labels.
- The `site/` package (a static English page around the widget).

## Review status

All catalogs are AI-translated. A native speaker's review is the only real check of quality,
so each catalog's header notes whether it has had one. Change that note to say who reviewed it
and when.
