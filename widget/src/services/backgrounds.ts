
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
