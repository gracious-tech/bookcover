
// English message catalog — source of truth for keys; vie.ts is typed against this shape so
// tsc catches any missing/extra key or renamed interpolation placeholder. Keys ≤4 words get a
// one-line context comment since the same short word (Auto, Close, Top…) recurs with different
// meanings across components — translate with that component's Pug template open, not in
// isolation.

const eng = {
    common: {
        // generic "use the automatically-derived value" toggle (font picker, blurb background)
        auto: 'Auto',
        // generic modal/dialog dismiss button or aria-label
        close: 'Close',
        cancel: 'Cancel',
        generating_preview: 'Generating preview…',
        // ColorSwatch/ColorPicker clear-selection icon button
        clear_color_aria: 'Clear color',
        // ColorSwatch title attribute when no color is chosen yet
        set_color_title: 'Set color',
        // shared field label: Title/Subtitle/Author back-cover blurb, and its editor modal header
        back_blurb: 'Back blurb',
    },
    sidebar: {
        section_cover_text: 'Cover text',
        section_book_size: 'Book Size',
        section_background: 'Background',
        section_advanced: 'Advanced',
        show_advanced: 'Show advanced options',
        why_must_be_correct: 'Why must these be correct?',
        mobile_loading_preview: 'Loading preview...',
        // toggles the widget's own display language, independent of Nuxt UI's own strings
        switch_language_aria: 'Switch language',
    },
    content: {
        title_label: 'Title',
        title_placeholder: 'Line {n}…',
        title_style_aria: 'Line {n} style',
        subtitle_label: 'Subtitle',
        subtitle_style_aria: 'Subtitle style',
        author_label: 'Author/Series',
        author_style_aria: 'Author style',
        blurb_edit_aria: 'Edit back blurb',
        blurb_empty_placeholder: 'Click to add a back blurb…',
        blurb_style_aria: 'Blurb style',
    },
    background: {
        image_label: 'Background image',
        choose_suggested_aria: 'Choose suggested background',
        upload_button: 'Upload',
        paste_button: 'Paste',
        remove_image_aria: 'Remove image',
        dpi_short_very_low: 'Very low resolution - should change',
        dpi_short_low: 'Low resolution - may look soft',
        position_label: 'Background position',
        // bg_image_coverage: full-spread placement
        coverage_full: 'Full',
        // bg_image_coverage: front-panel-only placement
        coverage_front: 'Front',
        coverage_front_partial: 'Front 2/3',
        coverage_feature: 'Feature',
        coverage_painted: 'Painted',
        color_label: 'Background color',
        gradient_checkbox: 'Make background color a gradient',
        // ColorPicker label for the spine's own background color override
        spine_color_label: 'Spine color',
        pattern_label: 'Background pattern',
        choose_pattern_aria: 'Choose a pattern',
        choose_pattern_placeholder: 'Choose a pattern...',
        remove_pattern_aria: 'Remove pattern',
        icon_label: 'Front cover icon',
        icon_input_placeholder: 'Enter Iconify id...',
        choose_icon_placeholder: 'Choose an icon...',
        // opens the Iconify search help modal — short uppercase button, keep terse in translation
        more_button: 'MORE',
        remove_icon_aria: 'Remove icon',
        icon_placement_label: 'Icon placement',
        // icon_mode: centered on the front panel
        icon_mode_center: 'Center',
        icon_mode_offset: 'Offset',
        icon_mode_echo: 'Echo',
        icon_mode_background: 'Background',
        dpi_modal_image_size: 'Image size',
        dpi_modal_acceptable_size: 'Acceptable size',
        dpi_modal_recommended_size: 'Recommended size',
        understood_button: 'Understood',
    },
    size: {
        service_label: 'Printing service',
        trim_size_label: 'Trim size',
        // "Custom…" entry inside the trim-size dropdown
        custom_option: 'Custom…',
        // "Custom" trim-size toggle button (no ellipsis — button, not a dropdown entry)
        custom_button: 'Custom',
        width_label: 'Width',
        height_label: 'Height',
        bleed_label: 'Bleed',
        spine_width_label: 'Spine width',
        page_count_label: 'Page count',
        binding_label: 'Binding',
        ink_type_label: 'Ink type',
        paper_type_label: 'Paper type',
    },
    advanced: {
        spine_title_label: 'Spine title',
        spine_title_style_aria: 'Spine title style',
        // spine-title input placeholder when title fields are all empty
        title_fallback_placeholder: 'Title…',
        spine_author_label: 'Spine author',
        spine_author_style_aria: 'Spine author style',
        author_name_placeholder: 'Author name…',
        icon_spine_checkbox: 'Show icon on spine',
        isbn_label: 'ISBN for barcode',
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
        uploaded_header: 'Uploaded',
        more_button: 'More',
        // tooltip on the font chooser's "More" button
        upload_title: 'Upload custom font',
    },
    font_style: {
        // font-size slider label inside a per-field style popover
        size_label: 'Size',
        // font-family picker label inside a per-field style popover
        font_label: 'Font',
        bold_checkbox: 'Bold',
        italic_checkbox: 'Italic',
        color_label: 'Color',
        color_auto_label: 'Color (auto)',
        position_label: 'Position on cover',
        // vertical position option
        position_top: 'Top',
        position_middle: 'Middle',
        position_bottom: 'Bottom',
        alignment_label: 'Alignment',
        align_left_aria: 'Align left',
        align_center_aria: 'Align center',
        align_right_aria: 'Align right',
    },
    blurb_font: {
        text_color_label: 'Text color',
        text_color_auto_label: 'Text color (auto)',
        bg_auto_label: 'Background (auto)',
        bg_label: 'Background',
        bg_none_label: 'Background (none)',
        clear_auto_bg_aria: 'Clear auto background',
        justify_aria: 'Justify',
    },
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
        step1_prefix: 'Visit',
        step1_suffix: 'and find a font family.',
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
        step1: 'Visit the icon website below and search for any icon.',
        step2: 'Click an icon to open its detail page.',
        step3_prefix: 'Copy its ID — it looks like',
        step3_suffix: '.',
        step4: 'Paste or type the ID into the icon field.',
        open_button: 'Open Iconify',
        dismiss_button: 'Dismiss',
    },
    size_help: {
        title: 'All size options must be accurate',
        body_intro: "Every option in this section directly affects the final dimensions of the cover file. Getting them wrong means your generated cover won't fit your book properly, and may have white edges or be out of alignment when printed.",
        body_list_heading: 'This includes less obvious options like:',
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
        zoom_aria: 'Zoom: {percent}%',
        mode_3d: '3D',
        mode_mockup: 'Mockup',
        mode_parts: 'Parts',
        mode_print: 'Print',
        save_3d: 'Save 3D Image',
        save_mockup: 'Save Mockup',
        save_images: 'Save Images',
        save_image: 'Save Image',
        export_pdfs: 'Export PDFs',
        export_pdf: 'Export PDF',
        finished_button: 'Finished',
        download_last_aria: 'Download last file',
        no_binding_supports_pages: 'No binding type supports {pages} pages',
        binding_not_available: '"{binding}" is not available for {pages} pages',
        invalid_field: 'Invalid {field} — finish filling in the form',
    },
    paper_scale: {
        a4_label: 'A4 width (21 cm)',
        us_letter_label: 'US Letter width (8.5″)',
        overflow_warning: 'Lines exceed viewport — increase window size for accurate comparison',
        instructions_1: 'Place a piece of paper against a line. Adjust the zoom until the line matches. That is how big the actual book will be.',
        instructions_2: '(screens rarely default to the actual physical size)',
    },
    preview_split: {
        // split-view panel caption, front cover
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
    },
    dpi_warning: {
        title_very_low: 'Very low resolution image',
        title_low: 'Low resolution image',
        body_very_low: 'This image is too small for its position on the cover. It will look low quality when printed.',
        body_low: 'This image is smaller than what is recommended for its position on the cover. It may look slightly blurry when printed.',
        body_front_suffix: ' It may be suitable for display on the front only.',
    },
    errors: {
        icon_invalid_format: 'Invalid iconify ID "{id}" — expected "collection:name"',
        icon_not_found: 'Icon does not exist: {id}',
        icon_fetch_failed: 'Failed to fetch icon "{id}": {status} {status_text}',
        generator_worker_failed: 'Generator worker failed',
    },
}

export default eng
export type Messages = typeof eng
