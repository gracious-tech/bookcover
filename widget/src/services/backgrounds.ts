
// All suggested background images from assets/backgrounds/
// Run .bin/gen_bg_thumbnails to generate thumbnails/ (this picker's tiles), previews_2700/ (what
// previews render from — see BG_PREVIEW_DIR) and previews_800/ (unused here — paper.bible's
// large thumbnails for choosing a cover design)
//
// THE FILENAME IS THE ID. These strings are API surface, not an internal detail: they are what
// form.bg_image_builtin holds in place of any bytes, what `bg_image_builtin` reports to an embed
// host, what a host stores as its background reference, and what both a browser and a server
// join onto their assets path to find the bytes (original, preview or thumbnail alike) — with no
// resolver or lookup table in between. The extension is data too: hosts derive the MIME type by
// slicing it off the ID. So a format change is a NEW ID: publishing sunset.webp beside
// sunset.jpg is a second background, not a variant.
//
// The ID names the picture, not the bytes. A visually identical re-encode at the same pixel
// size and format may replace a file in place: keep the untouched original in
// assets/backgrounds/originals/ and rerun .bin/gen_bg_regions (the baked colour regions are a
// rough read, so the re-bake shifts nothing that matters). Anything that changes what the
// picture looks like — new pixels, crop or dimensions — is a new ID.
//
// TO RETIRE A BACKGROUND, move its name from BACKGROUNDS to RETIRED_BACKGROUNDS. That hides it
// from this app's picker and changes nothing else — stored covers still render, and other apps
// embedding the widget keep offering it or not on their own terms. What you must NOT do to any
// background, retired or not, is delete assets/backgrounds/<name>: its file still backs existing
// covers, and .bin/gen_bg_regions walks that directory to bake the colour-region table — lose the
// file and get_builtin_bg_regions() returns null, so an old cover falls back to a live pixel
// decode. Renaming or deleting an entry outright (as opposed to retiring it) breaks every stored
// cover naming it — the 0.9.0 black_/white_ prefix rename already did this once.

import {ref} from 'vue'
import {BG_PREVIEW_DIR} from 'bookcover-web'
import type {FormState} from 'bookcover-web'
import {assets_prefix} from '../assets'

/** Backgrounds offered in this app's picker */
export const BACKGROUNDS: string[] = [

    // Tropical
    'beach.jpg',
    'island.jpg',
    'tropical.jpg',

    // Water
    'lake.jpg',
    'lake_tree.jpg',
    'sea.jpg',
    'surge.jpg',
    'israel_lake.jpg',
    'israel.jpg',

    // Desert
    'desert.jpg',
    'desert_sunset.jpg',
    'wilderness.jpg',

    // Countryside
    'vineyard.jpg',
    'countryside.jpg',
    'green.jpg',

    // Mysterious nature
    'hills_trees.jpg',
    'mist.jpg',
    'hills.jpg',
    'mountains.jpg',
    'snow.jpg',
    'snow_trees.jpg',

    // Growing
    'grass.jpg',
    'crops.jpg',
    'flowers_field.jpg',
    'flowers.jpg',
    'flowers_red.jpg',
    'growing.jpg',
    'plant.jpg',
    'plant_table.jpg',

    // Animals
    'sheep.jpg',
    'lion.jpg',
    'bird.jpg',

    // People
    'awe.jpg',
    'reflecting.jpg',
    'adventure.jpg',

    // Civilization
    'city.jpg',
    'city_sunset.jpg',
    'plane.jpg',

    // Work
    'books.jpg',
    'work.jpg',
    'funding.jpg',

    // Destruction
    'fire.jpg',
    'burning.jpg',
    'wasteland.jpg',

    // Kingship & battle
    'crown.jpg',
    'sword.jpg',

    // Sunset
    'sunset.jpg',
    'sunset_tree.jpg',

    // Space
    'stars.jpg',
    'earth.jpg',
    'earth_whole.jpg',
    'rocket.jpg',

    // Christian
    'church.jpg',
    'bible.jpg',
    'lost_sheep.jpg',
    'cross.jpg',
    'cross_sun.jpg',
    'tomb.jpg',
    'opening.jpg',
]

/** Backgrounds withdrawn from the picker but still fully valid: their files stay in
 *  assets/backgrounds/, stay deployed, and still render in covers that name
 *  them. Listing them here is what records that those files are still required — an entry
 *  deleted from BACKGROUNDS and left out of this list looks like an orphaned asset to whoever
 *  tidies up next. See the retirement rules at the top of this file. */
export const RETIRED_BACKGROUNDS: string[] = []

/** Every valid background ID, offered or retired. This is the set that must never lose an
 *  entry — it's the floor a stored cover can name and still be reproduced. */
export const ALL_BACKGROUNDS: string[] = [...BACKGROUNDS, ...RETIRED_BACKGROUNDS]

// Diverse backgrounds shown as the trigger button strip
export const PREVIEW_BGS = [
    'city_sunset.jpg',
    'desert_sunset.jpg',
    'flowers_red.jpg',
    'hills_trees.jpg',
]

