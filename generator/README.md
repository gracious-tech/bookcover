
# bookcover — schema reference

Part of the [bookcover](https://github.com/gracious-tech/bookcover) generation system.

This is the core generator package — not used directly. Install
[bookcover-node](https://www.npmjs.com/package/bookcover-node) for Node.js or
[bookcover-web](https://www.npmjs.com/package/bookcover-web) for the browser.
This document describes the schema accepted by both.

All colors must be HSL strings in the format `hsl(200deg, 50%, 30%)`.

## Printing / size

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | `string` | Printing service: `kdp`, `lulu`, `officeworks`, `vistaprint_au`, `ctrlprint` |
| `binding_type` | `string` | e.g. `paperback`, `hardcover` — depends on service |
| `size_id` | `string?` | e.g. `us_trade`, `a5` — omit if using custom dimensions |
| `page_count` | `number?` | Required when using `size_id` |
| `ink_type` | `string?` | e.g. `bw`, `color` — required by some services |
| `paper_type` | `string?` | e.g. `white`, `cream` — required by some services |
| `custom_unit` | `string?` | `mm` or `in` — for custom dimensions |
| `custom_trim_width` | `number?` | Trim width in `custom_unit` |
| `custom_trim_height` | `number?` | Trim height in `custom_unit` |
| `custom_bleed` | `number?` | Bleed in `custom_unit` |
| `custom_spine` | `number?` | Spine width in `custom_unit` |
| `margin_front` | `number?` | Front panel text margin as % of trim height |
| `margin_back` | `number?` | Back panel text margin as % of trim height |

## Title

Three title lines (`title1`, `title2`, `title3`) each share the same set of options.
`title1` is the main title.

| Field | Type | Notes |
|-------|------|-------|
| `title1` | `string` | Main title (default `''`) |
| `title1_font` | `{family: string}?` | Font family name as used in Typst |
| `title1_size` | `number?` | Relative size multiplier (default 1.0) |
| `title1_weight` | `number?` | CSS-style weight 100–900 (default 700) |
| `title1_italic` | `boolean?` | |
| `title1_color` | `hsl?` | Defaults to contrasting color vs `bg_color` |
| `title_alignment` | `center\|left\|right?` | |
| `title_position` | `top\|middle\|bottom` | Required |
| `title_spacing` | `number?` | Gap between title lines as % of trim height |
| `title_margin_top` | `number?` | Top margin as % of trim height |
| `title_margin_bottom` | `number?` | Bottom margin as % of trim height |

`title2` and `title3` have the same `_font`, `_size`, `_weight`, `_italic`, `_color` fields;
`title2`/`title3` color defaults to `title1_color`.

## Subtitle

| Field | Type | Notes |
|-------|------|-------|
| `subtitle` | `string` | (default `''`) |
| `subtitle_font` | `{family: string}?` | |
| `subtitle_size` | `number?` | |
| `subtitle_weight` | `number?` | 100–900 |
| `subtitle_italic` | `boolean?` | |
| `subtitle_color` | `hsl?` | |
| `subtitle_alignment` | `center\|left\|right?` | |
| `subtitle_position` | `top\|middle\|bottom` | Required |
| `subtitle_spacing` | `number?` | Gap between subtitle lines as % of trim height |
| `subtitle_margin_top` | `number?` | |
| `subtitle_margin_bottom` | `number?` | |

## Author

| Field | Type | Notes |
|-------|------|-------|
| `author` | `string` | (default `''`) |
| `author_font` | `{family: string}?` | |
| `author_size` | `number?` | |
| `author_weight` | `number?` | 100–900 |
| `author_italic` | `boolean?` | |
| `author_color` | `hsl?` | |
| `author_alignment` | `center\|left\|right?` | |
| `author_position` | `top\|middle\|bottom` | Required |
| `author_margin_top` | `number?` | |
| `author_margin_bottom` | `number?` | |

## Blurb (back panel)

| Field | Type | Notes |
|-------|------|-------|
| `blurb` | `string` | Back cover text (default `''`) |
| `blurb_font` | `{family: string}?` | |
| `blurb_size` | `number?` | |
| `blurb_color` | `hsl?` | |
| `blurb_bg_color` | `hsl\|null?` | `undefined` = derive from `bg_color`; `null` = transparent |
| `blurb_alignment` | `center\|left\|right\|justified?` | |
| `blurb_padding` | `number?` | Padding as % of trim height |
| `blurb_width` | `number?` | Width as % of face width |
| `blurb_spacing` | `number?` | Line spacing multiplier (1 = default Typst leading) |

## Spine

Spine text defaults to the front title and author if not set. Pass `''` to explicitly
suppress spine text.

| Field | Type | Notes |
|-------|------|-------|
| `spine_title` | `string?` | Omit to derive from `title1`; `''` to suppress |
| `spine_title_font` | `{family: string}?` | |
| `spine_title_size` | `number?` | |
| `spine_title_weight` | `number?` | |
| `spine_title_italic` | `boolean?` | |
| `spine_title_color` | `hsl?` | |
| `spine_author` | `string?` | Omit to derive from `author`; `''` to suppress |
| `spine_author_font` | `{family: string}?` | |
| `spine_author_size` | `number?` | |
| `spine_author_weight` | `number?` | |
| `spine_author_italic` | `boolean?` | |
| `spine_author_color` | `hsl?` | |
| `spine_color` | `hsl\|null?` | `null` = no separate spine color (uses primary bg) |

## Background

| Field | Type | Notes |
|-------|------|-------|
| `bg_color` | `hsl?` | Primary background color |
| `bg_color_gradient` | `boolean?` | Apply gradient to background |
| `bg_image_coverage` | `full\|front\|painted\|feature\|front_partial?` | How the background image is placed |
| `icon_id` | `string?` | Iconify ID (e.g. `game-icons:sailboat`) or raw SVG |
| `icon_mode` | `center\|offset\|echo\|background?` | |
| `icon_size` | `number?` | Relative size multiplier, range 0.25–4 |
| `icon_color` | `string?` | |
| `icon_spine` | `boolean?` | Show icon on spine |
| `pattern` | `string?` | Raw SVG string tiled as background pattern |
| `pattern_tile_mm` | `number?` | Pattern tile size in mm (default 80) |
| `pattern_color` | `string?` | |

## Other

| Field | Type | Notes |
|-------|------|-------|
| `isbn` | `string` | ISBN-13; generates barcode on back cover (default `''`) |
