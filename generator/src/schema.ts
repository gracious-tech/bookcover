
// TypeScript interfaces and Zod validation schema for the cover generator input

import {z} from 'zod'
import type {CjkVariant} from 'typst-fonts'

// -- Font and layout types --

export type TitlePosition = 'top' | 'middle' | 'bottom'

export interface FontConfig {
    // Font family name as used in Typst (e.g. 'Noto Serif', 'Playfair Display')
    family:string
    // Serif/sans classification for Noto fallback selection — only needed for custom fonts
    // that aren't in the curated manifest (bundled fonts carry their own classification)
    style?:'serif' | 'sans'
}

export type IconMode = 'center' | 'offset' | 'echo' | 'background'

// -- Flat top-level schema --

export interface CoverSchema {

    // TEXT

    title1:string
    title1_font?:FontConfig
    title1_size?:number      // Relative font size multiplier (default 1.0)
    title1_weight?:number    // CSS-style numeric weight (default 700)
    title1_italic?:boolean
    title1_color?:string     // Defaults to white/black for contrast against bg_color

    title2:string
    title2_font?:FontConfig
    title2_size?:number
    title2_weight?:number
    title2_italic?:boolean
    title2_color?:string     // Defaults to title1_color

    title3:string
    title3_font?:FontConfig
    title3_size?:number
    title3_weight?:number
    title3_italic?:boolean
    title3_color?:string     // Defaults to title1_color

    title_alignment?:'center'|'left'|'right'
    title_position:TitlePosition
    title_spacing?:number  // Gap between title1/title2 and title2/title3 as percent of trim height
    title_margin_top?:number  // All margins are a percent of trim height
    title_margin_bottom?:number

    subtitle:string
    subtitle_font?:FontConfig
    subtitle_size?:number
    subtitle_weight?:number
    subtitle_italic?:boolean
    subtitle_color?:string
    subtitle_alignment?:'center'|'left'|'right'
    subtitle_position:TitlePosition
    subtitle_spacing?:number  // Gap between subtitle lines as percent of trim height
    subtitle_margin_top?:number
    subtitle_margin_bottom?:number

    author:string
    author_font?:FontConfig
    author_size?:number
    author_weight?:number
    author_italic?:boolean
    author_color?:string
    author_alignment?:'center'|'left'|'right'
    author_position:TitlePosition
    author_margin_top?:number
    author_margin_bottom?:number

    blurb:string
    blurb_font?:FontConfig
    blurb_size?:number
    blurb_color?:string
    blurb_bg_color?:string | null  // undefined = derive from bg_color; null = transparent
    blurb_alignment?:'center'|'left'|'right'|'justified'
    blurb_padding?:number
    blurb_width?:number  // Percent of face_width, clamped to back content width
    blurb_spacing?:number  // Line spacing multiplier (1 = default typst leading)

    // spine_title/spine_author stay optional: undefined = derive from titles/author;
    // '' = explicitly empty spine text (different from unset)
    spine_title?:string
    spine_title_font?:FontConfig
    spine_title_size?:number
    spine_title_weight?:number
    spine_title_italic?:boolean
    spine_title_color?:string

    spine_author?:string
    spine_author_font?:FontConfig
    spine_author_size?:number
    spine_author_weight?:number
    spine_author_italic?:boolean
    spine_author_color?:string

    // SIZE & PRINT

    service_id:string
    size_id?:string
    page_count?:number
    binding_type:string
    ink_type?:string
    paper_type?:string

    custom_unit?:string
    custom_trim_width?:number
    custom_trim_height?:number
    custom_bleed?:number
    custom_spine?:number

    margin_back?:number
    margin_front?:number

    // BACKGROUND

    bg_image_coverage?:'full' | 'front' | 'painted' | 'feature' | 'front_partial'
    bg_color?:string
    bg_color_gradient?:boolean

    icon_id?:string          // Iconify ID (e.g. 'game-icons:sailboat') or raw SVG
    icon_mode?:IconMode
    icon_size?:number        // Relative size multiplier (default 1.0, range 0.25–4)
    icon_color?:string
    icon_spine?:boolean

    pattern?:string          // Raw SVG string tiled as background pattern
    pattern_tile_mm?:number  // Tile size in mm (square); defaults to 80
    pattern_color?:string

    spine_color?:string | null   // null → no separate spine color (spine uses primary)

    // OTHER

    isbn:string

    // Which regional Noto CJK font renders ambiguous Han-only text (glyph shapes differ by
    // region even for shared Han characters). Sentences containing kana or Hangul always
    // resolve to JP/KR per segment, and Han-only sentences containing region-specific
    // characters (simplified-only, traditional-only, or shinjitai-only forms) classify
    // themselves — this setting only breaks ties for sentences of purely shared characters,
    // plus picks HK over TC (which character evidence can't tell apart). An explicit value
    // applies the tiebreak cover-wide; 'auto' (or unset) resolves it per FIELD — each field's
    // own text decides where it can, inheriting the cover-wide detection only when the field
    // has no language signal of its own.
    cjk_variant?:CjkVariant | 'auto'
}

// -- Zod validation --

// hsl(Hdeg, S%, L%) — compatible with both CSS4 and Typst (color.hsl())
const hsl_color = z.string().regex(
    /^hsl\(\d+(?:\.\d+)?deg,\s*\d+(?:\.\d+)?%,\s*\d+(?:\.\d+)?%\)$/,
    'Must be an HSL color like hsl(200deg, 50%, 30%)',
)

