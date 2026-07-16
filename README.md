
# Book Cover Generator

Generate print-ready book covers. Supports custom fonts, background images, patterns,
icons, ISBN barcodes, and automatic spine sizing via printing service specifications.

See the UI at [cover.paper.bible](https://cover.paper.bible) to know what these modules
are capable of. However, they can all be used headless without the UI.

[![Example cover](./sample.svg)](./sample.pdf "View example PDF")

## Packages

Install either the web or node package — they have slightly different APIs due to how
fonts and images need to be loaded.

 * [bookcover-node](generator-node/README.md)
 * [bookcover-web](generator-web/README.md) (see also [bookcover-3d-web](3d/README.md))
