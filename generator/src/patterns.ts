// Available background patterns for the cover generator — metadata only.
// The SVG strings live in patterns_svg.ts so that importing a pattern's tile size (which
// build_schema() does on the main thread) doesn't drag the whole ~220KB SVG payload along.
// Patterns have been adapted from heropatterns.com (dual MIT license & CC BY 4.0)
// See also https://github.com/sschoger/hero-patterns

/** Union of every built-in pattern ID — keeps PATTERN_SVGS in patterns_svg.ts exhaustive,
  * so adding a pattern here without its SVG (or vice versa) is a type error */
export type PatternId =
    'anchors-away' | 'architect' | 'autumn' | 'aztec' | 'bamboo' | 'bank-note' | 'bathroom-floor'
    | 'bevel-circle' | 'boxes' | 'brick-wall' | 'bubbles' | 'cage' | 'charlie-brown'
    | 'church-on-sunday' | 'circles-and-squares' | 'circuit-board' | 'connections' | 'cork-screw'
    | 'current' | 'curtain' | 'cutout' | 'death-star' | 'diagonal-lines' | 'diagonal-stripes'
    | 'dominos' | 'endless-clouds' | 'eyes' | 'falling-triangles' | 'fancy-rectangles'
    | 'flipped-diamonds' | 'floating-cogs' | 'floor-tile' | 'formal-invitation'
    | 'four-point-stars' | 'glamorous' | 'graph-paper' | 'groovy' | 'happy-intersection'
    | 'heavy-rain' | 'hexagons' | 'hideout' | 'houndstooth' | 'i-like-food'
    | 'intersecting-circles' | 'jigsaw' | 'jupiter' | 'kiwi' | 'leaf' | 'lines-in-motion' | 'lips'
    | 'lisbon' | 'melt' | 'moroccan' | 'morphing-diamonds' | 'overcast' | 'overlapping-circles'
    | 'overlapping-diamonds' | 'overlapping-hexagons' | 'parkay-floor' | 'piano-man'
    | 'pie-factory' | 'pixel-dots' | 'plus' | 'polka-dots' | 'rails' | 'rain' | 'random-shapes'
    | 'rounded-plus-connected' | 'signal' | 'skulls' | 'slanted-stars' | 'squares-in-squares'
    | 'squares' | 'stamp-collection' | 'steel-beams' | 'stripes' | 'temple' | 'texture'
    | 'tic-tac-toe' | 'tiny-checkers' | 'topography' | 'volcano-lamp' | 'wallpaper' | 'wiggle'
    | 'x-equals' | 'yyy' | 'zig-zag'

export interface PatternDef {
    id:string
    name:string
    // Physical size in mm on printed page — varies per pattern since each has a different viewBox
    tile_mm:number
    // Natural width/height of the SVG tile — lets the picker size preview swatches
    // without having loaded the SVG payload itself (see patterns_svg.ts)
    aspect_ratio:number
}

