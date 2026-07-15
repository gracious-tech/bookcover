
// Apply a decorative PNG frame mask to an image using the Canvas API

// Platform-injectable frame processing function — generator-web passes frame_image, generator-node may supply a sharp-based alternative
export type FrameImageFn = (image:Blob, frame_data:Blob, bg:string, width:number, height:number) => Promise<Blob>

import {asset_path, FRAMES_DIR} from './assets.js'

// Frame filenames within the assets/frames/ directory
export const FRAME_FILES:Record<'painted'|'torn', string> = {
    'painted': 'painted.png',
    'torn': 'torn.png',
}

// Build a path to a frame asset file
export function frame_asset_path(base:string, frame:'painted'|'torn'):string {
    return asset_path(base, FRAMES_DIR, FRAME_FILES[frame])
}

/** Create a 2D canvas — a DOM element on the main thread, OffscreenCanvas inside a worker */
function make_canvas(width:number, height:number):HTMLCanvasElement|OffscreenCanvas {
    if (typeof document === 'undefined') {
        return new OffscreenCanvas(width, height)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
}

/** Export a canvas' contents as a PNG Blob (handles both canvas types) */
function canvas_png_blob(canvas:HTMLCanvasElement|OffscreenCanvas):Promise<Blob> {
    if ('convertToBlob' in canvas) {
        return canvas.convertToBlob({type: 'image/png'})
    }
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob)
                resolve(blob)
            else
                reject(new Error('canvas.toBlob returned null'))
        }, 'image/png')
    })
}

/**
 * Compute source crop rect so the image covers the canvas (like CSS object-fit: cover),
 * centered with no distortion.
 */
function cover_crop(
    iw:number, ih:number, cw:number, ch:number,
):{sx:number, sy:number, sw:number, sh:number} {
    const scale = Math.max(cw / iw, ch / ih)
    const sw = cw / scale
    const sh = ch / scale
    const sx = (iw - sw) / 2
    const sy = (ih - sh) / 2
    return {sx, sy, sw, sh}
}

/**
 * Apply a decorative frame to an image.
 *
 * The frame PNG has a white (opaque) border and transparent center.
 * The opaque border is used to cut away the image edges (destination-out blend),
 * leaving a transparent border with the image showing through the center.
 *
 * Rotation is constrained so the frame's natural orientation matches the canvas:
 * same orientation (both portrait or both landscape) → 0° or 180°;
 * different orientations → 90° or 270°. Horizontal and vertical flips are always random.
 * This ensures the frame always covers the canvas edges correctly.
 *
 * @param image      - Source image as a Blob
 * @param frame_data - Frame PNG as a Blob (loaded by the platform wrapper from assets)
 * @param bg         - CSS background color drawn under the image (e.g. '#ffffff')
 * @param width      - Output canvas width in pixels
 * @param height     - Output canvas height in pixels
 * @returns PNG Blob with frame applied
 */
export async function frame_image(
    image:Blob,
    frame_data:Blob,
    bg:string,
    width:number,
    height:number,
):Promise<Blob> {

    // Create output canvas (worker-safe)
    const canvas = make_canvas(width, height)
    const ctx = (canvas as HTMLCanvasElement).getContext('2d')!

    // Fill background color
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    // Draw image covering canvas (centered, no distortion)
    const img_bitmap = await createImageBitmap(image)
    const {sx, sy, sw, sh} = cover_crop(img_bitmap.width, img_bitmap.height, width, height)
    ctx.drawImage(img_bitmap, sx, sy, sw, sh, 0, 0, width, height)
    img_bitmap.close()

    // Load frame PNG from caller-provided data
    const frame_bitmap = await createImageBitmap(frame_data)

    // NOTE RANDOMNESS DISABLED
    // Randomness was added in anticipation of multi-image books, but annoying for cover
    // for the frame to always be changing
    const random_num = 0  // Set to Math.random() for multi-image books

    // Constrain rotation so the frame's orientation aligns with the canvas:
    // matching orientations (both portrait or both landscape) → 0° or 180°;
    // mismatched orientations → 90° or 270° to bring them into alignment.
    const frame_portrait  = frame_bitmap.height >= frame_bitmap.width
    const canvas_portrait = height >= width
    const rot_candidates  = frame_portrait === canvas_portrait ? [0, 2] : [1, 3]
    const rot_steps = rot_candidates[Math.floor(random_num * 2)]
    const flip_h    = random_num < 0.5
    const flip_v    = random_num < 0.5
    const angle_rad = rot_steps * (Math.PI / 2)
    const scale_x   = flip_h ? -1 : 1
    const scale_y   = flip_v ? -1 : 1

    // When rotated 90°/270° the draw dimensions must be swapped so the frame
    // fills the canvas in screen space (the rotation exchanges width and height).
    const draw_w = rot_steps % 2 === 1 ? height : width
    const draw_h = rot_steps % 2 === 1 ? width  : height

    // Draw frame with destination-out: opaque frame pixels erase image pixels beneath them,
    // leaving transparent where the frame border is and image visible through the center
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.translate(width / 2, height / 2)
    ctx.rotate(angle_rad)
    ctx.scale(scale_x, scale_y)
    ctx.drawImage(frame_bitmap, -draw_w / 2, -draw_h / 2, draw_w, draw_h)
    ctx.restore()
    frame_bitmap.close()

    // Export canvas to PNG Blob
    return canvas_png_blob(canvas)
}
