// The typst-fonts-download CLI's argument handling. The CLI runs on import (top-level await),
// so each test sets process.argv and imports a fresh copy, with the download itself mocked.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {run_download, run_check} from '../src/download/run.js'

import type {FontsConfig} from '../src/download/types.js'


vi.mock('../src/download/run.js', () => ({
    run_download: vi.fn(async () => {}),
    run_check: vi.fn(async () => {}),
}))

// Run the CLI with the given arguments, as `typst-fonts-download ...args`
async function run_cli(...args:string[]):Promise<void> {
    process.argv = ['node', 'typst-fonts-download', ...args]
    vi.resetModules()
    await import('../src/download/cli.js')
}

// Restore the real argv after each test, and give each a scratch dir for config files
const real_argv = process.argv
let dir:string
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'typst-fonts-cli-'))
})
afterEach(() => {
    process.argv = real_argv
    rmSync(dir, {recursive: true, force: true})
    vi.clearAllMocks()
    vi.restoreAllMocks()
})


describe('typst-fonts-download', () => {

    it('downloads into ./fonts by default, with no config and no overlap merging', async () => {
        await run_cli()
        expect(run_download).toHaveBeenCalledWith(
            {fonts_dir: './fonts', config: undefined, remove_overlaps: false})
        expect(run_check).not.toHaveBeenCalled()
    })

    it('passes --fonts, the parsed --config file and --remove-overlaps through', async () => {
        const config:FontsConfig = {noto_group: 'Base',
            curated: [{family: 'Test Serif', group: 'Serif', style: 'serif'}]}
        const config_path = join(dir, 'config.json')
        writeFileSync(config_path, JSON.stringify(config))
        await run_cli('--remove-overlaps', '--fonts', '/out/fonts', '--config', config_path)
        expect(run_download).toHaveBeenCalledWith(
            {fonts_dir: '/out/fonts', config, remove_overlaps: true})
    })

    it('only checks the tree with --check, downloading nothing', async () => {
        await run_cli('--fonts', '/out/fonts', '--check')
        expect(run_check).toHaveBeenCalledWith('/out/fonts')
        expect(run_download).not.toHaveBeenCalled()
    })

    it('fails on an unreadable --config file before downloading anything', async () => {
        await expect(run_cli('--config', join(dir, 'missing.json'))).rejects.toThrow(/ENOENT/)
        expect(run_download).not.toHaveBeenCalled()
    })

    it('prints usage and exits 0 for --help and -h', async () => {
        for (const flag of ['--help', '-h']) {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {})
            // Make exit() stop the module's evaluation, as the real one would
            vi.spyOn(process, 'exit').mockImplementation(code => {
                throw new Error(`exit ${code}`)
            })
            await expect(run_cli(flag)).rejects.toThrow('exit 0')
            expect(log.mock.calls[0]![0]).toMatch(/^Usage: typst-fonts-download --fonts <dir>/)
            expect(run_download).not.toHaveBeenCalled()
            vi.restoreAllMocks()
        }
    })
})
