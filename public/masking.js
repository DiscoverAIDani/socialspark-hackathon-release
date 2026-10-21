/**
 * SocialSpark — local-only, conservative preview masking (v0.3.1).
 * This is NOT a proof of anonymization. No AI endpoint uses this output.
 * All substitutions happen in memory; the original editor is never modified.
 */
import { reviewText } from './privacy.js';

const phone = /(?<!\w)(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\w)/gu;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const address = /\b\d{1,6}\s+(?:(?:N|S|E|W)\.?\s+)?(?:[\p{L}][\p{L}'’.-]*\s+){1,5}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Parkway|Pkwy|Circle|Cir)\b/giu;
const coords = /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/gu;
const ssn = /\b\d{3}-\d{2}-\d{4}\b/gu;
const declaredName = /\b(?:my\s+(?:full\s+)?name\s+is|I\s+am\s+named)\s+(?<value>[\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){1,3})/giu;
const finance = /\b(?:(?:bank|checking|savings|credit|debit)\s+)?(?:account|acct\.?|routing|card)\s*(?:number|num(?:ber)?\.?|no\.?|#)?\s*(?:(?:is|equals|:|=|#)\s*){0,2}(?<value>\d[\d\s-]{4,32}\d)\b/giu;
const secrets = /\b(?:my\s+)?(?:password|passcode|pin|one[-\s]?time\s+code|verification\s+code)\s*(?:is|:|=)\s*(?<value>[^\s.,;!?]{3,40})/giu;
const childAge = /\b(?:[1-9]|1[0-7])[-\s]+(?:years?|yrs?)[-\s]+old\b/giu;
const childRelationName = /\b(?:my|our)\s+(?:(?:young|little)\s+)?(?:(?:[1-9]|1[0-7])[-\s]+(?:years?|yrs?)[-\s]+old\s+)?(?:daughter|son|child|kid|granddaughter|grandson)\s+(?<value>[\p{Lu}][\p{L}'’-]+)\b/giu;
const schoolName = /\b(?<value>[\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){0,3}\s+(?:Elementary|Middle|High|Primary)\s+School)\b/gu;
const workplaceInPlace = /\bI\s+(?:work|am\s+employed)\s+(?:at|for)\s+(?<workplace>[\p{Lu}][\p{L}\d'’&-]*(?:\s+(?:[\p{Lu}][\p{L}\d'’&-]*|&|and)){0,5})\s+in\s+(?<place>[\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\b/gu;
const weekday = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/giu;
const explicitDate = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b/giu;

// Never merge overlapping replacements, and never assume a pattern caught all sensitive details.
function locateGroup(match, group) {
  const part = match.groups?.[group];
  if (!part) return null;
  const position = match[0].lastIndexOf(part);
  if (position < 0) return null;
  return { start: match.index + position, end: match.index + position + part.length };
}

export function createMaskPreview(text) {
  if (typeof text !== 'string') throw new TypeError('Post must be text');
  // Always recompute against the exact current draft. Never accept a stale or
  // caller-provided review as proof that another version was checked.
  const review = reviewText(text);
  const targets = [];
  const add = (start, end, type) => {
    if (start >= 0 && end > start && end <= text.length) targets.push({ start, end, type });
  };
  const collect = (expression, type, group) => {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      const span = group ? locateGroup(match, group) : { start: match.index, end: match.index + match[0].length };
      if (span) add(span.start, span.end, type);
    }
  };

  collect(phone, 'PHONE');
  collect(email, 'EMAIL');
  collect(address, 'ADDRESS');
  collect(coords, 'LOCATION');
  collect(ssn, 'IDENTIFIER');
  collect(declaredName, 'NAME', 'value');
  collect(finance, 'ACCOUNT', 'value');
  collect(secrets, 'SECRET', 'value');

  // Child data is only masked in recognized child-context warnings; don't mask
  // unrelated adults' ages, ordinary names, or school fundraising references.
  if (review.findings.some(f => f.category === 'children')) {
    collect(childAge, 'AGE');
    collect(childRelationName, 'CHILD_NAME', 'value');
    collect(schoolName, 'SCHOOL', 'value');
  }
  if (review.findings.some(f => f.category === 'combination' && f.title.includes('workplace'))) {
    workplaceInPlace.lastIndex = 0;
    for (const match of text.matchAll(workplaceInPlace)) {
      for (const [group, type] of [['workplace', 'WORKPLACE'], ['place', 'LOCATION']]) {
        const span = locateGroup(match, group);
        if (span) add(span.start, span.end, type);
      }
    }
  }
  if (review.findings.some(f => f.category === 'absence')) {
    collect(weekday, 'DATE');
    collect(explicitDate, 'DATE');
  }

  // Longer targets take priority. Reject partial overlaps; never produce a
  // replacement which might expose a fragment of a sensitive token.
  const ordered = targets.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const selected = [];
  const issues = [];
  for (const target of ordered) {
    const last = selected.at(-1);
    if (last && target.start < last.end) {
      if (target.end > last.end) issues.push('Two detected sensitive fields overlap; this preview needs manual inspection.');
      continue;
    }
    selected.push(target);
  }

  const counts = new Map();
  const seenValues = new Map(); // reuse placeholder for repeated, identical values
  const privateMappings = []; // browser memory only: NEVER serialize, render, log, or transmit
  const replacements = [];
  let maskedText = '';
  let offset = 0;
  for (const target of selected) {
    const original = text.slice(target.start, target.end);
    // Phone format changes must not create a second identity for the same number.
    // Other types use exact source text until type-specific normalization is tested.
    const digits = original.replace(/\D/g, '');
    const normalized = target.type === 'PHONE'
      ? (digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits)
      : original;
    const key = `${target.type}\u0000${normalized}`;
    let placeholder = seenValues.get(key);
    if (!placeholder) {
      const index = (counts.get(target.type) ?? 0) + 1;
      counts.set(target.type, index);
      placeholder = `[${target.type}_${index}]`;
      seenValues.set(key, placeholder);
      privateMappings.push({ placeholder, original });
    }
    maskedText += text.slice(offset, target.start) + placeholder;
    replacements.push({ placeholder, type: target.type });
    offset = target.end;
  }
  maskedText += text.slice(offset);

  if (!review.complete) issues.push('Local review is incomplete or covers an unsupported language or suspicious characters.');
  // Every detected location/contact/children/account field must have been
  // completely covered by a replacement, except generic combination findings.
  for (const finding of review.findings) {
    if (!['location','contact','children','account'].includes(finding.category)) continue;
    if (finding.start < 0 || finding.end <= finding.start) continue;
    // A finding may quote surrounding words (for example 'account number is').
    // The recognized sensitive *value* must be replaced in full; overlapping
    // coverage alone is not permission to send the preview.
    const covered = selected.some(t => t.start < finding.end && t.end > finding.start);
    if (!covered) issues.push(`Unable to mask detected ${finding.category} information.`);
  }
  // Check that the same supported sensitive patterns do not still appear in the
  // output. This is only a limited known-pattern validation, NOT a safety seal.
  const outputReview = reviewText(maskedText);
  for (const f of outputReview.findings) {
    if (['location', 'contact', 'children', 'account', 'absence', 'combination'].includes(f.category)) {
      issues.push('The masked preview still contains a potential privacy concern detected by the local checks.');
      break;
    }
  }
  // A preview is never consent or permission to transmit data. Even when
  // these limited validations pass, the AI endpoint stays disabled.
  return {
    maskedText,
    replacements,
    privateMappings,
    // "verified" applies ONLY to the supported pattern checks; provider
    // requests remain disabled until separate consent/security gates are built.
    validation: { passedKnownPatterns: issues.length === 0, issues: [...new Set(issues)] },
    sourceLength: text.length
  };
}
