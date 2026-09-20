
// Pattern SVG payload, re-exported on its own subpath ('bookcover-web/patterns-svg').
// Kept out of the main index so importing the barrel never pulls ~220KB of SVG strings in —
// only the pattern picker needs these, and it loads them on demand. See generator/src/patterns.ts

export {PATTERN_SVGS, find_pattern_svg} from 'bookcover-core/patterns-svg'

