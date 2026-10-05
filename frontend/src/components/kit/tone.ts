/**
 * The Sticker palette tones: colour is assigned by meaning (STICKER-SYSTEM 1.1).
 * tangerine = primary action and score, mint = good, lilac = thinking, lemon = attention,
 * rose = time pressure and problems, aqua = Portfolio only, stone = closed or neutral, white = a plain surface.
 * A tone-aware component sets data-tone; styles/kit/foundation.css turns it into --tone / --tone-soft.
 */
export type Tone = 'tangerine' | 'mint' | 'lilac' | 'lemon' | 'rose' | 'aqua' | 'stone' | 'white'

export const TONES: readonly Tone[] = ['tangerine', 'mint', 'lilac', 'lemon', 'rose', 'aqua', 'stone', 'white']