/** All available background patterns */
const PATTERNS:PatternDef[] = [
    {
        id: 'anchors-away',
        name: "Anchors Away",
        tile_mm: 21,
        aspect_ratio: 1,
    },
    {
        id: 'architect',
        name: "Architect",
        tile_mm: 26,
        aspect_ratio: 0.5025,
    },
    {
        id: 'autumn',
        name: "Autumn",
        tile_mm: 23,
        aspect_ratio: 3.6667,
    },
    {
        id: 'aztec',
        name: "Aztec",
        tile_mm: 8,
        aspect_ratio: 0.5,
    },
    {
        id: 'bamboo',
        name: "Bamboo",
        tile_mm: 4,
        aspect_ratio: 0.5,
    },
    {
        id: 'bank-note',
        name: "Bank Note",
        tile_mm: 26,
        aspect_ratio: 5,
    },
    {
        id: 'bathroom-floor',
        name: "Bathroom Floor",
        tile_mm: 21,
        aspect_ratio: 1,
    },
    {
        id: 'bevel-circle',
        name: "Bevel Circle",
        tile_mm: 10,
        aspect_ratio: 1,
    },
    {
        id: 'boxes',
        name: "Boxes",
        tile_mm: 5,
        aspect_ratio: 1,
    },
    {
        id: 'brick-wall',
        name: "Brick Wall",
        tile_mm: 11,
        aspect_ratio: 0.9545,
    },
    {
        id: 'bubbles',
        name: "Bubbles",
        tile_mm: 26,
        aspect_ratio: 1,
    },
    {
        id: 'cage',
        name: "Cage",
        tile_mm: 8,
        aspect_ratio: 1.2308,
    },
    {
        id: 'charlie-brown',
        name: "Charlie Brown",
        tile_mm: 5,
        aspect_ratio: 1.6667,
    },
    {
        id: 'church-on-sunday',
        name: "Church On Sunday",
        tile_mm: 21,
        aspect_ratio: 1,
    },
    {
        id: 'circles-and-squares',
        name: "Circles And Squares",
        tile_mm: 11,
        aspect_ratio: 1,
    },
    {
        id: 'circuit-board',
        name: "Circuit Board",
        tile_mm: 80,
        aspect_ratio: 1,
    },
    {
        id: 'connections',
        name: "Connections",
        tile_mm: 10,
        aspect_ratio: 1,
    },
    {
        id: 'cork-screw',
        name: "Cork Screw",
        tile_mm: 5,
        aspect_ratio: 1.25,
    },
    {
        id: 'current',
        name: "Current",
        tile_mm: 20,
        aspect_ratio: 4.2222,
    },
    {
        id: 'curtain',
        name: "Curtain",
        tile_mm: 12,
        aspect_ratio: 3.6667,
    },
    {
        id: 'cutout',
        name: "Cutout",
        tile_mm: 13,
        aspect_ratio: 1,
    },
    {
        id: 'death-star',
        name: "Death Star",
        tile_mm: 21,
        aspect_ratio: 0.7619,
    },
    {
        id: 'diagonal-lines',
        name: "Diagonal Lines",
        tile_mm: 2,
        aspect_ratio: 1,
    },
    {
        id: 'diagonal-stripes',
        name: "Diagonal Stripes",
        tile_mm: 11,
        aspect_ratio: 1,
    },
    {
        id: 'dominos',
        name: "Dominos",
        tile_mm: 33,
        aspect_ratio: 1.5,
    },
    {
        id: 'endless-clouds',
        name: "Endless Clouds",
        tile_mm: 15,
        aspect_ratio: 2,
    },
    {
        id: 'eyes',
        name: "Eyes",
        tile_mm: 5,
        aspect_ratio: 1.6667,
    },
    {
        id: 'falling-triangles',
        name: "Falling Triangles",
        tile_mm: 10,
        aspect_ratio: 0.5,
    },
    {
        id: 'fancy-rectangles',
        name: "Fancy Rectangles",
        tile_mm: 16,
        aspect_ratio: 1.25,
    },
    {
        id: 'flipped-diamonds',
        name: "Flipped Diamonds",
        tile_mm: 4,
        aspect_ratio: 0.8,
    },
    {
        id: 'floating-cogs',
        name: "Floating Cogs",
        tile_mm: 95,
        aspect_ratio: 1,
    },
    {
        id: 'floor-tile',
        name: "Floor Tile",
        tile_mm: 8,
        aspect_ratio: 1,
    },
    {
        id: 'formal-invitation',
        name: "Formal Invitation",
        tile_mm: 26,
        aspect_ratio: 5.5556,
    },
    {
        id: 'four-point-stars',
        name: "Four Point Stars",
        tile_mm: 6,
        aspect_ratio: 1,
    },
    {
        id: 'glamorous',
        name: "Glamorous",
        tile_mm: 48,
        aspect_ratio: 1,
    },
    {
        id: 'graph-paper',
        name: "Graph Paper",
        tile_mm: 26,
        aspect_ratio: 1,
    },
    {
        id: 'groovy',
        name: "Groovy",
        tile_mm: 6,
        aspect_ratio: 0.6,
    },
    {
        id: 'happy-intersection',
        name: "Happy Intersection",
        tile_mm: 23,
        aspect_ratio: 1,
    },
    {
        id: 'heavy-rain',
        name: "Heavy Rain",
        tile_mm: 3,
        aspect_ratio: 0.5,
    },
    {
        id: 'hexagons',
        name: "Hexagons",
        tile_mm: 7,
        aspect_ratio: 0.5714,
    },
    {
        id: 'hideout',
        name: "Hideout",
        tile_mm: 11,
        aspect_ratio: 1,
    },
    {
        id: 'houndstooth',
        name: "Houndstooth",
        tile_mm: 6,
        aspect_ratio: 1,
    },
    {
        id: 'i-like-food',
        name: "I Like Food",
        tile_mm: 69,
        aspect_ratio: 1,
    },
    {
        id: 'intersecting-circles',
        name: "Intersecting Circles",
        tile_mm: 8,
        aspect_ratio: 1,
    },
    {
        id: 'jigsaw',
        name: "Jigsaw",
        tile_mm: 51,
        aspect_ratio: 1,
    },
    {
        id: 'jupiter',
        name: "Jupiter",
        tile_mm: 14,
        aspect_ratio: 1,
    },
    {
        id: 'kiwi',
        name: "Kiwi",
        tile_mm: 9,
        aspect_ratio: 0.7727,
    },
    {
        id: 'leaf',
        name: "Leaf",
        tile_mm: 21,
        aspect_ratio: 2,
    },
    {
        id: 'lines-in-motion',
        name: "Lines In Motion",
        tile_mm: 32,
        aspect_ratio: 1,
    },
    {
        id: 'lips',
        name: "Lips",
        tile_mm: 30,
        aspect_ratio: 1.2174,
    },
    {
        id: 'lisbon',
        name: "Lisbon",
        tile_mm: 21,
        aspect_ratio: 1,
    },
    {
        id: 'melt',
        name: "Melt",
        tile_mm: 6,
        aspect_ratio: 1.2,
    },
    {
        id: 'moroccan',
        name: "Moroccan",
        tile_mm: 21,
        aspect_ratio: 0.9091,
    },
    {
        id: 'morphing-diamonds',
        name: "Morphing Diamonds",
        tile_mm: 16,
        aspect_ratio: 1,
    },
    {
        id: 'overcast',
        name: "Overcast",
        tile_mm: 21,
        aspect_ratio: 1,
    },
    {
        id: 'overlapping-circles',
        name: "Overlapping Circles",
        tile_mm: 21,
        aspect_ratio: 1,
    },
    {
        id: 'overlapping-diamonds',
        name: "Overlapping Diamonds",
        tile_mm: 13,
        aspect_ratio: 0.75,
    },
    {
        id: 'overlapping-hexagons',
        name: "Overlapping Hexagons",
        tile_mm: 13,
        aspect_ratio: 1.25,
    },
    {
        id: 'parkay-floor',
        name: "Parkay Floor",
        tile_mm: 11,
        aspect_ratio: 1,
    },
    {
        id: 'piano-man',
        name: "Piano Man",
        tile_mm: 19,
        aspect_ratio: 1.5217,
    },
    {
        id: 'pie-factory',
        name: "Pie Factory",
        tile_mm: 16,
        aspect_ratio: 1,
    },
    {
        id: 'pixel-dots',
        name: "Pixel Dots",
        tile_mm: 4,
        aspect_ratio: 1,
    },
    {
        id: 'plus',
        name: "Plus",
        tile_mm: 16,
        aspect_ratio: 1,
    },
    {
        id: 'polka-dots',
        name: "Polka Dots",
        tile_mm: 5,
        aspect_ratio: 1,
    },
    {
        id: 'rails',
        name: "Rails",
        tile_mm: 5,
        aspect_ratio: 2,
    },
    {
        id: 'rain',
        name: "Rain",
        tile_mm: 3,
        aspect_ratio: 0.75,
    },
    {
        id: 'random-shapes',
        name: "Random Shapes",
        tile_mm: 21,
        aspect_ratio: 1,
    },
    {
        id: 'rounded-plus-connected',
        name: "Rounded Plus Connected",
        tile_mm: 22,
        aspect_ratio: 1,
    },
    {
        id: 'signal',
        name: "Signal",
        tile_mm: 22,
        aspect_ratio: 1.75,
    },
    {
        id: 'skulls',
        name: "Skulls",
        tile_mm: 48,
        aspect_ratio: 1,
    },
    {
        id: 'slanted-stars',
        name: "Slanted Stars",
        tile_mm: 8,
        aspect_ratio: 1,
    },
    {
        id: 'squares-in-squares',
        name: "Squares In Squares",
        tile_mm: 19,
        aspect_ratio: 1,
    },
    {
        id: 'squares',
        name: "Squares",
        tile_mm: 8,
        aspect_ratio: 1,
    },
    {
        id: 'stamp-collection',
        name: "Stamp Collection",
        tile_mm: 20,
        aspect_ratio: 0.7196,
    },
    {
        id: 'steel-beams',
        name: "Steel Beams",
        tile_mm: 11,
        aspect_ratio: 0.7241,
    },
    {
        id: 'stripes',
        name: "Stripes",
        tile_mm: 11,
        aspect_ratio: 40,
    },
    {
        id: 'temple',
        name: "Temple",
        tile_mm: 40,
        aspect_ratio: 1,
    },
    {
        id: 'texture',
        name: "Texture",
        tile_mm: 1,
        aspect_ratio: 1,
    },
    {
        id: 'tic-tac-toe',
        name: "Tic Tac Toe",
        tile_mm: 17,
        aspect_ratio: 1,
    },
    {
        id: 'tiny-checkers',
        name: "Tiny Checkers",
        tile_mm: 2,
        aspect_ratio: 1,
    },
    {
        id: 'topography',
        name: "Topography",
        tile_mm: 159,
        aspect_ratio: 1,
    },
    {
        id: 'volcano-lamp',
        name: "Volcano Lamp",
        tile_mm: 13,
        aspect_ratio: 1.5,
    },
    {
        id: 'wallpaper',
        name: "Wallpaper",
        tile_mm: 22,
        aspect_ratio: 5.25,
    },
    {
        id: 'wiggle',
        name: "Wiggle",
        tile_mm: 14,
        aspect_ratio: 2,
    },
    {
        id: 'x-equals',
        name: "X Equals",
        tile_mm: 13,
        aspect_ratio: 1,
    },
    {
        id: 'yyy',
        name: "Yyy",
        tile_mm: 16,
        aspect_ratio: 0.625,
    },
    {
        id: 'zig-zag',
        name: "Zig Zag",
        tile_mm: 11,
        aspect_ratio: 3.3333,
    },
]

/** Look up a pattern by ID — internal use only */
export function find_pattern(id:string):PatternDef | undefined {
    return PATTERNS.find(p => p.id === id)
}

/** Return a copy of all available patterns */
export function list_patterns():PatternDef[] {
    return PATTERNS.map(p => ({...p}))
}
