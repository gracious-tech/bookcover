
// Photo composite mode — background image metadata and default camera angles

import type {Background} from './types.js'

// Default flat-on-table camera angles: moderate elevation to look down at the cover,
// slight azimuth to show depth without fully revealing the back
export const PHOTO_AZIMUTH = -15
export const PHOTO_ELEVATION = 35

// Book render width as a fraction of the background image width
export const PHOTO_BOOK_SCALE = 0.55

// Available background photos — metadata only; the JPGs themselves live in the repo's shared
// assets tree (assets/3d/backgrounds/<id>.jpg) and consumers fetch them from wherever they
// serve that tree. Each entry can override azimuth, elevation, and book_scale for a natural fit.
export const BACKGROUNDS: Background[] = [
    {
        id: 'table_with_book',
        azimuth: 0,
        elevation: -30,
        book_scale: 1,
        offset_x: -0.1,
        offset_y: 0.08,
        roll: -30,
        light_az: 10,
        light_el: 60,
        ambient: 1,
    },
    {
        id: 'wood',
        azimuth: 0,
        elevation: 0,
        book_scale: 0.75,
        offset_x: 0,
        offset_y: 0,
        roll: 0,
        light_az: 20,
        light_el: 10,
        ambient: 1,
    },
    {
        id: 'coffee_table',
        azimuth: 3,
        elevation: -50,
        book_scale: 0.5,
        offset_x: 0,
        offset_y: 0.06,
        roll: -30,
        light_az: 50,
        light_el: 50,
        ambient: 0.85,
    },
    {
        id: 'table_with_laptop',
        azimuth: 0,
        elevation: -65,
        book_scale: 0.65,
        offset_x: 0.15,
        offset_y: 0.13,
        roll: 25,
        light_az: -30,
        light_el: 40,
        ambient: 0.8,
    },
    {
        id: 'table_side',
        azimuth: -30,
        elevation: 5,
        book_scale: 0.55,
        offset_x: -0.025,
        offset_y: 0.06,
        roll: 0,
        light_az: 20,
        light_el: 20,
        ambient: 1,
    },
]
