
import {describe, it, expect, vi, afterEach} from 'vitest'

import {clipboard_read_possible} from '../src/clipboard'


/** A document whose permissions policy knows `features` and allows only `allowed` */
function policy_doc(key:'permissionsPolicy' | 'featurePolicy', features:string[],
        allowed:string[]):Document {
    return {[key]: {
        features: () => features,
        allowsFeature: (feature:string) => allowed.includes(feature),
    }} as unknown as Document
}

/** Give the stand-in navigator an async clipboard read, or none */
function stub_clipboard(read:boolean):void {
    vi.stubGlobal('navigator', {clipboard: read ? {read: async () => []} : {}})
}


describe('clipboard_read_possible', () => {

    afterEach(() => { vi.unstubAllGlobals() })

    it('is false without an async clipboard read, whatever the policy says', () => {
        stub_clipboard(false)
        expect(clipboard_read_possible({} as Document)).toBe(false)
        vi.stubGlobal('navigator', {})
        expect(clipboard_read_possible({} as Document)).toBe(false)
    })

    it('is false when the policy forbids clipboard-read (an iframe that wasn\'t delegated it)', () => {
        stub_clipboard(true)
        const features = ['clipboard-read', 'clipboard-write']
        expect(clipboard_read_possible(policy_doc('featurePolicy', features, []))).toBe(false)
        expect(clipboard_read_possible(policy_doc('permissionsPolicy', features, []))).toBe(false)
    })

    it('is true when the policy allows it, before the user has been asked', () => {
        stub_clipboard(true)
        expect(clipboard_read_possible(
            policy_doc('featurePolicy', ['clipboard-read'], ['clipboard-read']))).toBe(true)
    })

    it('is true when the browser can\'t tell, rather than guessing', () => {
        stub_clipboard(true)
        // No policy API at all (Firefox, Safari)
        expect(clipboard_read_possible({} as Document)).toBe(true)
        // A policy API that doesn't know the feature, and so would deny it by default
        expect(clipboard_read_possible(policy_doc('featurePolicy', ['camera'], []))).toBe(true)
    })

    it('prefers the standard permissionsPolicy over Chromium\'s featurePolicy', () => {
        stub_clipboard(true)
        const doc = {
            ...policy_doc('permissionsPolicy', ['clipboard-read'], ['clipboard-read']),
            ...policy_doc('featurePolicy', ['clipboard-read'], []),
        } as Document
        expect(clipboard_read_possible(doc)).toBe(true)
    })
})
