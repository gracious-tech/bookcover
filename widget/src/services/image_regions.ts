
// Decodes an uploaded background image into raw RGBA pixel data (for auto color matching — see
// image_regions_cache.ts); the actual dominant-color sampling (analyze_pixel_regions) is pure
// and lives in bookcover-core, so it can be shared with non-browser hosts of the generator.
// Builtin suggested backgrounds (see services/backgrounds.ts) skip the decode entirely via a
// precomputed table, also in bookcover-core — see get_builtin_bg_regions.

import type {ImageRegions} from 'bookcover-web'
import {analyze_pixel_regions, get_builtin_bg_regions} from 'bookcover-web'
import type {compute_cover_dims} from '../dimensions'

type CoverDims = ReturnType<typeof compute_cover_dims>

// Downscale target (longest edge, px) — plenty of resolution for a dominant-color read, keeps
// the pixel scan cheap
const MAX_DIM = 400

/**
 * Sample a background image's dominant colors, under both interpretations at once. `dims`,
 * when provided, locates the front/back panels and spine strip within the image under a
 * full-wrap interpretation (used when bg_image_coverage is 'full'); pass null to skip that
 * (front_top_full/front_bottom_full/back/spine all come back null). Skips decoding entirely
 * when `file` is a known builtin background (matched by filename + byte size) — see
 * get_builtin_bg_regions.
 */
export async function analyze_image_regions(file:File, dims:CoverDims | null):Promise<ImageRegions> {
    const builtin = get_builtin_bg_regions(file.name, file.size)
    if (builtin) return builtin

    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const {data} = ctx.getImageData(0, 0, w, h)

    return analyze_pixel_regions(data, w, h, dims)
}
