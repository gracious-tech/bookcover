
// English message catalog — the source of truth for keys. Every other catalog is typed against
// this shape, so tsc catches a missing or extra key; tests/locales.test.ts catches the rest
// (placeholders, message syntax, coverage of printing-services/font_config names). Translation
// workflow, rules and glossary: TRANSLATING.md in this directory.
//
// Comments are written for translators. Keys of four words or fewer get a one-line context
// comment, since the same short word (Auto, Close, Top…) recurs with different meanings across
// components. [max N] marks a label in a tight space: aim for N characters or fewer (CJK
// characters count double), or it will wrap or overflow.

const en = {
    common: {
        // generic "use the automatically-derived value" toggle (font picker, blurb background) [max 8]
        auto: 'Auto',
        // color picker swatch group label for the user's own explicitly-chosen colors
        chosen: 'Chosen',
        // generic modal/dialog dismiss button or aria-label
        close: 'Close',
        cancel: 'Cancel',
        // generic dialog confirm/dismiss button — sidebar picker dialogs (background/pattern/icon)
        done: 'Done',
        generating_preview: 'Generating preview…',
        // ColorSwatch/ColorPicker clear-selection icon button
        clear_color_aria: 'Clear color',
        // ColorSwatch title attribute when no color is chosen yet
        set_color_title: 'Set color',
        // shared field label: the back-cover blurb (sales description), and its editor modal header
        back_blurb: 'Back blurb',
    },
    sidebar: {
        // sidebar section headers, shown in uppercase [max 24]
        section_cover_text: 'Cover text',
        section_book_size: 'Book Size',
        section_background: 'Background',
        section_advanced: 'Advanced',
        show_advanced: 'Show advanced options',
        why_must_be_correct: 'Why must these be correct?',
        mobile_loading_preview: 'Loading preview...',
        // screen-reader label for the language menu button at the bottom of the sidebar
        switch_language_aria: 'Switch language',
        // build identifier at the bottom of the sidebar; {hash} is a short git commit hash
        version: 'Version {hash}',
    },
    content: {
        // label of the book title field (the title on the cover)
        title_label: 'Title',
        // placeholder in each title line input; {n} is the line number (1, 2, 3)
        title_placeholder: 'Line {n}…',
        title_style_aria: 'Line {n} style',
        subtitle_label: 'Subtitle',
        subtitle_style_aria: 'Subtitle style',
        // one field for the author's name, or the series name instead
        author_label: 'Author/Series',
        author_style_aria: 'Author style',
        blurb_edit_aria: 'Edit back blurb',
        blurb_empty_placeholder: 'Click to add a back blurb…',
        blurb_style_aria: 'Blurb style',
    },
    background: {
        image_label: 'Background image',
        // alt text of the thumbnail showing the cover's current background
        current_image_alt: 'Current background',
        choose_suggested_aria: 'Choose suggested background',
        // heading for the embedding app's own suggested images, above the built-in photos
        recent_label: 'Recent images',
        // shown when the embedding app fails to hand over a suggested image
        suggestion_failed: 'Could not load that image',
        // heading for the photos section inside the background image picker dialog
        photos_label: 'Photos',
        // heading for the drawn (vector) background designs in the same dialog
        designs_label: 'Illustrations',
        // shown under the "Illustrations" heading in the background image picker dialog
        vector_color_note: 'Vector illustrations use your chosen background color',
        // title of the background image picker dialog
        image_dialog_title: 'Choose a background',
        // button: upload an image file from the device [max 10]
        upload_button: 'Upload',
        // button: paste an image from the clipboard [max 10]
        paste_button: 'Paste',
        paste_unavailable: "Can't read the clipboard. Press Ctrl+V (⌘V on a Mac) to paste instead.",
        paste_no_image: 'There is no image on the clipboard.',
        remove_image_aria: 'Remove image',
        dpi_short_very_low: 'Very low resolution - should change',
        dpi_short_low: 'Low resolution - may look soft',
        position_label: 'Background position',
        // The five coverage_* labels share one row of buttons that can't wrap [max 38 for all
        // five together, so about 8 each].
        // bg_image_coverage: image wraps the whole cover (back, spine and front)
        coverage_full: 'Full',
        // bg_image_coverage: image covers the front panel only
        coverage_front: 'Front',
        // bg_image_coverage: image fills the lower two thirds of the front panel
        coverage_front_partial: 'Front 2/3',
        // bg_image_coverage: image shown as an inset picture with rounded corners on the front
        coverage_feature: 'Feature',
        // bg_image_coverage: the same inset picture, but with rough hand-painted edges
        coverage_painted: 'Painted',
        color_label: 'Background color',
        gradient_checkbox: 'Make background color a gradient',
        // ColorPicker label for the spine's own background color override
        spine_color_label: 'Spine color',
        pattern_label: 'Background pattern',
        choose_pattern_aria: 'Choose a pattern',
        choose_pattern_placeholder: 'Choose a pattern...',
        // title of the pattern picker dialog
        pattern_dialog_title: 'Choose a pattern',
        remove_pattern_aria: 'Remove pattern',
        icon_label: 'Front cover icon',
        // placeholder of a field taking an Iconify icon ID ("Iconify" is a product name)
        icon_input_placeholder: 'Enter Iconify id...',
        choose_icon_placeholder: 'Choose an icon...',
        // title of the icon picker dialog
        icon_dialog_title: 'Choose an icon',
        // label above the custom Iconify id field inside the icon picker dialog
        custom_icon_label: 'Enter a custom Iconify id',
        remove_icon_aria: 'Remove icon',
        // The three icon_mode_* labels share one row of buttons [max 10 each].
        // icon_mode: icon centered on the front cover
        icon_mode_center: 'Center',
        // icon_mode: large icon pushed into the bottom corner, partly running off the edge
        icon_mode_offset: 'Offset',
        // icon_mode: like Offset, plus two faint copies of the icon behind it
        icon_mode_echo: 'Echo',
        // row labels in the image resolution dialog (pixel dimensions follow each)
        dpi_modal_image_size: 'Image size',
        dpi_modal_acceptable_size: 'Acceptable size',
        dpi_modal_recommended_size: 'Recommended size',
        // dismisses the image resolution dialog
        understood_button: 'Understood',
    },
    // subheadings grouping the icon picker dialog's suggested icons by theme
    icon_categories: {
        nature_landscape: 'Nature',
        animals_creatures: 'Animals',
        plants_agriculture: 'Plants',
        fire_light: 'Fire',
        combat_weapons: 'Combat',
        architecture_structures: 'Architecture',
        royalty_power: 'Royalty',
        religion_spirituality: 'Spiritual',
        books_knowledge: 'Books',
        love_romance: 'Love',
        money_trade: 'Money',
        music_art: 'Music',
        travel_exploration: 'Travel',
        people_body: 'People',
        social_communication: 'Social',
        symbols_abstract: 'Symbols',
    },
    size: {
        // the print-on-demand company that will print the book (KDP, Lulu…)
        service_label: 'Printing service',
        // the finished page size of the book (see glossary)
        trim_size_label: 'Trim size',
        // "Custom…" entry at the end of BOTH the printing-service dropdown (meaning: no printing
        // service, enter bleed/spine by hand) and the trim-size dropdown — must suit both
        custom_option: 'Custom…',
        // "Custom" trim-size toggle button (no ellipsis — button, not a dropdown entry)
        custom_button: 'Custom',
        // custom trim width/height inputs
        width_label: 'Width',
        height_label: 'Height',
        // printing term (see glossary): extra margin trimmed off after printing
        bleed_label: 'Bleed',
        spine_width_label: 'Spine width',
        // number of pages in the book's interior
        page_count_label: 'Page count',
        // how the book is bound (paperback, hardcover…)
        binding_label: 'Binding',
        // interior printing: black & white or color
        ink_type_label: 'Ink type',
        paper_type_label: 'Paper type',
    },
    // measurement units, shown on the unit toggle and after trim dimensions ("6 × 9 inch")
    units: {
        // the language's standard symbol for millimetres — usually "mm" itself
        mm: 'mm',
        // the word or customary abbreviation for inches [max 6]
        inch: 'inch',
    },
    // Trim size names as printing-services names them. Keys are printing-services size ids;
    // tests/locales.test.ts checks these match the library. Sizes named only by their
    // dimensions ('5.25" x 8"') aren't listed and show as-is. Most are publishing-industry format
    // names: use the established local name where one exists, otherwise transliterate or keep
    // the English. Shown as buttons or dropdown entries, so keep them short.
    print_sizes: {
        pocket_book: 'Pocket Book',
        novella: 'Novella',
        digest: 'Digest',
        a5: 'A5',
        us_trade: 'US Trade',
        royal: 'Royal',
        executive: 'Executive',
        crown_quarto: 'Crown Quarto',
        small_square: 'Small Square',
        a4: 'A4',
        square: 'Square',
        us_letter: 'US Letter',
        small_landscape: 'Small Landscape',
        us_letter_landscape: 'US Letter Landscape',
        a4_landscape: 'A4 Landscape',
        b_format: 'B-Format',
        a5_landscape: 'A5 Landscape',
    },
    // Each printing service's own names for its binding/ink/paper options, keyed by service id
    // then printing-services option id; tests/locales.test.ts checks these match the library.
    // These are the printer's product names, so the user may need to match them against the
    // printer's own website: translate descriptive words, but keep trademarked product names
    // ("Supreme Laser", "Sovereign Silk") and paper weights ("60#", "80gsm") exactly as they are.
    print_options: {
        lulu: {
            binding: {
                paperback: 'Paperback Perfect Bound',
                paperback_stitch: 'Paperback Saddle Stitch',
                paperback_coil: 'Paperback Coil Bound',
                hardcover: 'Hardcover Case Wrap',
                hardcover_jacket: 'Hardcover Linen Wrap',
            },
            ink: {
                bw: 'Standard Black & White',
                bw_premium: 'Premium Black & White',
                color: 'Standard Color',
                color_premium: 'Premium Color',
            },
            paper: {
                cream: 'Cream - Uncoated 60#',
                white: 'White - Uncoated 60#',
                white_coated: 'White - Coated 80#',
            },
        },
        kdp: {
            binding: {
                paperback: 'Paperback',
                hardcover: 'Hardcover',
            },
            ink: {
                bw: 'Black & white interior',
                color: 'Standard color interior',
                color_premium: 'Premium color interior',
            },
            paper: {
                white: 'White paper',
                cream: 'Cream paper',
            },
        },
        officeworks: {
            binding: {
                // a stapled booklet
                paperback_stitch: 'Premium Booklet',
            },
            ink: {
                // Australian spelling; translate as plain "color"
                color: 'Colour',
            },
            paper: {
                white: 'White',
            },
        },
        vistaprint_au: {
            binding: {
                // a stapled booklet
                paperback_stitch: 'Booklet',
            },
            ink: {
                // Australian spelling; translate as plain "color"
                color: 'Colour',
            },
            paper: {
                white: 'White',
            },
        },
        ctrlprint: {
            binding: {
                paperback_stitch: 'Saddle Stitch',
                paperback_wire: 'Wire Bound',
                paperback_coil: 'Spiral Bound',
                paperback: 'Perfect Bound',
            },
            ink: {
                color: 'Color',
            },
            paper: {
                // paper product names: keep "Supreme Laser"/"Sovereign Silk" and the weight as-is
                white: '80gsm Supreme Laser',
                white_coated_denser: '150gsm Sovereign Silk',
                white_coated: '128gsm Sovereign Silk',
            },
        },
    },
    advanced: {
        // text printed along the book's spine
        spine_title_label: 'Spine title',
        spine_title_style_aria: 'Spine title style',
        // spine-title input placeholder when title fields are all empty
        title_fallback_placeholder: 'Title…',
        spine_author_label: 'Spine author',
        spine_author_style_aria: 'Spine author style',
        author_name_placeholder: 'Author name…',
        icon_spine_checkbox: 'Show icon on spine',
        // the ISBN encoded into the barcode printed on the back cover
        isbn_label: 'ISBN for barcode',
        // which regional glyph style to draw Chinese characters (Han script) in
        cjk_label: 'Language for Han scripts',
        cjk_help_text: 'Chinese characters are drawn differently depending on the language. Only affects covers that include them.',
        // CJK region select: let the per-sentence script detector choose
        cjk_auto: 'Auto detect',
        cjk_sc: 'Chinese (Simplified)',
        cjk_tc: 'Chinese (Traditional)',
        cjk_hk: 'Chinese (Hong Kong)',
        cjk_jp: 'Japanese',
        cjk_kr: 'Korean',
        positioning_heading: 'Positioning',
        positioning_help_1: 'Adjust margins and spacing relative to the height of the book.',
        positioning_help_2: "Some of these have minimum values that can't be removed.",
        page_margins_label: 'Page margins',
        // toggle: white rounded border for home inkjet printers that can't print to the edge
        home_margin_checkbox: 'Home printing margin',
        // The margin_* labels sit beside sliders in a narrow column [max 9 each].
        // page-margin slider: front-cover margin
        margin_front: 'Front',
        // page-margin slider: back-cover margin
        margin_back: 'Back',
        title_margins_label: 'Title margins',
        // margin slider: space above the field
        margin_top: 'Top',
        // margin slider: space below the field
        margin_bottom: 'Bottom',
        // margin slider: line spacing within the field
        margin_lines: 'Lines',
        subtitle_margins_label: 'Subtitle margins',
        author_margins_label: 'Author margins',
        // blurb-sizing slider: internal padding
        margin_pad: 'Pad',
        // blurb-sizing slider: box width as % of panel (distinct from size.width_label, which is the trim width in mm/inch)
        margin_width: 'Width',
        reset_all_button: 'Reset all',
        reset_confirm_title: 'Reset to blank?',
        reset_confirm_body: 'This will clear all text and styling — resetting the cover to a plain white blank. This cannot be undone.',
        // confirms the reset-all action in the confirmation dialog (vs. the "Reset all" button that opens it)
        reset_confirm_button: 'Reset',
    },
    font_chooser: {
        // font list heading above fonts the user uploaded
        uploaded_header: 'Uploaded',
        // opens the custom font upload dialog [max 8]
        more_button: 'More',
        // tooltip on the font chooser's "More" button
        upload_title: 'Upload custom font',
    },
    // font list group headings — font_config.json's "group" values (matched by English text in
    // option_labels.ts), shown in small uppercase
    font_groups: {
        // decorative display fonts
        styles: 'Styles',
        // fonts typically used for a book's body text
        book_interior: 'Commonly used inside books',
        // the Noto fonts, which cover nearly every script
        noto: 'Compatible with most languages',
    },
    font_style: {
        // font-size slider label inside a per-field style popover
        size_label: 'Size',
        // font-family picker label inside a per-field style popover
        font_label: 'Font',
        bold_checkbox: 'Bold',
        italic_checkbox: 'Italic',
        color_label: 'Color',
        // "(auto)" = the color is chosen automatically to contrast with the background
        color_auto_label: 'Color (auto)',
        position_label: 'Position on cover',
        // vertical position option
        position_top: 'Top',
        position_middle: 'Middle',
        position_bottom: 'Bottom',
        // text alignment (left/center/right)
        alignment_label: 'Alignment',
        align_left_aria: 'Align left',
        align_center_aria: 'Align center',
        align_right_aria: 'Align right',
    },
    blurb_font: {
        text_color_label: 'Text color',
        text_color_auto_label: 'Text color (auto)',
        // the box behind the blurb text: derived automatically / custom / transparent
        bg_auto_label: 'Background (auto)',
        bg_label: 'Background',
        bg_none_label: 'Background (none)',
        // text alignment: justified
        justify_aria: 'Justify',
    },
    // rich-text toolbar buttons in the blurb editor (aria-labels/tooltips)
    blurb_editor: {
        bold_aria: 'Bold',
        italic_aria: 'Italic',
        h1_aria: 'Heading 1',
        h2_aria: 'Heading 2',
        bullet_list_aria: 'Bullet list',
        ordered_list_aria: 'Ordered list',
        blockquote_aria: 'Blockquote',
        hr_aria: 'Horizontal rule',
    },
    font_upload: {
        title: 'Upload custom fonts',
        instructions_heading: 'How to get fonts from Google Fonts:',
        // step1_prefix + a "fonts.google.com" link + step1_suffix form one sentence; either part
        // may be empty if the language's word order puts the link at the start or end
        step1_prefix: 'Visit',
        step1_suffix: 'and find a font family.',
        // "Get font" and "Download all" are Google Fonts' own button labels: keep them in English
        step2: 'Click "Get font", then "Download all".',
        step3: 'Upload the .zip file below.',
        dropzone_text: 'Drop files here or click to browse',
        dropzone_filetypes: '.zip, .ttf, or .otf files',
        status_processing: 'Processing fonts...',
        status_no_new_fonts: 'No new font families found in the uploaded files',
        status_failed: 'Failed to process fonts',
    },
    iconify_help: {
        title: 'Search more icons',
        intro: 'You can search Iconify for more icons, which is a free icon library with over 200,000 icons.',
        instructions_heading: 'How to add a custom icon:',
        step1: 'Open Iconify (button below) and search for any icon you like.',
        step2: 'Click an icon to open its detail page.',
        // step3_prefix + an example ID (e.g. "mdi:home") + step3_suffix form one sentence;
        // either part may be empty to suit the language's word order. The suffix follows the ID
        // directly, so start it with a space if it begins with a word.
        step3_prefix: 'Copy its ID — it looks like',
        step3_suffix: '.',
        step4: 'Paste or type the ID into the field below.',
        open_button: 'Open Iconify',
        dismiss_button: 'Dismiss',
    },
    size_help: {
        title: 'All size options must be accurate',
        body_intro: "Every option in this section directly affects the final dimensions of the cover file. Getting them wrong means your generated cover won't fit your book properly, and may have white edges or be out of alignment when printed.",
        body_list_heading: 'This includes less obvious options like:',
        // Each item_*_label is shown in bold, immediately followed by its item_*_rest.
        item_page_count_label: 'Page count',
        item_page_count_rest: '— more pages means a thicker spine.',
        item_paper_type_label: 'Paper type',
        item_paper_type_rest: '— thicker paper makes the spine wider.',
        item_ink_type_label: 'Ink type',
        item_ink_type_rest: '— some services use different paper per ink type, which also changes the spine.',
        footer: "We only list options that matter to the size. Printing services will often have more options to choose from than these, but they won't affect the size of the cover.",
        got_it_button: 'Got it',
    },
    preview: {
        switch_to_dark_aria: 'Switch to dark mode',
        switch_to_light_aria: 'Switch to light mode',
        // {percent} is a number; place the % sign as the language normally does
        zoom_aria: 'Zoom: {percent}%',
        // The four mode_* labels are preview tabs sharing one row [max 10 each].
        // preview tab: rotatable 3D model of the book
        mode_3d: '3D',
        // preview tab: the book photographed in a realistic scene
        mode_mockup: 'Mockup',
        // preview tab: front, spine and back shown separately
        mode_parts: 'Parts',
        // preview tab: the full flat print file, as it will be sent to the printer
        mode_print: 'Print',
        // export buttons, one per preview tab
        save_3d: 'Save 3D Image',
        save_mockup: 'Save Mockup',
        save_images: 'Save Images',
        save_image: 'Save Image',
        export_pdfs: 'Export PDFs',
        export_pdf: 'Export PDF',
        // embedded mode: done editing, return to the host app
        finished_button: 'Finished',
        finish_confirm_title: 'Save changes to cover?',
        finish_confirm_discard: 'Discard',
        finish_confirm_save: 'Save',
        download_last_aria: 'Download last file',
        // {pages} is a number, always well above 1
        no_binding_supports_pages: 'No binding type supports {pages} pages',
        // {binding} is a binding option name (e.g. "Hardcover"); {pages} is a number above 1
        binding_not_available: '"{binding}" is not available for {pages} pages',
        // {field} is an internal field name (e.g. custom_trim_width), left untranslated
        invalid_field: 'Invalid {field} — finish filling in the form',
    },
    // ruler overlay for checking on-screen size against a real sheet of paper
    paper_scale: {
        a4_label: 'A4 width (21 cm)',
        us_letter_label: 'US Letter width (8.5″)',
        overflow_warning: 'Lines exceed viewport — increase window size for accurate comparison',
        instructions_1: 'Place a piece of paper against a line. Adjust the zoom until the line matches. That is how big the actual book will be.',
        instructions_2: '(screens rarely default to the actual physical size)',
    },
    preview_split: {
        // split-view panel caption (shown uppercase) and image alt text, front cover
        face_front: 'front',
        face_back: 'back',
        face_spine: 'spine',
    },
    preview_full: {
        alt_full_cover: 'Full cover',
    },
    app: {
        // mobile FAB: currently showing the form, tap to view the preview instead
        fab_show_preview_aria: 'Show preview',
        // mobile FAB: currently showing the preview, tap to view the form instead
        fab_show_sidebar_aria: 'Show form',
        // startup failure banners; {url} is a web address
        error_fonts_server: "The fonts server is not working — it didn't return the font list expected at {url}, so covers can't be generated.",
        error_init_failed: 'The cover generator failed to start. Check the browser console for details.',
        // "Typst" is the typesetting engine's product name; "wasm" is WebAssembly
        error_wasm_failed: 'The cover generator failed to start. Typst wasm failed to load.',
    },
    dpi_warning: {
        title_very_low: 'Very low resolution image',
        title_low: 'Low resolution image',
        body_very_low: 'This image is too small for its position on the cover. It will look low quality when printed.',
        body_low: 'This image is smaller than what is recommended for its position on the cover. It may look slightly blurry when printed.',
        // appended directly after body_very_low/body_low — keep (or drop) the leading space as
        // the language separates sentences
        body_front_suffix: ' It may be suitable for display on the front only.',
    },
    // the color picker's screen-reader labels
    color_picker: {
        open_aria: 'Open color picker',
        close_aria: 'Close color picker',
        clear_aria: 'Clear the selected color',
        // {s} and {v} are percentages filled in by the color picker
        marker_aria: 'Saturation: {s}. Brightness: {v}.',
        hue_slider_aria: 'Hue slider',
        alpha_slider_aria: 'Opacity slider',
        input_aria: 'Color value field',
        format_aria: 'Color format',
        swatch_aria: 'Color swatch',
        instruction_aria: 'Saturation and brightness selector. Use up, down, left and right arrow keys to select.',
    },
    errors: {
        // {id} is an icon ID; keep "collection:name" as-is (it shows the ID format)
        icon_invalid_format: 'Invalid iconify ID "{id}" — expected "collection:name"',
        icon_not_found: 'Icon does not exist: {id}',
        // {status} is an HTTP status code and {status_text} its English description
        icon_fetch_failed: 'Failed to fetch icon "{id}": {status} {status_text}',
        generator_worker_failed: 'Generator worker failed',
    },
}

export default en
export type Messages = typeof en
