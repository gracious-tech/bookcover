
// Preset icon SVG payload, re-exported on its own subpath ('bookcover-web/preset-icons-svg').
// Kept out of the main index so importing the barrel never pulls the payload in — only the
// icon picker needs these, and it loads them on demand. See generator/src/preset_icons.ts

export {PRESET_ICON_SVGS, find_preset_icon_svg} from 'bookcover-core/preset-icons-svg'
