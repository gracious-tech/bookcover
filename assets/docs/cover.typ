
// Book cover template — receives all variables from _data.typ
#import "_data.typ": *

// -- Page setup --
#set page(
    width: total_width,
    height: total_height,
    margin: 0mm,
)

#set text(font: font_body_family)
#set quote(block: true)
#show quote: set pad(x: 3em)

// ============================================================
// Helper functions
// ============================================================

#import "_helpers.typ": *


// ============================================================
// Layer 1 — Background fills
// ============================================================

#place(
    top + left,
    rect(
        width: total_width,
        height: total_height,
        fill: if has_front_gradient {
            gradient.linear(
                (color_front_gradient_start, 0%),
                (color_front_bg, 30%),
                (color_front_bg, 45%),
                (color_front_gradient_end, 100%),
                angle: -40deg,
            )
        } else {
            color_front_bg
        },
    ),
)


#if has_pattern {
    let tiled = pattern(
        size: (pattern_tile_w, pattern_tile_h),
        image("pattern.svg", width: pattern_tile_w, height: pattern_tile_h),
    )
    place(
        top + left,
        rect(width: total_width, height: total_height, fill: tiled),
    )
}


// ============================================================
// Layer 2 — Background image
// ============================================================

#if has_image {
    if image_coverage == "full" {
        // Full spread: image covers entire canvas (back + spine + front)
        place(
            top + left,
            dx: 0mm,
            dy: 0mm,
            image(
                image_filename,
                width: total_width,
                height: total_height,
                fit: "cover",
            ),
        )
    } else if image_coverage == "painted" {
        // Painted: image inset on front cover — 15mm margin horizontally and from bottom, 50% trim height
        let painted_w = face_width - 30mm
        let painted_h = face_height * 0.5 // sync: index.ts painted_h = face_height * 0.5
        place(
            top + left,
            dx: front_x + 15mm,
            dy: bleed + face_height * (1/3),
            image(
                image_filename,
                width: painted_w,
                height: painted_h,
                fit: "stretch",  // Should be exact but just in case, ensures full frame visible
            ),
        )
    } else if image_coverage == "feature" {
        // Feature: same size and position as painted but with rounded corners via box clip
        let painted_w = face_width - 30mm
        let painted_h = face_height * 0.5
        place(
            top + left,
            dx: front_x + 15mm,
            dy: bleed + face_height * (1/3),
            box(
                width: painted_w,
                height: painted_h,
                radius: 6mm,
                clip: true,
                image(
                    image_filename,
                    width: painted_w,
                    height: painted_h,
                    fit: "cover",
                ),
            ),
        )
    } else if image_coverage == "front_partial" {
        // Lower 2/3: image covers the full front face width, bottom 2/3 of height, flush to the bottom trim edge
        let w = face_width
        let h = face_height * (2 / 3)
        place(
            top + left,
            dx: front_x,
            dy: bleed + face_height - h,
            image(
                image_filename,
                width: w,
                height: h,
                fit: "cover",
            ),
        )
    } else {
        // Front only: image covers the front panel including all bleed margins
        place(
            top + left,
            dx: front_x,
            dy: 0mm,
            image(
                image_filename,
                width: face_width + bleed,
                height: total_height,
                fit: "cover",
            ),
        )
    }
}


// ============================================================
// Layer 2b — Icon on front cover
// ============================================================

#if has_icon {
    let icon_size = calc.min(face_height * 0.4, face_width * 0.8)
    if icon_mode != "center" {
        icon_size = calc.min(face_height * 0.5, face_width * 0.8)
    }
    // Apply user-controlled size multiplier (1.0 = default)
    icon_size = icon_size * icon_size_mod
    let offset_icon_dx = front_x + (face_width - icon_size) + (icon_size * 0.15)
    let offset_icon_dy = bleed * -1 + (icon_size * 0.15)

    // Place ghost icons first (if any) so below main one
    if icon_mode == "echo" {
        place(
            bottom + left,
            dx: offset_icon_dx + icon_size * 0.1,
            dy: offset_icon_dy - icon_size * 0.15,
            image("icon_ghost.svg", width: icon_size, height: icon_size),
        )
        place(
            bottom + left,
            dx: offset_icon_dx - icon_size * 0.1,
            dy: offset_icon_dy + icon_size * 0.1,
            image("icon_ghost2.svg", width: icon_size, height: icon_size),
        )
    }

    if icon_mode == "background" {
        // Background — icon fills the full face width, centered vertically on the front panel
        place(
            top + left,
            dx: front_x,
            dy: bleed + (face_height - face_width) / 2,
            image("icon_bg.svg", width: icon_size, height: icon_size),
        )
    } else if icon_mode == "center" {
        // Center — large icon centered horizontally, positioned in the lower/mid section
        place(
            bottom + left,
            dx: front_x + (face_width - icon_size) / 2,
            dy: (face_height * 0.2 + bleed) * -1,
            image("icon_main.svg", width: icon_size, height: icon_size),
        )
    } else {
        // Offset/echo: large icon offset towards bottom-right, slightly overflowing the trim edge
        place(
            bottom + left,
            dx: offset_icon_dx,
            dy: offset_icon_dy,
            image("icon_main.svg", width: icon_size, height: icon_size),
        )
    }
}


