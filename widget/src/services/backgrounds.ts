
// All suggested background images from assets/backgrounds/
// Run .bin/gen_bg_thumbnails to generate the thumbnails directory

import {assets_prefix} from '../assets'

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
    'snow.jpg',
    'snow_trees.jpg',

    // Growing
    'grass.jpg',
    'crops.jpg',
    'flowers_field.jpg',
    'flowers.jpg',
    'flowers_red.jpg',

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
    'rocket.jpg',

    // Work
    'books.jpg',
    'work.jpg',
    'funding.jpg',

    // WHITE TEXT

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

    // Plants
    'growing.jpg',
    'plant.jpg',
    'plant_table.jpg',

    // Space
    'stars.jpg',
    'earth.jpg',
    'earth_whole.jpg',

    // Christian
    'church.jpg',
    'bible.jpg',
    'lost_sheep.jpg',
    'cross.jpg',
    'cross_sun.jpg',
    'tomb.jpg',
    'opening.jpg',
]

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
