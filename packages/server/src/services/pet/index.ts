import { StatusCodes } from 'http-status-codes'
import { Pet } from '../../database/entities/Pet'
import { Card } from '../../database/entities/Card'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { IPetAttributes, IPetGrowthCycle } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { deriveLevel, deriveStage } from '../../utils/pet/stage'

const PERSONALITY_DIM = 8

const ALLOWED_LANGUAGES = new Set(['zh', 'en', 'mixed'])
const ALLOWED_CARD_TYPES = new Set(['vocab', 'phrase', 'action'])

export interface CreatePetInput {
    name: string
    language?: string
    growthCycle?: Partial<IPetGrowthCycle>
}

export interface UpdatePetInput {
    name?: string
    language?: string
    skinId?: string
    petFlowId?: string | null
    growthCycle?: Partial<IPetGrowthCycle>
}

export interface FeedCardInput {
    cardType: string
    input: string
    output: string
    intentLabel?: string
    traitTags?: string[]
    stateDelta?: { mood?: number; energy?: number; hunger?: number; exp?: number }
    embedding?: number[]
    source?: string
    libraryName?: string
}

function defaultAttributes(): IPetAttributes {
    return { mood: 50, hunger: 50, energy: 80, level: 1, exp: 0, cardCount: 0 }
}

function defaultGrowthCycle(): IPetGrowthCycle {
    return { cardsThreshold: 50, hoursThreshold: 24 }
}

function defaultPersonalityVector(): number[] {
    return new Array(PERSONALITY_DIM).fill(0)
}

function parseAttributes(raw: string | null | undefined): IPetAttributes {
    if (!raw) return defaultAttributes()
    try {
        return { ...defaultAttributes(), ...(JSON.parse(raw) as IPetAttributes) }
    } catch {
        return defaultAttributes()
    }
}

function parseGrowthCycle(raw: string | null | undefined): IPetGrowthCycle {
    if (!raw) return defaultGrowthCycle()
    try {
        return { ...defaultGrowthCycle(), ...(JSON.parse(raw) as IPetGrowthCycle) }
    } catch {
        return defaultGrowthCycle()
    }
}

function parseVector(raw: string | null | undefined): number[] {
    if (!raw) return defaultPersonalityVector()
    try {
        const v = JSON.parse(raw)
        return Array.isArray(v) ? v : defaultPersonalityVector()
    } catch {
        return defaultPersonalityVector()
    }
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

function presentPet(pet: Pet) {
    const attrs = parseAttributes(pet.attributes)
    return {
        id: pet.id,
        userId: pet.userId,
        workspaceId: pet.workspaceId,
        name: pet.name,
        language: pet.language,
        birthDate: pet.birthDate,
        skinId: pet.skinId,
        attributes: attrs,
        personalityVector: parseVector(pet.personalityVector),
        personalityNarrative: pet.personalityNarrative,
        personalityNarrativeAt: pet.personalityNarrativeAt,
        embeddingDimension: pet.embeddingDimension,
        growthCycle: parseGrowthCycle(pet.growthCycle),
        petFlowId: pet.petFlowId ?? null,
        stage: deriveStage(attrs.cardCount),
        level: deriveLevel(attrs.exp),
        createdDate: pet.createdDate,
        updatedDate: pet.updatedDate
    }
}

function presentCard(card: Card) {
    return {
        id: card.id,
        petId: card.petId,
        cardType: card.cardType,
        input: card.input,
        output: card.output,
        intentLabel: card.intentLabel,
        traitTags: safeJson<string[]>(card.traitTags, []),
        stateDelta: safeJson<Record<string, number>>(card.stateDelta, {}),
        source: card.source,
        libraryName: card.libraryName,
        createdDate: card.createdDate
    }
}

const getMyPet = async (userId: string) => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(Pet)
        const pet = await repo.findOneBy({ userId })
        if (!pet) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Pet not found')
        return presentPet(pet)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: petsService.getMyPet - ${getErrorMessage(error)}`)
    }
}

const createPet = async (userId: string, workspaceId: string, body: CreatePetInput) => {
    try {
        if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Pet name is required')
        }
        const language = body.language && ALLOWED_LANGUAGES.has(body.language) ? body.language : 'zh'

        const repo = getRunningExpressApp().AppDataSource.getRepository(Pet)
        const existing = await repo.findOneBy({ userId })
        if (existing) {
            throw new InternalFlowiseError(StatusCodes.CONFLICT, 'Pet already exists for this user')
        }

        const growth = { ...defaultGrowthCycle(), ...(body.growthCycle ?? {}) }

        const pet = repo.create({
            userId,
            workspaceId,
            name: body.name.trim().slice(0, 64),
            language,
            birthDate: new Date(),
            attributes: JSON.stringify(defaultAttributes()),
            personalityVector: JSON.stringify(defaultPersonalityVector()),
            embeddingDimension: 512,
            growthCycle: JSON.stringify(growth)
        })
        const saved = await repo.save(pet)
        return presentPet(saved)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: petsService.createPet - ${getErrorMessage(error)}`)
    }
}