// Reusable font config schema
const font_config = z.object({
    family: z.string().min(1),
    style: z.enum(['serif', 'sans']).optional(),
})

export const cover_schema = z.object({

    // Text
    title1: z.string().default(''),
    title1_font: font_config.optional(),
    title1_size: z.number().positive().optional(),
    title1_weight: z.number().int().min(100).max(900).optional(),
    title1_italic: z.boolean().optional(),
    title1_color: hsl_color.optional(),

    title2: z.string().default(''),
    title2_font: font_config.optional(),
    title2_size: z.number().positive().optional(),
    title2_weight: z.number().int().min(100).max(900).optional(),
    title2_italic: z.boolean().optional(),
    title2_color: hsl_color.optional(),

    title3: z.string().default(''),
    title3_font: font_config.optional(),
    title3_size: z.number().positive().optional(),
    title3_weight: z.number().int().min(100).max(900).optional(),
    title3_italic: z.boolean().optional(),
    title3_color: hsl_color.optional(),

    title_alignment: z.enum(['center', 'left', 'right']).optional(),
    title_position: z.enum(['top', 'middle', 'bottom']),
    title_spacing: z.number().nonnegative().max(50).optional(),
    title_margin_top: z.number().nonnegative().max(50).optional(),
    title_margin_bottom: z.number().nonnegative().max(50).optional(),

    subtitle: z.string().default(''),
    subtitle_font: font_config.optional(),
    subtitle_size: z.number().positive().optional(),
    subtitle_weight: z.number().int().min(100).max(900).optional(),
    subtitle_italic: z.boolean().optional(),
    subtitle_color: hsl_color.optional(),
    subtitle_alignment: z.enum(['center', 'left', 'right']).optional(),
    subtitle_position: z.enum(['top', 'middle', 'bottom']),
    subtitle_spacing: z.number().nonnegative().max(50).optional(),
    subtitle_margin_top: z.number().nonnegative().max(50).optional(),
    subtitle_margin_bottom: z.number().nonnegative().max(50).optional(),

    author: z.string().default(''),
    author_font: font_config.optional(),
    author_size: z.number().positive().optional(),
    author_weight: z.number().int().min(100).max(900).optional(),
    author_italic: z.boolean().optional(),
    author_color: hsl_color.optional(),
    author_alignment: z.enum(['center', 'left', 'right']).optional(),
    author_position: z.enum(['top', 'middle', 'bottom']),
    author_margin_top: z.number().nonnegative().max(50).optional(),
    author_margin_bottom: z.number().nonnegative().max(50).optional(),

    blurb: z.string().default(''),
    blurb_font: font_config.optional(),
    blurb_size: z.number().positive().optional(),
    blurb_color: hsl_color.optional(),
    blurb_bg_color: hsl_color.nullable().optional(),
    blurb_alignment: z.enum(['center', 'left', 'right', 'justified']).optional(),
    blurb_padding: z.number().nonnegative().max(50).optional(),
    blurb_width: z.number().positive().max(100).optional(),
    blurb_spacing: z.number().positive().max(10).optional(),

    // spine_title/spine_author stay optional — undefined means derive, '' means explicitly empty
    spine_title: z.string().optional(),
    spine_title_font: font_config.optional(),
    spine_title_size: z.number().positive().optional(),
    spine_title_weight: z.number().int().min(100).max(900).optional(),
    spine_title_italic: z.boolean().optional(),
    spine_title_color: hsl_color.optional(),

    spine_author: z.string().optional(),
    spine_author_font: font_config.optional(),
    spine_author_size: z.number().positive().optional(),
    spine_author_weight: z.number().int().min(100).max(900).optional(),
    spine_author_italic: z.boolean().optional(),
    spine_author_color: hsl_color.optional(),

    // Size & print
    service_id: z.string().min(1),
    size_id: z.string().optional(),
    page_count: z.number().int().positive().optional(),
    binding_type: z.string().min(1),
    ink_type: z.string().optional(),
    paper_type: z.string().optional(),

    custom_unit: z.string().optional(),
    custom_trim_width: z.number().positive().optional(),
    custom_trim_height: z.number().positive().optional(),
    custom_bleed: z.number().nonnegative().optional(),
    custom_spine: z.number().nonnegative().optional(),

    margin_back: z.number().nonnegative().max(50).optional(),
    margin_front: z.number().nonnegative().max(50).optional(),

    // Background
    bg_image_coverage: z.enum(['full', 'front', 'painted', 'feature', 'front_partial']).optional(),
    bg_color: hsl_color.optional(),
    bg_color_gradient: z.boolean().optional(),

    icon_id: z.string().optional(),
    icon_mode: z.enum(['center', 'offset', 'echo', 'background']).optional(),
    icon_size: z.number().optional(),
    icon_color: z.string().optional(),
    icon_spine: z.boolean().optional(),

    pattern: z.string().optional(),
    pattern_tile_mm: z.number().positive().optional(),
    pattern_color: z.string().optional(),

    spine_color: hsl_color.nullable().optional(),

    // Other
    isbn: z.string().default(''),
    cjk_variant: z.enum(['auto', 'JP', 'KR', 'SC', 'TC', 'HK']).optional(),
})
