
// Whether the Paste button's clipboard read can work in this page at all

// The permissions policy API: `document.permissionsPolicy` in the spec, `document.featurePolicy`
// in Chromium, absent in Firefox and Safari (not yet in TypeScript's DOM types)
interface PermissionsPolicy {
    features():string[]
    allowsFeature(feature:string):boolean
}


// False only when the browser is certain to refuse a clipboard read without asking the user: it
// has no async clipboard read, or the page's permissions policy forbids one (an iframe whose host
// didn't delegate `clipboard-read`). A policy is decided before any permission prompt, so a page
// it allows still shows the button even if the user hasn't been asked yet. A browser that can't
// report its policy, or doesn't know the feature, gets the button too, since a refused click
// explains itself (see on_paste_click in BackgroundSection.vue)
export function clipboard_read_possible(doc:Document = document):boolean {
    if (typeof navigator.clipboard?.read !== 'function'){
        return false
    }
    const policy = (doc as {permissionsPolicy?:PermissionsPolicy, featurePolicy?:PermissionsPolicy})
    const api = policy.permissionsPolicy ?? policy.featurePolicy
    if (!api?.features().includes('clipboard-read')){
        return true
    }
    return api.allowsFeature('clipboard-read')
}