const updatePet = async (userId: string, body: UpdatePetInput) => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(Pet)
        const pet = await repo.findOneBy({ userId })
        if (!pet) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Pet not found')

        if (body.name !== undefined) {
            if (typeof body.name !== 'string' || !body.name.trim()) {
                throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Invalid name')
            }
            pet.name = body.name.trim().slice(0, 64)
        }
        if (body.language !== undefined) {
            if (!ALLOWED_LANGUAGES.has(body.language)) {
                throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Invalid language')
            }
            pet.language = body.language
        }
        if (body.skinId !== undefined) {
            pet.skinId = body.skinId || undefined
        }
        if (body.petFlowId !== undefined) {
            pet.petFlowId = body.petFlowId || undefined
        }
        if (body.growthCycle !== undefined) {
            const merged = { ...parseGrowthCycle(pet.growthCycle), ...body.growthCycle }
            pet.growthCycle = JSON.stringify(merged)
        }

        const saved = await repo.save(pet)
        return presentPet(saved)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: petsService.updatePet - ${getErrorMessage(error)}`)
    }
}

const deletePet = async (userId: string) => {
    try {
        const ds = getRunningExpressApp().AppDataSource
        const petRepo = ds.getRepository(Pet)
        const cardRepo = ds.getRepository(Card)
        const pet = await petRepo.findOneBy({ userId })
        if (!pet) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Pet not found')

        await cardRepo.delete({ petId: pet.id })
        await petRepo.delete({ id: pet.id })
        return { id: pet.id, deleted: true }
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: petsService.deletePet - ${getErrorMessage(error)}`)
    }
}

const feedCard = async (userId: string, body: FeedCardInput) => {
    try {
        if (!body || !body.cardType || !ALLOWED_CARD_TYPES.has(body.cardType)) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'cardType must be one of vocab|phrase|action')
        }
        if (typeof body.input !== 'string' || !body.input.trim()) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Card input is required')
        }
        if (typeof body.output !== 'string') {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Card output is required')
        }
        const ds = getRunningExpressApp().AppDataSource
        const petRepo = ds.getRepository(Pet)
        const cardRepo = ds.getRepository(Card)
        const pet = await petRepo.findOneBy({ userId })
        if (!pet) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Pet not found — create one first')

        const card = cardRepo.create({
            petId: pet.id,
            cardType: body.cardType,
            input: body.input.trim().slice(0, 1024),
            output: body.output.slice(0, 4096),
            intentLabel: body.intentLabel,
            traitTags: body.traitTags ? JSON.stringify(body.traitTags) : undefined,
            stateDelta: body.stateDelta ? JSON.stringify(body.stateDelta) : undefined,
            embedding: JSON.stringify(Array.isArray(body.embedding) ? body.embedding : []),
            source: body.source && ['user', 'library', 'parser'].includes(body.source) ? body.source : 'user',
            libraryName: body.libraryName
        })
        const savedCard = await cardRepo.save(card)

        // Apply attribute deltas + counters
        const attrs = parseAttributes(pet.attributes)
        attrs.cardCount += 1
        attrs.exp += 10
        if (body.stateDelta) {
            if (typeof body.stateDelta.mood === 'number') attrs.mood = clamp(attrs.mood + body.stateDelta.mood, -100, 100)
            if (typeof body.stateDelta.hunger === 'number') attrs.hunger = clamp(attrs.hunger + body.stateDelta.hunger, 0, 100)
            if (typeof body.stateDelta.energy === 'number') attrs.energy = clamp(attrs.energy + body.stateDelta.energy, 0, 100)
            if (typeof body.stateDelta.exp === 'number') attrs.exp = Math.max(0, attrs.exp + body.stateDelta.exp)
        } else {
            // Default: feeding nudges hunger down and mood slightly up
            attrs.hunger = clamp(attrs.hunger - 5, 0, 100)
            attrs.mood = clamp(attrs.mood + 1, -100, 100)
        }
        attrs.level = deriveLevel(attrs.exp)
        pet.attributes = JSON.stringify(attrs)
        await petRepo.save(pet)

        return { card: presentCard(savedCard), pet: presentPet(pet) }
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: petsService.feedCard - ${getErrorMessage(error)}`)
    }
}

const listCards = async (userId: string, opts: { page?: number; limit?: number; cardType?: string }) => {
    try {
        const ds = getRunningExpressApp().AppDataSource
        const pet = await ds.getRepository(Pet).findOneBy({ userId })
        if (!pet) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Pet not found')

        const page = Math.max(1, opts.page ?? 1)
        const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
        const qb = ds
            .getRepository(Card)
            .createQueryBuilder('c')
            .where('c.petId = :petId', { petId: pet.id })
            .orderBy('c.createdDate', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
        if (opts.cardType && ALLOWED_CARD_TYPES.has(opts.cardType)) {
            qb.andWhere('c.cardType = :cardType', { cardType: opts.cardType })
        }
        const [data, total] = await qb.getManyAndCount()
        return { data: data.map(presentCard), total, page, limit }
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: petsService.listCards - ${getErrorMessage(error)}`)
    }
}

function clamp(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min
    return Math.min(max, Math.max(min, n))
}

export default {
    getMyPet,
    createPet,
    updatePet,
    deletePet,
    feedCard,
    listCards
}