// ============================================================
// Layer 2c — Spine background
// ============================================================

// Spine background (only when spread has a spine) — drawn after pattern so it covers it
#if has_spine and color_spine_bg != none {
    place(
        top + left,
        dx: spine_x,
        dy: 0mm,
        rect(width: spine_width, height: total_height, fill: color_spine_bg),
    )
}


// ============================================================
// Layer 3 — Back panel content
// ============================================================

// back_margin, back_content_w imported from _data.typ

// Blurb container box with background color and 1cm padding around the text
// Content is scaled down if it would overflow the available back-panel height
#if has_blurb {
    let blurb_content = {
        set par(justify: true) if blurb_justify
        set par(leading: 1em * blurb_spacing)
        // Compact heading styles for a small blurb box — size and leading are hardcoded
        // independent of blurb_spacing, since headings rarely wrap and need tight leading
        show heading.where(level: 1): it => {
            set block(above: 2em, below: 1em)
            set text(size: 1.3em)
            set par(leading: 0.5em)
            it
        }
        show heading.where(level: 2): it => {
            set block(above: 2em, below: 1em)
            set text(size: 1.15em)
            set par(leading: 0.5em)
            it
        }
        align(blurb_alignment, text(
            font: font_blurb_family,
            size: fs_back_blurb * blurb_size,
            fill: color_blurb,
            blurb,
        ))
    }
    let blurb_max_h = back_content_h - blurb_padding * 2
    place(
        top + left,
        dx: back_x + (face_width - blurb_width) / 2,
        dy: bleed + back_margin,
        rect(
            width: blurb_width,
            fill: color_blurb_bg,
            stroke: none,
            radius: 1.5mm,
            inset: blurb_padding,
            context {
                let avail_w = blurb_width - blurb_padding * 2
                let natural = measure(blurb_content, width: avail_w)
                if natural.height > blurb_max_h {
                    let ratio = blurb_max_h / natural.height
                    scale(x: ratio * 100%, y: ratio * 100%, reflow: true, blurb_content)
                } else {
                    blurb_content
                }
            },
        ),
    )
}

// ISBN barcode — position and size from printing-services cover_region_barcode
#if has_barcode {
    place(
        bottom + left,
        dx: barcode_x,
        dy: barcode_y * -1,
        image("barcode.svg", width: barcode_w, height: barcode_h),
    )
}

// ============================================================
// Layer 4 — Spine content
// ============================================================

#if has_spine and has_spine_text and fs_spine_title > 0mm {
    // Title rotated along spine (bottom-to-top reading direction).
    // place() anchors the unrotated bounding box top-left, so we subtract
    // half the unrotated dimensions to keep the visual center on the spine.
    place(
        top + left,
        dx: spine_x + spine_width * 0.5 - face_height * 0.4,
        dy: bleed + face_height * 0.5 - spine_width * 0.5,
        rotate(
            90deg,
            origin: center,
            box(
                width: face_height * 0.8,
                height: spine_width,
                align(
                    center + horizon,
                    // Shrink title + author together as one unit if they overflow the spine length
                    shrink-to-width(
                        stack(
                            dir: ltr,
                            spacing: spine_width * 0.3,
                            text(
                                font: font_spine_title_family,
                                size: fs_spine_title * spine_title_size_mod,
                                fill: color_spine_title,
                                weight: spine_title_weight,
                                style: if spine_title_italic { "italic" } else { "normal" },
                                spine_title,
                            ),
                            if has_author and fs_spine_author > 0mm {
                                text(
                                    font: font_spine_author_family,
                                    size: fs_spine_author * spine_author_size_mod,
                                    fill: color_spine_author,
                                    weight: spine_author_weight,
                                    style: if spine_author_italic { "italic" } else { "normal" },
                                    spine_author,
                                )
                            },
                        ),
                    ),
                ),
            ),
        ),
    )
}

// Small icon at the bottom of the spine (when spine is wide enough for text)
#if has_spine_icon {
    let spine_icon_size = spine_width * 0.7
    place(
        top + left,
        dx: spine_x + (spine_width - spine_icon_size) / 2,
        dy: bleed + face_height - spine_icon_size - spine_width * 0.2,
        image("icon_spine.svg", width: spine_icon_size, height: spine_icon_size),
    )
}

