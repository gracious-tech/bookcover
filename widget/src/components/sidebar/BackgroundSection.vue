
<template lang="pug">

//- Background image
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em] mb-1") {{ t('background.image_label') }}

    //- Trigger + suggested images and upload/paste buttons
    div(class="flex gap-1 items-center")
        button(
            type="button"
            class="flex rounded border border-default overflow-hidden cursor-pointer shrink-0 hover:opacity-80 transition-opacity"
            :aria-label="t('background.choose_suggested_aria')"
            @click="bg_picker_open = true"
        )
            img(
                v-if="bg_image_url"
                :src="bg_image_url"
                alt="Current background"
                class="w-12 h-12 object-cover block"
            )
            div(
                v-else-if="selected_vector_bg"
                class="w-12 h-12 block"
                :style="{backgroundColor: effective_bg_color, backgroundImage: get_vector_preview_url(selected_vector_bg, effective_bg_color), backgroundSize: 'cover'}"
            )
            img(
                v-else
                v-for="bg in PREVIEW_BGS"
                :key="bg"
                :src="bg_thumb_url(bg)"
                :alt="bg"
                class="w-12 h-12 object-cover block"
            )
        label(class="cursor-pointer")
            input(type="file" accept=".jpg,.jpeg,.png,.webp" class="sr-only" @change="on_image_change")
            UButton(as="span" color="neutral" variant="outline" size="sm") {{ t('background.upload_button') }}
        UButton(type="button" color="neutral" variant="outline" size="sm" @click="on_paste_click") {{ t('background.paste_button') }}
        UButton(
            type="button"
            color="neutral"
            variant="ghost"
            size="md"
            icon="material-symbols:close"
            class="ml-2"
            :aria-label="t('background.remove_image_aria')"
            @click="clear_background()"
        )

    //- Inline resolution warning — short label, click opens the full-detail dialog
    button(
        v-if="bg_dpi_warning"
        type="button"
        class="text-sm flex items-center gap-1 cursor-pointer hover:underline w-fit ml-1 mt-1"
        :class="dpi_warning_class"
        @click="low_res_dialog_open = true"
    )
        UIcon(:name="dpi_warning_icon" class="w-3.5 h-3.5 shrink-0")
        span {{ dpi_warning_short }}

    //- Picker dialog — Photos and Vector illustrations, big enough to compare many at once
    SidebarPickerDialog(v-model:open="bg_picker_open" :title="t('background.image_dialog_title')")
        div(class="flex flex-col gap-4")
            //- Photos
            div
                label(class="text-xs font-semibold tracking-[0.02em] mb-1.5 block") {{ t('background.photos_label') }}
                div(class="grid gap-1.5" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))")
                    button(
                        v-for="bg in BACKGROUNDS"
                        :key="bg"
                        type="button"
                        class="aspect-4/3 rounded border-2 overflow-hidden cursor-pointer touch-manipulation transition-transform duration-100 hover:scale-[1.05]"
                        :class="form.bg_image?.name === bg ? 'border-(--ui-text)' : 'border-transparent'"
                        @click="select_suggested_bg(bg)"
                    )
                        img(:src="bg_thumb_url(bg)" class="w-full h-full object-cover block")

            //- Vector illustrations
            div(class="pt-3 border-t border-default")
                label(class="text-xs font-semibold tracking-[0.02em] mb-1.5 block") {{ t('background.designs_label') }}
                p(class="text-xs text-muted mb-3") {{ t('background.vector_color_note') }}

                //- Duplicate of the background color controls below — colocated here so the
                //- color can be tuned while watching its effect on the illustrations, without leaving
                //- the dialog. Gradient is deliberately omitted (vector illustrations don't use it)
                div(class="flex items-center gap-[12px] mb-3")
                    label(
                        class="relative w-[40px] h-[40px] rounded cursor-pointer overflow-hidden shrink-0 block"
                        :style="{background: form.bg_color ?? effective_bg_color}"
                    )
                        input(
                            type="color"
                            :value="form.bg_color ?? effective_bg_color"
                            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            @input="on_bg_color_input"
                        )
                        span(
                            v-if="!form.bg_color"
                            class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase pointer-events-none"
                            :style="{color: bg_color_preview_contrast}"
                        ) {{ t('common.auto') }}
                    div(class="flex flex-col gap-[6px]")
                        div(v-for="row in primary_swatch_rows" :key="row[0]" class="flex items-center gap-[6px]")
                            button(
                                v-for="color in row"
                                :key="color"
                                type="button"
                                class="w-[24px] h-[24px] rounded-full border-2 p-0 cursor-pointer shrink-0 transition-transform duration-100 hover:scale-[1.15] outline-offset-2"
                                :class="form.bg_color === color ? 'border-(--ui-text)' : 'border-transparent'"
                                :style="{background: color}"
                                @click="form.bg_color = color"
                            )

                div(class="grid gap-1.5" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))")
                    button(
                        v-for="v in VECTOR_BACKGROUNDS"
                        :key="v.id"
                        type="button"
                        class="aspect-4/3 rounded border-2 overflow-hidden cursor-pointer touch-manipulation transition-transform duration-100 hover:scale-[1.05]"
                        :class="form.bg_vector_id === v.id ? 'border-(--ui-text)' : 'border-transparent'"
                        :style="{backgroundColor: effective_bg_color, backgroundImage: get_vector_preview_url(v, effective_bg_color), backgroundSize: 'cover'}"
                        :title="v.name"
                        @click="select_vector_bg(v.id)"
                    )

        //- Pinned under the title, stays in view while the grids below scroll — hidden on
        //- mobile since the dialog is full-screen there and these buttons duplicate the
        //- always-visible coverage row below the trigger (BackgroundSection.vue's own)
        template(#header-extra)
            div(v-if='(form.bg_image || form.bg_vector_id) && !is_mobile' class="flex")
                UButton(
                    type="button"
                    color="neutral"
                    :variant="form.bg_image_coverage === 'full' ? 'solid' : 'outline'"
                    size="sm"
                    class="rounded-r-none w-[50px] justify-center"
                    @click="form.bg_image_coverage = 'full'"
                ) {{ t('background.coverage_full') }}
                UButton(
                    type="button"
                    color="neutral"
                    :variant="form.bg_image_coverage === 'front' ? 'solid' : 'outline'"
                    size="sm"
                    class="w-[50px] justify-center"
                    :class="form.bg_image ? 'rounded-none' : 'rounded-l-none'"
                    @click="form.bg_image_coverage = 'front'"
                ) {{ t('background.coverage_front') }}
                template(v-if="form.bg_image")
                    UButton(
                        type="button"
                        color="neutral"
                        :variant="form.bg_image_coverage === 'front_partial' ? 'solid' : 'outline'"
                        size="sm"
                        class="rounded-none"
                        @click="form.bg_image_coverage = 'front_partial'"
                    ) {{ t('background.coverage_front_partial') }}
                    UButton(
                        type="button"
                        color="neutral"
                        :variant="form.bg_image_coverage === 'feature' ? 'solid' : 'outline'"
                        size="sm"
                        class="rounded-none"
                        @click="form.bg_image_coverage = 'feature'"
                    ) {{ t('background.coverage_feature') }}
                    UButton(
                        type="button"
                        color="neutral"
                        :variant="form.bg_image_coverage === 'painted' ? 'solid' : 'outline'"
                        size="sm"
                        class="rounded-l-none"
                        @click="form.bg_image_coverage = 'painted'"
                    ) {{ t('background.coverage_painted') }}

        //- Inline with Done, no remove button here (the one outside the dialog covers that)
        template(#footer-start)
            label(class="cursor-pointer")
                input(type="file" accept=".jpg,.jpeg,.png,.webp" class="sr-only" @change="on_image_change")
                UButton(as="span" color="neutral" variant="outline" size="sm") {{ t('background.upload_button') }}
            UButton(type="button" color="neutral" variant="outline" size="sm" @click="on_paste_click") {{ t('background.paste_button') }}


//- Background image coverage
div(v-if='form.bg_image || form.bg_vector_id' class="flex flex-col gap-1")
    div(class="text-xs font-semibold tracking-[0.02em]") {{ t('background.position_label') }}
    div(class="flex mt-3")
        UButton(
            type="button"
            color="neutral"
            :variant="form.bg_image_coverage === 'full' ? 'solid' : 'outline'"
            size="sm"
            class="rounded-r-none w-[50px] justify-center"
            @click="form.bg_image_coverage = 'full'"
        ) {{ t('background.coverage_full') }}
        UButton(
            type="button"
            color="neutral"
            :variant="form.bg_image_coverage === 'front' ? 'solid' : 'outline'"
            size="sm"
            class="w-[50px] justify-center"
            :class="form.bg_image ? 'rounded-none' : 'rounded-l-none'"
            @click="form.bg_image_coverage = 'front'"
        ) {{ t('background.coverage_front') }}
        template(v-if="form.bg_image")
            UButton(
                type="button"
                color="neutral"
                :variant="form.bg_image_coverage === 'front_partial' ? 'solid' : 'outline'"
                size="sm"
                class="rounded-none"
                @click="form.bg_image_coverage = 'front_partial'"
            ) {{ t('background.coverage_front_partial') }}
            UButton(
                type="button"
                color="neutral"
                :variant="form.bg_image_coverage === 'feature' ? 'solid' : 'outline'"
                size="sm"
                class="rounded-none"
                @click="form.bg_image_coverage = 'feature'"
            ) {{ t('background.coverage_feature') }}
            UButton(
                type="button"
                color="neutral"
                :variant="form.bg_image_coverage === 'painted' ? 'solid' : 'outline'"
                size="sm"
                class="rounded-l-none"
                @click="form.bg_image_coverage = 'painted'"
            ) {{ t('background.coverage_painted') }}


//- Background color
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em] mb-1") {{ t('background.color_label') }}
    div(class="flex items-center gap-[12px]")

        //- Preview swatch: a plain styled div carries the visible color/text so it paints in
        //- normal DOM order — native color inputs render via their own widget layer (esp. on
        //- Linux/GTK) and can composite above sibling overlays regardless of z-index, which
        //- made the "auto" label unreadable. The actual input is invisible and just relays clicks
        label(
            class="relative w-[40px] h-[40px] rounded cursor-pointer overflow-hidden shrink-0 block"
            :style="{background: form.bg_color ?? effective_bg_color}"
        )
            input(
                type="color"
                :value="form.bg_color ?? effective_bg_color"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                @input="on_bg_color_input"
            )
            //- "auto" label shown while no manual color is set
            span(
                v-if="!form.bg_color"
                class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase pointer-events-none"
                :style="{color: bg_color_preview_contrast}"
            ) {{ t('common.auto') }}

        div(class="flex flex-col gap-[6px]")
            div(v-for="row in primary_swatch_rows" :key="row[0]" class="flex items-center gap-[6px]")
                button(
                    v-for="color in row"
                    :key="color"
                    type="button"
                    class="w-[24px] h-[24px] rounded-full border-2 p-0 cursor-pointer shrink-0 transition-transform duration-100 hover:scale-[1.15] outline-offset-2"
                    :class="form.bg_color === color ? 'border-(--ui-text)' : 'border-transparent'"
                    :style="{background: color}"
                    @click="form.bg_color = color"
                )

        //- Reset to auto (complements the background image, white if none) — disabled once
        //- already in auto mode, matching the disabled-when-active pattern elsewhere in the form
        UButton(
            type="button"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!form.bg_color"
            class="shrink-0"
            @click="form.bg_color = null"
        ) {{ t('common.auto') }}


//- Background gradient toggle
div(class="flex items-center gap-2 pt-0.5")
    UCheckbox(v-model="form.bg_color_gradient" :label="t('background.gradient_checkbox')" :ui="{base: 'border-1 border-gray-400'}")


//- Spine color
div(class="flex flex-col gap-1")
    ColorPicker(
        v-model="form.spine_color"
        :label="t('background.spine_color_label')"
        clear_mode="none"
    )


//- Pattern
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em] mb-1") {{ t('background.pattern_label') }}
    div(class="flex items-center gap-[5px]")
        //- Trigger: square swatch showing the selected pattern, or a "+" placeholder
        div(
            v-if="get_selected_pattern()"
            class="w-10 h-10 rounded cursor-pointer shrink-0"
            :style="{backgroundColor: effective_bg_color, backgroundImage: get_preview_url(get_selected_pattern(), pattern_preview_fill), backgroundSize: get_preview_size(get_selected_pattern())}"
            @click="pattern_picker_open = true"
        )
        //- Placeholder when no pattern selected: 4 example swatches + label
        button(v-else type="button" class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" :aria-label="t('background.choose_pattern_aria')" @click="pattern_picker_open = true")
            div(class="flex rounded border border-default overflow-hidden shrink-0 gap-1")
                div(
                    v-for="pat in PREVIEW_PATTERNS"
                    :key="pat.id"
                    class="w-10 h-10 shrink-0"
                    :style="{backgroundColor: effective_bg_color, backgroundImage: get_preview_url(pat, pattern_preview_fill), backgroundSize: get_preview_size(pat)}"
                )
            span(class="text-sm text-muted pl-2") {{ t('background.choose_pattern_placeholder') }}

        //- Picker dialog: grid of all patterns
        SidebarPickerDialog(v-model:open="pattern_picker_open" :title="t('background.pattern_dialog_title')")
            div(class="grid gap-1.5" style="grid-template-columns: repeat(3, 1fr)")
                button(
                    v-for="pat in PATTERNS"
                    :key="pat.id"
                    type="button"
                    class="w-full aspect-square cursor-pointer rounded border-2 hover:bg-accented"
                    :class="form.pattern_id === pat.id ? 'border-(--ui-text)' : 'border-default'"
                    :title="pat.name"
                    :style="{backgroundColor: effective_bg_color, backgroundImage: get_preview_url(pat, pattern_preview_fill), backgroundSize: get_preview_size(pat)}"
                    @click="select_pattern(pat.id)"
                )

            //- Pinned under the title, stays in view while the grid above scrolls — hidden on
            //- mobile since it duplicates the always-visible slider/swatch below the trigger
            template(#header-extra)
                div(v-if="form.pattern_id && !is_mobile" class="flex items-center gap-2")
                    LogSlider(
                        v-model="form.pattern_scale"
                        :min="0.2"
                        :max="5"
                        log
                        suffix="x"
                        class="flex-1"
                    )
                    ColorSwatch(v-model="form.pattern_color" clearable)

        //- Duplicate scale slider + color swatch, also shown in the sidebar row so they're
        //- adjustable without opening the dialog
        template(v-if="form.pattern_id")
            LogSlider(
                v-model="form.pattern_scale"
                :min="0.2"
                :max="5"
                log
                suffix="x"
                class="flex-1"
            )
            ColorSwatch(v-model="form.pattern_color" clearable)

        //- Clear button (only visible when a pattern is selected)
        UButton(
            v-if="form.pattern_id"
            type="button"
            color="neutral"
            variant="ghost"
            size="md"
            icon="material-symbols:close"
            :aria-label="t('background.remove_pattern_aria')"
            @click="form.pattern_id = null"
        )

//- Icon
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('background.icon_label') }}
    div(class="flex items-center gap-1.25")
        //- Trigger: 4 example thumbnails, or the selected icon preview
        button(
            type="button"
            class="flex items-center gap-2 cursor-pointer min-w-0 hover:opacity-80"
            :aria-label="t('background.choose_icon_placeholder')"
            @click="icon_picker_open = true"
        )
            div(class="flex overflow-hidden shrink-0 gap-1")
                template(v-if="!form.icon_id")
                    img(
                        v-for="ic in PREVIEW_ICONS"
                        :key="ic.id"
                        :src="ic.url"
                        :alt="ic.id"
                        class="w-10 h-10 p-1 shrink-0"
                        :style="is_dark ? 'filter: brightness(0) invert(1)' : ''"
                    )
                div(v-else class="relative shrink-0")
                    img(
                        v-if="icon_preview_status !== 'invalid'"
                        :src="selected_icon_url"
                        :alt="form.icon_id"
                        class="w-10 h-10 p-1 shrink-0"
                        :style="is_dark ? 'filter: brightness(0) invert(1)' : ''"
                        @load="icon_preview_status = 'valid'"
                        @error="icon_preview_status = 'invalid'"
                    )
                    UIcon(
                        v-else
                        name="material-symbols:error"
                        class="w-10 h-10 p-2 shrink-0 text-red-600 dark:text-red-400"
                    )
            span(v-if='!form.icon_id' class="text-sm text-muted") {{ t('background.choose_icon_placeholder') }}

        //- Picker dialog: grid of all icons, custom id field, and Iconify help
        SidebarPickerDialog(v-model:open="icon_picker_open" :title="t('background.icon_dialog_title')")
            div(class="flex flex-col gap-4")
                div(v-for="group in ICON_GROUPS" :key="group.id")
                    label(class="text-xs font-semibold tracking-[0.02em] mb-1.5 block") {{ t(`icon_categories.${group.id}`) }}
                    div(class="grid gap-1.5" style="grid-template-columns: repeat(4, 1fr)")
                        button(
                            v-for="ic in group.icons"
                            :key="ic.id"
                            type="button"
                            class="aspect-square rounded border-2 p-2 cursor-pointer touch-manipulation hover:bg-accented"
                            :class="form.icon_id === ic.id ? 'border-primary' : 'border-transparent'"
                            :title="ic.id"
                            @click="select_icon(ic.id)"
                        )
                            img(:src="ic.url" class="w-full h-full" :alt="ic.id" :style="is_dark ? 'filter: brightness(0) invert(1)' : ''")

            div(class="mt-4 pt-4 border-t border-default flex flex-col gap-3 text-sm")
                //- Inlined Iconify help (formerly a separate "More" button + modal)
                p {{ t('iconify_help.intro') }}
                div(class="flex flex-col gap-2")
                    p(class="font-semibold") {{ t('iconify_help.instructions_heading') }}
                    ol(class="flex flex-col gap-1.5 list-decimal list-inside text-(--ui-text-muted)")
                        li
                            | {{ t('iconify_help.step1') }}
                            div(class="mt-1.5 list-none")
                                UButton(
                                    as="a"
                                    href="https://icon-sets.iconify.design"
                                    target="_blank"
                                    rel="noopener"
                                    color="neutral"
                                    variant="subtle"
                                    size="sm"
                                    trailing-icon="material-symbols:open-in-new"
                                ) {{ t('iconify_help.open_button') }}
                        li
                            | {{ t('iconify_help.step2') }}
                        li
                            | {{ t('iconify_help.step3_prefix') }}&nbsp;
                            code(class="font-mono bg-(--ui-bg-elevated) px-1 rounded text-xs") collection:icon-name
                            | {{ t('iconify_help.step3_suffix') }}
                        li
                            | {{ t('iconify_help.step4') }}

                //- Custom Iconify id — same field/behavior as before, now with inline
                //- existence verification
                div(class="flex flex-col gap-1")
                    label(class="text-xs font-semibold tracking-[0.02em]") {{ t('background.custom_icon_label') }}
                    div(class="flex items-center gap-2")
                        input(
                            :value="form.icon_id ?? ''"
                            type="text"
                            :placeholder="t('background.icon_input_placeholder')"
                            class="flex-1 text-xs px-2 py-1.5 border border-default rounded-md bg-default outline-none min-w-0"
                            @input="on_custom_icon_input"
                        )
                        UIcon(v-if="icon_id_status" :name="icon_id_status_icon" class="w-3.5 h-3.5 shrink-0" :class="icon_id_status_class")

            //- Pinned under the title, stays in view while the groups/help below scroll —
            //- hidden on mobile since it duplicates the always-visible slider/swatch below
            template(#header-extra)
                div(v-if="form.icon_id && !is_mobile" class="flex items-center gap-2")
                    LogSlider(
                        v-model="form.icon_size"
                        :min="0.4"
                        :max="2"
                        log
                        suffix="x"
                        class="flex-1"
                    )
                    ColorSwatch(v-model="form.icon_color" clearable)

        //- Duplicate size slider + color swatch, also shown in the sidebar row so they're
        //- adjustable without opening the dialog
        LogSlider(
            v-if="form.icon_id"
            v-model="form.icon_size"
            :min="0.4"
            :max="2"
            log
            suffix="x"
            class="flex-1"
        )
        ColorSwatch(v-if="form.icon_id" v-model="form.icon_color" clearable)

        //- Clear button (only visible when an icon is selected)
        UButton(
            v-if="form.icon_id"
            type="button"
            color="neutral"
            variant="ghost"
            size="md"
            icon="material-symbols:close"
            :aria-label="t('background.remove_icon_aria')"
            @click="form.icon_id = null"
        )

//- Icon mode toggle
div(v-if="form.icon_id" class="flex flex-col gap-2")
    div(class="flex")
        UButton(
            v-for="m in ICON_MODES"
            :key="m.value"
            type="button"
            color="neutral"
            :variant="form.icon_mode === m.value ? 'solid' : 'outline'"
            size="sm"
            class="flex-1"
            :class="m.value === 'center' ? 'rounded-r-none' : m.value === 'echo' ? 'rounded-l-none' : 'rounded-none'"
            @click="form.icon_mode = m.value"
        ) {{ t(`background.icon_mode_${m.value}`) }}


//- One-time low-resolution warning shown right after a new image is added
UModal(v-model:open="low_res_dialog_open" :ui="{content: 'max-w-sm'}")
    template(#header)
        p(class="text-lg font-semibold") {{ bg_dpi_warning?.title }}
    template(#body)
        div(class="flex flex-col gap-3")
            p(class="text-sm text-muted") {{ bg_dpi_warning?.body }}
            dl(class="text-xs text-muted flex flex-col gap-0.5")
                div(class="flex justify-between gap-2")
                    dt {{ t('background.dpi_modal_image_size') }}
                    dd {{ bg_dpi_warning?.actual_size }}
                div(v-if="bg_dpi_warning?.acceptable_size" class="flex justify-between gap-2")
                    dt {{ t('background.dpi_modal_acceptable_size') }}
                    dd {{ bg_dpi_warning?.acceptable_size }}
                div(class="flex justify-between gap-2")
                    dt {{ t('background.dpi_modal_recommended_size') }}
                    dd {{ bg_dpi_warning?.recommended_size }}
    template(#footer)
        div(class="flex justify-end w-full")
            UButton(type="button" color="neutral" variant="subtle" size="sm" @click="low_res_dialog_open = false") {{ t('background.understood_button') }}

</template>

<script setup lang="ts">
// Background section — image, pattern, and icon pickers, plus color and mode controls

import {inject, ref, computed, watch, onMounted, onUnmounted} from 'vue'
import {useDark} from '@vueuse/core'
import {useI18n} from 'vue-i18n'
import {FORM_KEY, IS_MOBILE_KEY} from '../../form_state'
import type {FormState} from '../../form_state'
import {suggested_icons, icon_categories} from '../../services/icons'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import {PATTERNS, PREVIEW_PATTERNS, get_preview_url, get_preview_size} from '../../services/patterns'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import {BACKGROUNDS, PREVIEW_BGS, bg_thumb_url, fetch_bg_file} from '../../services/backgrounds'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import {VECTOR_BACKGROUNDS, find_vector_background, get_preview_url as get_vector_preview_url} from '../../services/vector_backgrounds'
import {check_bg_image_dpi} from '../../dpi'
import type {BgImageDpiWarning} from '../../dpi'
import {synthesize_fill, all_image_regions, VECTOR_BG_AUTO_COLOR} from 'bookcover-web'
import {image_regions} from '../../image_regions_cache'
import {contrast_color} from '../../svg_utils'
import ColorPicker from './ColorPicker.vue'
import ColorSwatch from './ColorSwatch.vue'
import LogSlider from '../LogSlider.vue'
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
import SidebarPickerDialog from './SidebarPickerDialog.vue'

// Inject the shared form state
const form = inject(FORM_KEY)!
const is_mobile = inject(IS_MOBILE_KEY)!
const is_dark = useDark()
const {t} = useI18n()

/** Build {id, url} icon swatches (rendered via Iconify SVG API) for a list of icon ids */
function to_icon_swatches(ids:string[]): {id:string, url:string}[] {
    return ids.map(id => {
        const [collection, name] = id.split(':')
        return {id, url: `https://api.iconify.design/${collection}/${name}.svg`}
    })
}

// Suggested icons grouped by theme, for the picker dialog's subheadings
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const ICON_GROUPS = icon_categories.map(c => ({id: c.id, icons: to_icon_swatches(c.icons)}))

// First 4 icons used as preview thumbnails in the trigger area
const PREVIEW_ICONS = to_icon_swatches(suggested_icons.slice(0, 4))

// Controls each picker dialog's open state
const icon_picker_open = ref(false)
const bg_picker_open = ref(false)
const pattern_picker_open = ref(false)

// Object URL for current bg_image File — revokes previous URL on change
const bg_image_url = computed(() => form.bg_image ? URL.createObjectURL(form.bg_image) : '')
watch(bg_image_url, (_new, old) => { if (old) URL.revokeObjectURL(old) })

// bg_color's resolved value when left auto (null) — complements the background image, a fixed
// neutral tan for a vector background (no pixels to sample), or white when there's neither.
// Mirrors the same fallback resolve_colors() applies at generate time (see design.ts), so this
// picker's swatch/preview always match what actually renders
const effective_bg_color = computed(() => {
    if (form.bg_color) return form.bg_color
    const regions = image_regions.value
    if (!regions) return form.bg_vector_id ? VECTOR_BG_AUTO_COLOR : '#ffffff'
    return synthesize_fill(all_image_regions(regions))
})

// White or black text, whichever contrasts more against effective_bg_color — used for the
// "auto" label overlaid on the bg color preview swatch
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const bg_color_preview_contrast = computed(() => contrast_color(effective_bg_color.value))

// Fill color for pattern preview swatches — the chosen pattern color if set, otherwise
// whichever of black/white contrasts against the actual background color behind it, so the
// preview matches how the pattern actually renders on the cover
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const pattern_preview_fill = computed(() => form.pattern_color ?? contrast_color(effective_bg_color.value))

// Currently selected vector background, if any — used for the trigger preview thumbnail
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const selected_vector_bg = computed(() => (
    form.bg_vector_id ? find_vector_background(form.bg_vector_id) : undefined
))

// Intrinsic pixel dimensions of the current bg_image, decoded async whenever the file changes
const bg_image_px = ref<{width:number, height:number} | null>(null)

// Live resolution warning for the current image against the current print size (full-cover
// basis) — null when resolution is fine or nothing is uploaded yet
const bg_dpi_warning = computed<BgImageDpiWarning | null>(() => {
    if (!bg_image_px.value)
        return null
    try {
        return check_bg_image_dpi(form, bg_image_px.value.width, bg_image_px.value.height)
    } catch {
        return null
    }
})

// Short clickable label for the inline warning — full detail lives in the dialog it opens
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const dpi_warning_short = computed(() => (
    bg_dpi_warning.value?.level === 'very_low' ? t('background.dpi_short_very_low') : t('background.dpi_short_low')
))

// Inline warning styling — amber for the mild tier, red for the severe tier
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const dpi_warning_class = computed(() => ({
    'text-amber-600 dark:text-amber-400': bg_dpi_warning.value?.level === 'low',
    'text-red-600 dark:text-red-400': bg_dpi_warning.value?.level === 'very_low',
}))
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const dpi_warning_icon = computed(() => (
    bg_dpi_warning.value?.level === 'very_low' ? 'material-symbols:error' : 'material-symbols:warning'
))

// One-time low-resolution dialog, opened when a newly user-added image is below print quality
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const low_res_dialog_open = ref(false)

// Set right before a user-initiated upload/paste so the watcher below only pops the one-time
// dialog for images the user actually chose — not suggested backgrounds or the demo default
let bg_image_is_user_upload = false

/** Decode a File's intrinsic pixel dimensions */
async function decode_image_size(file:File):Promise<{width:number, height:number}> {
    const bitmap = await createImageBitmap(file)
    const size = {width: bitmap.width, height: bitmap.height}
    bitmap.close()
    return size
}

// Re-decode pixel dimensions whenever the image changes, then show the one-time low-res
// dialog if a newly user-added image doesn't meet the current print size
watch(() => form.bg_image, async (file) => {
    const check_dialog = bg_image_is_user_upload
    bg_image_is_user_upload = false
    if (!file) {
        bg_image_px.value = null
        return
    }
    const size = await decode_image_size(file)
    // Bail if the image changed again while decoding
    if (form.bg_image !== file)
        return
    bg_image_px.value = size
    if (!check_dialog)
        return
    try {
        if (check_bg_image_dpi(form, size.width, size.height))
            low_res_dialog_open.value = true
    } catch { /* print dimensions not resolvable yet */ }
})

/** Fetch a suggested background by filename, convert to File, and apply it */
async function select_suggested_bg(filename:string): Promise<void> {
    form.bg_image = await fetch_bg_file(filename)
    form.bg_vector_id = null
}

/** Select a built-in vector background — mutually exclusive with a photo image */
function select_vector_bg(id:string): void {
    form.bg_image = null
    form.bg_vector_id = id
    if (form.bg_image_coverage !== 'full' && form.bg_image_coverage !== 'front')
        form.bg_image_coverage = 'full'
}

/** Clear whichever background (photo or vector design) is currently active */
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
function clear_background(): void {
    form.bg_image = null
    form.bg_vector_id = null
}

/** Look up a pattern by the form's pattern_id — returns undefined when none selected */
function get_selected_pattern() {
    return form.pattern_id ? PATTERNS.find(p => p.id === form.pattern_id) : undefined
}

/** Select a pattern */
function select_pattern(id:string): void {
    form.pattern_id = id
}

// URL for the selected icon — used in the trigger area preview
const selected_icon_url = computed(() => {
    if (!form.icon_id) return ''
    const [collection, name] = form.icon_id.split(':')
    return `https://api.iconify.design/${collection}/${name}.svg`
})

// Load status of the trigger-area preview thumbnail itself, driven by the img's own
// load/error events rather than a throwaway probe — covers icons already saved on mount too
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const icon_preview_status = ref<'valid' | 'invalid' | null>(null)
watch(selected_icon_url, () => { icon_preview_status.value = null })

/** Select an icon from the suggested grid */
function select_icon(id:string): void {
    form.icon_id = id
    icon_id_status.value = 'valid'
}

// Existence-check state for the custom Iconify id field: null = not checked/empty
const icon_id_status = ref<'checking' | 'valid' | 'invalid' | null>(null)
let icon_id_check_timer: ReturnType<typeof setTimeout> | null = null

// Status icon/color for the custom Iconify id field — mirrors FontUploadModal's status display
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const icon_id_status_icon = computed(() => ({
    checking: 'material-symbols:progress-activity',
    valid: 'material-symbols:check-circle',
    invalid: 'material-symbols:error',
}[icon_id_status.value ?? 'checking']))
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
const icon_id_status_class = computed(() => ({
    'text-muted': icon_id_status.value === 'checking',
    'text-green-600 dark:text-green-400': icon_id_status.value === 'valid',
    'text-red-600 dark:text-red-400': icon_id_status.value === 'invalid',
}))

/** Probe whether a given Iconify id resolves to a real icon, via image load/error */
function check_icon_id(id:string): void {
    const [collection, name] = id.split(':')
    const img = new Image()
    img.onload = () => { if (form.icon_id === id) icon_id_status.value = 'valid' }
    img.onerror = () => { if (form.icon_id === id) icon_id_status.value = 'invalid' }
    img.src = `https://api.iconify.design/${collection}/${name}.svg`
}

/** Sync the custom Iconify id input to form, debounced existence check */
// @ts-ignore TS6133 — used in Pug template; Volar can't trace Pug bindings
function on_custom_icon_input(e:Event): void {
    const val = (e.target as HTMLInputElement).value
    form.icon_id = val || null
    if (icon_id_check_timer !== null) clearTimeout(icon_id_check_timer)
    if (!val) {
        icon_id_status.value = null
        return
    }
    if (!val.includes(':')) {
        icon_id_status.value = 'invalid'
        return
    }
    icon_id_status.value = 'checking'
    icon_id_check_timer = setTimeout(() => check_icon_id(val), 300)
}

// Icon placement mode options — display labels are translated in the template via
// t(`background.icon_mode_${value}`)
const ICON_MODES: {value:FormState['icon_mode']}[] = [
    {value: 'center'},
    {value: 'offset'},
    {value: 'echo'},
]

// Preset primary swatches: row 0 = light colors, row 1 = dark colors
// Hues are shifted off common primaries for visual interest; all are within CMYK gamut
const primary_swatch_rows = [
    ['#e0a898', '#f0c878', '#e8cc98', '#b8d4a0', '#9ecfbf', '#a8b8e0', '#c8b0d8', '#e8a8b8'],
    ['#8c3825', '#8c6818', '#786018', '#4a6018', '#1a6b60', '#28386b', '#5c2870', '#7a2858'],
]

// Debounce timer for bg_color input — emit only after 2s of no changes
let bg_color_timer: ReturnType<typeof setTimeout> | null = null

/** Debounce bg_color input: update form only after 2s of no changes */
function on_bg_color_input(e:Event): void {
    const value = (e.target as HTMLInputElement).value
    if (bg_color_timer !== null) clearTimeout(bg_color_timer)
    bg_color_timer = setTimeout(() => { form.bg_color = value }, 2000)
}


/** Read the selected file from the file input and store it on the form */
function on_image_change(event:Event): void {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    if (file) bg_image_is_user_upload = true
    form.bg_image = file
    form.bg_vector_id = null
}

/** Extract an image file from a DataTransferItemList, if present */
function image_from_clipboard(items:DataTransferItemList): File | null {
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            return item.getAsFile()
        }
    }
    return null
}

/** Paste button: read image from clipboard API */
// @ts-ignore TS6133 — used in Pug template
async function on_paste_click(): Promise<void> {
    const items = await navigator.clipboard.read()
    for (const item of items) {
        const image_type = item.types.find(t => t.startsWith('image/'))
        if (image_type) {
            const blob = await item.getType(image_type)
            bg_image_is_user_upload = true
            form.bg_image = new File([blob], 'pasted', {type: image_type})
            form.bg_vector_id = null
            return
        }
    }
}

/** Global Ctrl+V handler — only applies when no image is set and no text input is focused */
function on_global_paste(event:ClipboardEvent): void {
    const active = document.activeElement
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
    if (!event.clipboardData) return
    const file = image_from_clipboard(event.clipboardData.items)
    if (file) {
        event.preventDefault()
        bg_image_is_user_upload = true
        form.bg_image = file
        form.bg_vector_id = null
    }
}

onMounted(() => window.addEventListener('paste', on_global_paste))
onUnmounted(() => window.removeEventListener('paste', on_global_paste))
</script>
