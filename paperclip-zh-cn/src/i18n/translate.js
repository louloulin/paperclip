/**
 * Pure translation engine. No DOM access, no host API — everything here is
 * unit-testable in plain Node, which is what keeps the runtime layer thin and
 * the rollback guarantee cheap to test.
 */
import { DICTIONARY_ZH_CN, TRANSLATED_ATTRIBUTES } from "./dictionary.zh-cn.js";

const CJK = /[㐀-鿿豈-﫿]/;
const CODE_LIKE = /[{}<>]|=>|\/\/|https?:|[A-Za-z]:\\/;
const MAX_PHRASE_SOURCE_LENGTH = 80;

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Build a lookup table keyed by the normalized source string.
 * Longest keys first so phrase replacement prefers "In Progress" over "In".
 */
export function buildLookup(dictionary = DICTIONARY_ZH_CN) {
  const exact = new Map();
  const exactCi = new Map();
  for (const [source, target] of Object.entries(dictionary)) {
    const key = normalizeText(source);
    if (!key || !target) continue;
    if (!exact.has(key)) exact.set(key, target);
    const lower = key.toLowerCase();
    if (!exactCi.has(lower)) exactCi.set(lower, target);
  }
  const phrases = [...exact.keys()]
    .filter((key) => key.includes(" "))
    .sort((a, b) => b.length - a.length);
  return { exact, exactCi, phrases };
}

const DEFAULT_LOOKUP = buildLookup();

/** Accept either a prebuilt lookup or a raw dictionary for the last argument. */
export function lookupFor(lookupOrDictionary) {
  if (!lookupOrDictionary) return DEFAULT_LOOKUP;
  if (lookupOrDictionary instanceof Map || lookupOrDictionary.exact instanceof Map) return lookupOrDictionary;
  return buildLookup(lookupOrDictionary);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Translate one string.
 *
 * Pass 1 is an exact lookup on the normalized text. Pass 2 replaces known
 * phrases inside longer sentences on word boundaries. Both passes refuse
 * anything that already contains CJK, so the function is idempotent and a
 * host-side re-render can never double-translate.
 *
 * @returns {string|null} the translated text, or null when nothing applies.
 */
export function translateText(value, lookupOrDictionary = DEFAULT_LOOKUP) {
  const lookup = lookupFor(lookupOrDictionary);
  const raw = String(value ?? "");
  const normalized = normalizeText(raw);
  if (!normalized || CJK.test(normalized)) return null;
  const exact = lookup.exact.get(normalized);
  if (exact) return preserveWhitespace(raw, exact, normalized);
  if (normalized.length > MAX_PHRASE_SOURCE_LENGTH || CODE_LIKE.test(normalized)) return null;
  let replaced = null;
  for (const phrase of lookup.phrases) {
    const pattern = new RegExp(`(^|[\\s(\u2014-])(${escapeRegExp(phrase)})(?=$|[\\s).,!?:;\u2014-])`, "i");
    if (!pattern.test(normalized)) continue;
    const next = normalized.replace(pattern, (_match, lead, hit) => `${lead}${lookup.exactCi.get(hit.toLowerCase()) ?? hit}`);
    if (next !== normalized) {
      replaced = next;
      break;
    }
  }
  return replaced ? preserveWhitespace(raw, replaced, normalized) : null;
}

/** Keep the source string's leading/trailing whitespace so layout never shifts. */
function preserveWhitespace(raw, translated, normalized) {
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.slice(normalized.length ? raw.indexOf(normalized) + normalized.length : 0).match(/^\s*/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

/**
 * Translate a translatable attribute value.
 * @returns {string|null}
 */
export function translateAttribute(name, value, lookupOrDictionary = DEFAULT_LOOKUP, attributes = TRANSLATED_ATTRIBUTES) {
  if (!attributes.includes(name)) return null;
  return translateText(value, lookupOrDictionary);
}

/** True when the runtime has already produced Chinese for this string. */
export function isTranslated(value) {
  return CJK.test(String(value ?? ""));
}

export { DICTIONARY_ZH_CN, TRANSLATED_ATTRIBUTES, CJK };