// ============================================================
// Layer 5 — Front panel content
// ============================================================

// front_margin, front_content_w imported from _data.typ

// Base font size — proportional to trim height, multiplied by per-title size modifier
#let fs_title_base = face_height * 0.05
#let fs_subtitle = face_height * 0.025 * subtitle_size
#let fs_author = face_height * 0.035 * author_size

// Render a single title line with its per-title styling, shrunk to fit if too wide
#let render_title(txt, font_family, size_mod, weight, is_italic, color) = {
    if txt != "" {
        box(
            width: front_content_w,
            shrink-to-width(
                align(title_alignment, text(
                    font: font_family,
                    size: fs_title_base * size_mod,
                    fill: color,
                    weight: weight,
                    style: if is_italic { "italic" } else { "normal" },
                    txt,
                )),
            ),
        )
    }
}

// Render each title line, then filter out empty ones so they don't create stack spacing gaps
#let title_lines_rendered = stack(
    dir: ttb,
    spacing: face_height * title_spacing / 100,
    ..(
        render_title(title1, font_title1_family, title1_size, title1_weight, title1_italic, color_front_title1),
        render_title(title2, font_title2_family, title2_size, title2_weight, title2_italic, color_front_title2),
        render_title(title3, font_title3_family, title3_size, title3_weight, title3_italic, color_front_title3),
    ).filter(x => x != none),
)

// All subtitle lines in one container — shrink-to-width scales them all together uniformly
// text() wraps shrink-to-width so inner content inherits the scaled size (no explicit size inside)
#let subtitle_lines_rendered = text(
    font: font_subtitle_family,
    size: fs_subtitle,
    weight: subtitle_weight,
    style: if subtitle_italic { "italic" } else { "normal" },
    fill: color_front_subtitle,
    box(
        width: front_content_w,
        shrink-to-width(
            stack(
                dir: ttb,
                spacing: face_height * subtitle_spacing / 100,
                ..subtitle_lines.map(line => align(subtitle_alignment, line)),
            )
        ),
    ),
)

// Author styled text — single line, shrunk to fit width
#let author_rendered = box(
    width: front_content_w,
    shrink-to-width(
        align(author_alignment, text(
            font: font_author_family,
            size: fs_author,
            fill: color_front_author,
            weight: author_weight,
            style: if author_italic { "italic" } else { "normal" },
            author,
        )),
    ),
)

// Title group: stacked title lines
#let title_group = stack(
    dir: ttb,
    spacing: face_height * title_spacing / 100,
    title_lines_rendered,
)

// Check which elements belong to each position box
#let top_has_title = title_position == "top"
#let top_has_subtitle = has_subtitle and subtitle_position == "top"
#let top_has_author = has_author and author_position == "top"
#let top_has_any = top_has_title or top_has_subtitle or top_has_author

#let mid_has_title = title_position == "middle"
#let mid_has_subtitle = has_subtitle and subtitle_position == "middle"
#let mid_has_author = has_author and author_position == "middle"
#let mid_has_any = mid_has_title or mid_has_subtitle or mid_has_author

#let bot_has_title = title_position == "bottom"
#let bot_has_subtitle = has_subtitle and subtitle_position == "bottom"
#let bot_has_author = has_author and author_position == "bottom"
#let bot_has_any = bot_has_title or bot_has_subtitle or bot_has_author

// Build a content group for a position box (order within box: title | subtitle | author)
// Each element gets its own vertical margins inside the box
#let make_pos_box(has_t, has_s, has_a) = box(
    width: front_content_w,
    stack(
        dir: ttb,
        if has_t { v(face_height * title_margin_top / 100) },
        if has_t { title_group },
        if has_t { v(face_height * title_margin_bottom / 100) },
        if has_s { v(face_height * subtitle_margin_top / 100) },
        if has_s { subtitle_lines_rendered },
        if has_s { v(face_height * subtitle_margin_bottom / 100) },
        if has_a { v(face_height * author_margin_top / 100) },
        if has_a { author_rendered },
        if has_a { v(face_height * author_margin_bottom / 100) },
    ),
)

// Place each non-empty position box on the front panel (within panel margin on all sides)
#if top_has_any {
    place(
        top + left,
        dx: front_x + front_margin,
        dy: bleed + front_margin,
        make_pos_box(top_has_title, top_has_subtitle, top_has_author),
    )
}
#if mid_has_any {
    place(
        horizon + left,
        dx: front_x + front_margin,
        make_pos_box(mid_has_title, mid_has_subtitle, mid_has_author),
    )
}
#if bot_has_any {
    place(
        bottom + left,
        dx: front_x + front_margin,
        dy: (bleed + front_margin) * -1,
        make_pos_box(bot_has_title, bot_has_subtitle, bot_has_author),
    )
}
