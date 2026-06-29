
// Shared Tiptap schema for the back-blurb editor

import StarterKit from '@tiptap/starter-kit'

// The single source of truth for the blurb's document schema. The editor (BlurbEditorModal) and
// the sidebar previews (generateHTML / generateText in ContentSection) both build from this list
// so the schema they parse never diverges. The cover itself is rendered separately, from the same
// stored JSON, via pm_to_typst() in schema.ts. Link is disabled so the cover stays link-free.
export const blurb_extensions = [
    StarterKit.configure({link: false}),
]