/** Whether a name is a background this app ships (offered or retired) */
export function is_builtin_bg(filename:string):boolean {
    return ALL_BACKGROUNDS.includes(filename)
}

/** Get the thumbnail URL for a background filename */
export function bg_thumb_url(filename:string):string {
    return `${assets_prefix}backgrounds/thumbnails/${filename}`
}

/** Get the preview-sized URL for a background filename — what previews render from */
export function bg_preview_url(filename:string):string {
    return `${assets_prefix}${BG_PREVIEW_DIR}${filename}`
}

/** Get the full-size background URL for a background filename — only final output needs it */
export function bg_url(filename:string):string {
    return `${assets_prefix}backgrounds/${filename}`
}

/** Fetch a background image and wrap it as a File named for the built-in it's a copy of */
async function fetch_bg_file(url:string, filename:string):Promise<File> {
    const res = await fetch(url)
    if (!res.ok)
        throw new Error(`Background "${filename}" failed to load (${res.status})`)
    const blob = await res.blob()
    return new File([blob], filename, {type: blob.type || 'image/jpeg'})
}

// How many preview copies to keep in memory (~380KB each) — enough that flicking back and forth
// through a handful of backgrounds never refetches
const PREVIEW_CACHE_SIZE = 8

// Recently fetched preview copies by filename, least recently used first. Cached as promises so
// a hover prefetch and the render it precedes share one request; a failed fetch is dropped so
// the next attempt retries
const preview_cache = new Map<string, Promise<File>>()

/** Fetch a built-in's preview-sized copy (see bg_preview_url), from the cache when possible */
export function fetch_bg_preview(filename:string):Promise<File> {
    let file = preview_cache.get(filename)
    if (file) {
        // Move to the most-recently-used end
        preview_cache.delete(filename)
    }
    else {
        file = fetch_bg_file(bg_preview_url(filename), filename)
        file.catch(() => {
            if (preview_cache.get(filename) === file)
                preview_cache.delete(filename)
        })
    }
    preview_cache.set(filename, file)

    // Evict the least recently used beyond the cap
    while (preview_cache.size > PREVIEW_CACHE_SIZE)
        preview_cache.delete(preview_cache.keys().next().value as string)
    return file
}

/** Fetch a built-in's original, for final output. Not cached here: the file is immutable per
 *  name, so the browser's HTTP cache already serves a repeat export */
export function fetch_bg_original(filename:string):Promise<File> {
    return fetch_bg_file(bg_url(filename), filename)
}

/** The image to render the form's background from: an upload's own File, or for a built-in its
 *  preview-sized copy ('preview') or original ('final'). Undefined when there's no image */
export async function read_render_image(form:FormState,
    use:'preview' | 'final'):Promise<File | undefined> {
    if (form.bg_image_builtin) {
        return use === 'preview'
            ? fetch_bg_preview(form.bg_image_builtin)
            : fetch_bg_original(form.bg_image_builtin)
    }
    return form.bg_image ?? undefined
}

/** Id of the host-supplied background suggestion currently in the form's image slot, or null.
 *  Purely so the picker can highlight the tile the user chose — it is never reported back to the
 *  host (which already knows, having just resolved it) and never confused with
 *  form.bg_image_builtin: a suggestion is an upload, not a built-in. */
export const adopted_bg_suggestion_id = ref<string | null>(null)

/** Set when the user themselves added the current image (upload, paste, or a host suggestion),
 *  as opposed to picking a known-good built-in. Read-and-cleared by BackgroundSection's
 *  bg_image watcher, which uses it to pop the one-time low-resolution dialog just once per
 *  user-added image. */
export const bg_image_is_user_upload = ref(false)

/** What goes in the background slot: an uploaded image's bytes, or a built-in's ID (no bytes) */
export type BgImage = {file:File} | {builtin:string}

/** Where an uploaded image came from */
interface BgImageOrigin {
    // Host suggestion id, when it arrived over the embed protocol
    suggestion?: string
    // Arms the one-time low-resolution dialog
    user_upload?: boolean
}

/** Put an image (or null) in the form's background slot, replacing whatever was there.
 *
 *  The single way the background image is ever set, so that every piece of identity hanging off
 *  it is rewritten together and no caller can leave a stale one behind: the upload's bytes and
 *  the built-in's ID (at most one of them set), the host suggestion id, the user-added flag, and
 *  the vector background (mutually exclusive with a photo). Callers selecting a vector set
 *  form.bg_vector_id after calling this with null.
 *
 *  An uploaded File is stored exactly as given — see the byte-identity contract on
 *  FormState.bg_image in bookcover-core. Never pass a re-encoded or downscaled copy. */
export function adopt_bg_image(form:FormState, image:BgImage | null,
    origin:BgImageOrigin = {}):void {
    form.bg_image = image && 'file' in image ? image.file : null
    form.bg_image_builtin = image && 'builtin' in image ? image.builtin : null
    form.bg_vector_id = null
    adopted_bg_suggestion_id.value = origin.suggestion ?? null
    bg_image_is_user_upload.value = !!form.bg_image && !!origin.user_upload
}
