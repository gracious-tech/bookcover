
<template lang="pug">

//- Modal dialog containing the Tiptap WYSIWYG markdown editor for the back blurb

UModal(:open="open_model" @update:open="open_model = $event" :ui="{content: 'max-w-lg'}")
    template(#header)
        div(class="flex items-center justify-between w-full")
            p(class="text-sm font-semibold") {{ t('common.back_blurb') }}
            UButton(type="button" size="xs" variant="ghost" color="neutral" icon="material-symbols:close" @click="open_model = false" :aria-label="t('common.close')")

    template(#body)
        //- Formatting toolbar
        div(class="flex gap-1 mb-3 pb-2 border-b border-(--ui-border)")
            UButton(
                type="button"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="material-symbols:format-bold"
                :class="editor?.isActive('bold') ? 'bg-accented' : ''"
                @click="editor?.chain().focus().toggleBold().run()"
                :aria-label="t('blurb_editor.bold_aria')"
            )
            UButton(
                type="button"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="material-symbols:format-italic"
                :class="editor?.isActive('italic') ? 'bg-accented' : ''"
                @click="editor?.chain().focus().toggleItalic().run()"
                :aria-label="t('blurb_editor.italic_aria')"
            )
            //- Separator
            div(class="w-px bg-border mx-1")
            //- Heading buttons
            UButton(
                type="button"
                size="md"
                variant="ghost"
                color="neutral"
                icon="material-symbols:format-h1"
                :class="editor?.isActive('heading', {level: 1}) ? 'bg-accented' : ''"
                @click="editor?.chain().focus().toggleHeading({level: 1}).run()"
                :aria-label="t('blurb_editor.h1_aria')"
            )
            UButton(
                type="button"
                size="md"
                variant="ghost"
                color="neutral"
                icon="material-symbols:format-h2"
                :class="editor?.isActive('heading', {level: 2}) ? 'bg-accented' : ''"
                @click="editor?.chain().focus().toggleHeading({level: 2}).run()"
                :aria-label="t('blurb_editor.h2_aria')"
            )
            //- Separator
            div(class="w-px bg-border mx-1")
            //- List and quote buttons
            UButton(
                type="button"
                size="md"
                variant="ghost"
                color="neutral"
                icon="material-symbols:format-list-bulleted"
                :class="editor?.isActive('bulletList') ? 'bg-accented' : ''"
                @click="editor?.chain().focus().toggleBulletList().run()"
                :aria-label="t('blurb_editor.bullet_list_aria')"
            )
            UButton(
                type="button"
                size="md"
                variant="ghost"
                color="neutral"
                icon="material-symbols:format-list-numbered"
                :class="editor?.isActive('orderedList') ? 'bg-accented' : ''"
                @click="editor?.chain().focus().toggleOrderedList().run()"
                :aria-label="t('blurb_editor.ordered_list_aria')"
            )
            UButton(
                type="button"
                size="md"
                variant="ghost"
                color="neutral"
                icon="material-symbols:format-quote"
                :class="editor?.isActive('blockquote') ? 'bg-accented' : ''"
                @click="editor?.chain().focus().toggleBlockquote().run()"
                :aria-label="t('blurb_editor.blockquote_aria')"
            )
            div(class="w-px bg-border mx-1")
            UButton(
                type="button"
                size="md"
                variant="ghost"
                color="neutral"
                icon="material-symbols:horizontal-rule"
                @click="editor?.chain().focus().setHorizontalRule().run()"
                :aria-label="t('blurb_editor.hr_aria')"
            )

        //- Tiptap editor surface
        div(class="blurb-editor")
            EditorContent(:editor="editor")

</template>

<script setup lang="ts">
// BlurbEditorModal — Tiptap WYSIWYG editor for the back blurb, saves ProseMirror JSON to
// form state (rendered to Typst / plain text / HTML by the pm-to-typst package)

import {computed, inject, onBeforeUnmount, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {useEditor, EditorContent} from '@tiptap/vue-3'
import type {PmDoc} from 'pm-to-typst'
import {blurb_extensions} from '../../blurb_extensions'
import {FORM_KEY} from '../../form_state'
import {use_modal_tracking} from '../../modal_state'

const props = defineProps<{open:boolean}>()
const emit = defineEmits<{(e:'update:open', val:boolean):void}>()

// Two-way binding for modal open state
const open_model = computed({
    get: () => props.open,
    set: (val) => emit('update:open', val),
})

// Register with modal tracker so the generator defers while this modal is open
use_modal_tracking(toRef(props, 'open'))

// Inject shared form state — editor reads and writes form.blurb
const form = inject(FORM_KEY)!

const {t} = useI18n()

// Initialise Tiptap with the shared blurb extensions (defines the document schema).
// Content is loaded from the stored JSON document; onUpdate auto-saves the JSON back.
const editor = useEditor({
    extensions: blurb_extensions,
    content: form.blurb,
    onUpdate({editor: e}) {
        form.blurb = e.getJSON() as PmDoc
    },
})

// Clean up the editor instance when the modal is unmounted
onBeforeUnmount(() => {
    editor.value?.destroy()
})
</script>

<style lang="sss" scoped>

/* Tiptap editor surface — sized and styled to match the widget's input aesthetic */
.blurb-editor :deep(.ProseMirror)
    min-height: 180px
    padding: 8px 12px
    border: 1px solid var(--ui-border)
    border-radius: 6px
    font-size: 13px
    line-height: 1.65
    outline: none
    background: var(--ui-bg)
    color: var(--ui-text)
    transition: border-color 0.1s

.blurb-editor :deep(.ProseMirror:focus)
    border-color: var(--ui-border-accented)

/* Paragraph spacing within editor */
.blurb-editor :deep(.ProseMirror p)
    margin: 0 0 0.65em

.blurb-editor :deep(.ProseMirror p:last-child)
    margin-bottom: 0

/* Heading styles — margins match Typst show heading rules in cover.typ */
.blurb-editor :deep(.ProseMirror h1)
    font-size: 1.3em
    font-weight: 700
    line-height: 1.25
    margin: 0.75em 0 0.4em

.blurb-editor :deep(.ProseMirror h2)
    font-size: 1.15em
    font-weight: 600
    line-height: 1.25
    margin: 0.6em 0 0.35em

/* First heading has no top margin (Typst suppresses above-spacing at container start) */
.blurb-editor :deep(.ProseMirror :is(h1, h2):first-child)
    margin-top: 0

/* List styles */
.blurb-editor :deep(.ProseMirror ul)
    list-style: disc
    padding-left: 1.4em
    margin: 0 0 0.65em

.blurb-editor :deep(.ProseMirror ol)
    list-style: decimal
    padding-left: 1.4em
    margin: 0 0 0.65em

/* Blockquote style */
.blurb-editor :deep(.ProseMirror blockquote)
    padding: 0 3em
    margin: 0 0 0.65em

/* Horizontal rule style */
.blurb-editor :deep(.ProseMirror hr)
    border: none
    border-top: 1px solid var(--ui-border)
    margin: 0.75em 0

</style>
