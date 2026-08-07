
// All suggested background images from assets/backgrounds/
// Run .bin/gen_bg_thumbnails to generate the thumbnails directory

import {assets_prefix} from '../assets'

export const BACKGROUNDS: string[] = [

    // Tropical
    'black_beach.jpg',
    'black_island.jpg',
    'black_tropical.jpg',

    // Water
    'black_lake.jpg',
    'black_lake_tree.jpg',
    'black_sea.jpg',
    'black_surge.jpg',

    // Desert
    'black_desert.jpg',
    'black_desert_sunset.jpg',

    // Countryside
    'black_vineyard.jpg',
    'black_countryside.jpg',

    // Mysterious nature
    'black_hills_trees.jpg',
    'black_mist.jpg',
    'black_hills.jpg',
    'black_snow.jpg',
    'black_snow_trees.jpg',

    // Growing
    'black_grass.jpg',
    'black_crops.jpg',
    'black_flowers_field.jpg',
    'black_flowers.jpg',
    'black_flowers_red.jpg',
    'black_growing.jpg',

    // Animals
    'black_sheep.jpg',
    'black_lion.jpg',

    // People
    'black_awe.jpg',
    'black_reflecting.jpg',
    'black_adventure.jpg',

    // Civilization
    'black_city.jpg',
    'black_city_sunset.jpg',
    'black_plane.jpg',

    // Work
    'black_books.jpg',
    'black_work.jpg',
    'black_funding.jpg',

    // WHITE TEXT

    // Fire
    'white_fire.jpg',
    'white_burning.jpg',

    // Sunset
    'white_sunset.jpg',
    'white_sunset_tree.jpg',

    // Plants
    'white_growing.jpg',
    'white_plant.jpg',
    'white_plant_table.jpg',

    // Space
    'white_earth.jpg',
    'white_stars.jpg',

    // Christian
    'white_church.jpg',
    'white_bible.jpg',
    'white_lost_sheep.jpg',
    'white_cross.jpg',
]

// Diverse backgrounds shown as the trigger button strip
export const PREVIEW_BGS = [
    'black_city_sunset.jpg',
    'black_desert_sunset.jpg',
    'black_flowers_red.jpg',
    'black_hills_trees.jpg',
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
