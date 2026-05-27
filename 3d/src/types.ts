
// Exported public types for the cover-3d module

/** SVG strings for each face of the book cover */
export interface BookFaces {
    front:string
    back:string
    spine?:string
}

export type CoverType = 'paperback' | 'paperback_coil' | 'paperback_wire' | 'paperback_stitch' | 'hardcover' | 'hardcover_jacket'

export interface GenerateOptions {
    cover_type?:CoverType
    // Horizontal camera angle in degrees (0 = straight-on, negative = see spine)
    azimuth?:number
    // Vertical camera angle in degrees (positive = looking down)
    elevation?:number
    // Clockwise roll in degrees around the view axis (positive = clockwise)
    roll?:number
    width?:number
    height?:number
}

/** Options for compositing the book render onto a background photo */
export interface PhotoCompositeOptions {
    // Camera angles — defaults give a flat-on-table perspective
    azimuth?:number
    elevation?:number
    zoom?:number
    // Clockwise roll in degrees around the view axis (positive = clockwise)
    roll?:number
    // Book width as a fraction of background image width
    book_scale?:number
    // Position offset as a fraction of background dimensions (0 = centred)
    offset_x?:number
    offset_y?:number
    // Light source direction: where the light comes FROM, in degrees.
    // light_az: horizontal (0=front, 90=right, -90=left); light_el: vertical (positive=above)
    light_az?:number
    light_el?:number
    // Ambient light level 0–1 (higher = brighter, less contrast between faces)
    ambient?:number
}

/** A named background photo — extends PhotoCompositeOptions so it can be passed directly */
export interface Background extends PhotoCompositeOptions {
    id:string
}
