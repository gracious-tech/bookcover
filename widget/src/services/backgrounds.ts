
// All suggested background images from assets/backgrounds/
// Run .bin/gen_bg_thumbnails to generate the thumbnails directory
//
// THE FILENAME IS THE ID. These strings are API surface, not an internal detail: they are what
// `bg_image_builtin` reports to an embed host, what a host stores as its background reference,
// and what both a browser and a server join onto their assets path to find the bytes — with no
// resolver or lookup table in between. The extension is data too: hosts derive the MIME type by
// slicing it off the ID. So a re-encode is a NEW ID, never new bytes behind an old one:
// publishing sunset.webp beside sunset.jpg is a second background, not a variant.
//
// TO RETIRE A BACKGROUND, move its name from BACKGROUNDS to RETIRED_BACKGROUNDS. That hides it
// from this app's picker and changes nothing else — stored covers still render, and other apps
// embedding the widget keep offering it or not on their own terms. What you must NOT do to a
// retired image, ever:
//   - Delete assets/backgrounds/<name>. Its bytes still back existing covers, and .bin/
//     gen_bg_regions walks that directory to bake the colour-region table — lose the file and
//     get_builtin_bg_regions() returns null, so an old cover falls back to a live pixel decode
//     and re-renders with shifted auto colours.
//   - Re-encode or re-optimise it. image_regions.ts only trusts a baked entry when the byte
//     length still matches, so new bytes under the same name drop it to that same fallback path.
// Renaming or deleting an entry outright (as opposed to retiring it) breaks every stored cover
// naming it — the 0.9.0 black_/white_ prefix rename already did this once.

import {ref} from 'vue'
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
 *  assets/backgrounds/ (byte-for-byte), stay deployed, and still render in covers that name
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

/** Get the thumbnail URL for a background filename */
export function bg_thumb_url(filename:string):string {
    return `${assets_prefix}backgrounds/thumbnails/${filename}`
}

/** Get the full-size background URL for a background filename */
export function bg_url(filename:string):string {
    return `${assets_prefix}backgrounds/${filename}`
}

/** Fetch a suggested background by filename and wrap it as a File for the form's image slot */
export async function fetch_bg_file(filename:string):Promise<File> {
    const res = await fetch(bg_url(filename))
    const blob = await res.blob()
    return new File([blob], filename, {type: 'image/jpeg'})
}

/** Published filename of the built-in background currently in the form's image slot, or null
 *  when the image is a user upload (or there is no image). Reported to an embed host as the
 *  advisory `bg_image_builtin` field so it can store a reference rather than its own copy of a
 *  shipped image — see generator-web's embed_types.ts. Not part of the form: the record holds
 *  no binaries and no image identity, which the host owns. */
export const builtin_bg_filename = ref<string | null>(null)

/** Id of the host-supplied background suggestion currently in the form's image slot, or null.
 *  Purely so the picker can highlight the tile the user chose — it is never reported back to the
 *  host (which already knows, having just resolved it) and never confused with
 *  builtin_bg_filename: a suggestion is an upload, not a built-in. */
export const adopted_bg_suggestion_id = ref<string | null>(null)

/** Set when the user themselves added the current image (upload, paste, or a host suggestion),
 *  as opposed to picking a known-good built-in. Read-and-cleared by BackgroundSection's
 *  bg_image watcher, which uses it to pop the one-time low-resolution dialog just once per
 *  user-added image. */
export const bg_image_is_user_upload = ref(false)

/** Identity of the image being adopted — which of the mutually exclusive origins it came from,
 *  and whether the user added it themselves */
interface BgImageIdentity {
    // Published filename, when the image is one of the built-ins above
    builtin?: string
    // Host suggestion id, when it arrived over the embed protocol
    suggestion?: string
    // Arms the one-time low-resolution dialog
    user_upload?: boolean
}

/** Put an image (or null) in the form's background slot, replacing whatever was there.
 *
 *  The single way the background image is ever set, so that every piece of identity hanging off
 *  it is rewritten together and no caller can leave a stale one behind: the built-in filename,
 *  the host suggestion id, the user-added flag, and the vector background (mutually exclusive
 *  with a photo). Callers selecting a vector set form.bg_vector_id after calling this with null.
 *
 *  The File is stored exactly as given — see the byte-identity contract on FormState.bg_image
 *  in bookcover-core. Never pass a re-encoded or downscaled copy. */
export function adopt_bg_image(form:FormState, file:File | null,
    identity:BgImageIdentity = {}):void {
    form.bg_image = file
    form.bg_vector_id = null
    builtin_bg_filename.value = identity.builtin ?? null
    adopted_bg_suggestion_id.value = identity.suggestion ?? null
    bg_image_is_user_upload.value = !!file && !!identity.user_upload
}
