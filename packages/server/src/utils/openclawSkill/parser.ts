import AdmZip from 'adm-zip'
import { OpenClawManifest, OpenClawSkillType, ParsedSkill } from './types'

const ALLOWED_TYPES: OpenClawSkillType[] = ['api', 'code', 'llm', 'python']

function assertManifest(raw: unknown): asserts raw is OpenClawManifest {
    if (!raw || typeof raw !== 'object') throw new Error('manifest.json must be a JSON object')
    const m = raw as Partial<OpenClawManifest>
    if (!m.name || typeof m.name !== 'string') throw new Error('manifest.name is required')
    if (!m.description || typeof m.description !== 'string') throw new Error('manifest.description is required')
    if (!m.type || !ALLOWED_TYPES.includes(m.type)) {
        throw new Error(`manifest.type must be one of ${ALLOWED_TYPES.join(', ')}`)
    }
    if (!Array.isArray(m.inputs)) throw new Error('manifest.inputs must be an array')
    for (const inp of m.inputs) {
        if (!inp || typeof inp !== 'object' || !inp.property || !inp.type) {
            throw new Error('each manifest.inputs entry needs at least { property, type }')
        }
    }
}

/**
 * Parse a raw OpenClaw skill payload.
 * Accepts either:
 *  - a zip buffer containing manifest.json (and an optional entry file referenced by manifest.entry)
 *  - a JSON buffer for a single-file manifest where logic lives inline in `entryContent`/`config`
 */
export function parseSkillPackage(buffer: Buffer, originalName: string): ParsedSkill {
    const lower = (originalName || '').toLowerCase()
    if (lower.endsWith('.json')) return parseJsonManifest(buffer)
    if (lower.endsWith('.zip')) return parseZipPackage(buffer)
    // fallback: sniff zip magic number "PK\x03\x04"
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return parseZipPackage(buffer)
    return parseJsonManifest(buffer)
}

function parseJsonManifest(buffer: Buffer): ParsedSkill {
    let manifest: unknown
    try {
        manifest = JSON.parse(buffer.toString('utf-8'))
    } catch (e) {
        throw new Error(`Invalid JSON manifest: ${(e as Error).message}`)
    }
    assertManifest(manifest)
    return { manifest, entryContent: manifest.entryContent }
}

function parseZipPackage(buffer: Buffer): ParsedSkill {
    let zip: AdmZip
    try {
        zip = new AdmZip(buffer)
    } catch (e) {
        throw new Error(`Invalid zip archive: ${(e as Error).message}`)
    }

    const manifestEntry = zip.getEntries().find((e) => e.entryName.replace(/\\/g, '/').endsWith('manifest.json'))
    if (!manifestEntry) throw new Error('manifest.json not found in skill package')

    let manifest: unknown
    try {
        manifest = JSON.parse(manifestEntry.getData().toString('utf-8'))
    } catch (e) {
        throw new Error(`manifest.json is not valid JSON: ${(e as Error).message}`)
    }
    assertManifest(manifest)

    let entryContent: string | undefined = manifest.entryContent
    if (!entryContent && manifest.entry) {
        const safe = manifest.entry.replace(/\\/g, '/').replace(/^(\.\.\/?)+/, '')
        const target = zip.getEntries().find((e) => e.entryName.replace(/\\/g, '/') === safe)
        if (!target) throw new Error(`entry file not found in package: ${manifest.entry}`)
        entryContent = target.getData().toString('utf-8')
        // Friendly guard: .py entry but type isn't 'python'
        if (safe.toLowerCase().endsWith('.py') && manifest.type !== 'python') {
            throw new Error(
                `entry "${manifest.entry}" is a Python file but manifest.type is "${manifest.type}". Set type to "python" to run via E2B.`
            )
        }
    }
    return { manifest, entryContent }
}
