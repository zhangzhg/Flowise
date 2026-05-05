/**
 * Shared tuneable parameters for the Pet AI system.
 * All magic numbers live here — business logic files import from this module.
 */

// ── Personality ──────────────────────────────────────────────────────────────

/** Dimensionality of the personality vector. */
export const PERSONALITY_DIM = 8

/** Per-trait-tag weight applied when a teaching card updates the personality vector. */
export const TEACH_PERSONALITY_WEIGHT = 0.05

// ── Drift alpha (how fast personality shifts during conversation) ─────────────

/** Per-turn drift alpha, keyed by stage. Stages not listed get no drift. */
export const STAGE_DRIFT_ALPHA: Readonly<Partial<Record<string, number>>> = {
    echo: 0.005,
    talk: 0.015,
    mature: 0.02
}

/**
 * Session-level consolidation formula:
 *   alpha_session = SESSION_ALPHA_BASE * log(1 + turnCount / SESSION_ALPHA_DIVISOR)
 */
export const SESSION_ALPHA_BASE = 0.04
export const SESSION_ALPHA_DIVISOR = 5

/** Daily consolidation flat alpha. */
export const DAILY_ALPHA = 0.1
/** Per-dimension absolute cap on daily correction (prevents runaway drift). */
export const DAILY_CORRECTION_CAP = 0.3

// ── Card matching ─────────────────────────────────────────────────────────────

/** Max action cards considered per query. */
export const ACTION_TOPK = 3
/** Max vocab/phrase cards recalled in echo stage. */
export const ECHO_RECALL_TOPK = 5
/** Max vocab/phrase cards recalled in talk/mature stage few-shot. */
export const CHAT_RECALL_TOPK = 5

/** Minimum cosine similarity for an action card to fire an intent. */
export const ACTION_MATCH_THRESHOLD = 0.72
/** Minimum cosine similarity for babble stage to return a card directly. */
export const BABBLE_DIRECT_THRESHOLD = 0.75

// ── Prompt character limits ───────────────────────────────────────────────────

/** Max characters the pet LLM should produce, per stage. Injected into system prompts. */
export const STAGE_MAX_CHARS: Readonly<Record<string, number>> = {
    echo: 15,
    talk: 80
}
