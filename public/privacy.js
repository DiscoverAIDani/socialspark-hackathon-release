/**
 * SocialSpark — conservative English-first local detector (development build).
 * No imports, fetches, storage, telemetry, or AI calls. Pattern matches are
 * potential concerns, not guaranteed exposures or complete privacy coverage.
 */
import { scanHiddenCharacters } from './text-integrity.js';
import { assessLanguageCoverage } from './language-coverage.js';

export const CATEGORIES = Object.freeze([
  { id: 'location', name: 'Precise locations and addresses' },
  { id: 'absence', name: 'Routines, travel and unattended-home disclosures' },
  { id: 'contact', name: 'Contact details and identity information' },
  { id: 'children', name: "Children's personal information" },
  { id: 'account', name: 'Account and sensitive identifying information' },
  { id: 'combination', name: 'Combined details that could reveal identity' }
]);

// A child’s age may appear BEFORE the relationship word ("my 8-year-old daughter")
// or after it ("my daughter is 8 years old"). Keep this deliberately
// conservative: ages 1–17 only, with an explicit family relationship.
const childRelationship = String.raw`(?:daughter|son|child|kid|granddaughter|grandson)`;
const childAgeBefore = String.raw`(?:[1-9]|1[0-7])[-\s]+(?:years?|yrs?)[-\s]+old`;
const childMention = String.raw`\b(?:my|our)\s+(?:(?:young|little)\s+)?(?:${childAgeBefore}\s+)?${childRelationship}\b`;

// Only flag long numeric strings near explicit financial-account labels.
// A named capture isolates the numeric part so punctuation/spaces don't count
// toward the minimum. Generic long numbers (orders, dates, etc.) are ignored.
const financialNumberPattern = /\b(?:(?:bank|checking|savings|credit|debit)\s+)?(?:account|acct\.?|routing|card)\s*(?:number|num(?:ber)?\.?|no\.?|#)?\s*(?:(?:is|equals|:|=|#)\s*){0,2}(?<number>\d[\d\s-]{4,32}\d)\b/giu;

const signs = [
  { id: 'location', title: 'Possible street address', pattern: /\b\d{1,6}\s+(?:(?:N|S|E|W)\.?\s+)?(?:[\p{L}][\p{L}'’.-]*\s+){1,5}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Parkway|Pkwy|Circle|Cir)\b\.?/giu, explanation: 'A street address may identify a home or another private location.', suggestion: 'Consider removing the street address or sharing it privately.' },
  { id: 'location', title: 'Possible precise coordinates', pattern: /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/gu, explanation: 'Coordinates may reveal a precise physical location.', suggestion: 'Avoid posting precise coordinates publicly.' },
  { id: 'absence', title: 'Possible unattended-home disclosure', pattern: /\b(?:our|my|the)\s+(?:house|home|apartment|place)\s+(?:will\s+be|is|stays?|was)\s+(?:completely\s+)?(?:empty|unattended|vacant)(?:\s+\w+){0,7}/giu, explanation: 'This may tell others when a home will be unattended.', suggestion: 'Remove details about an unattended home.' },
  { id: 'absence', title: 'Possible travel-time disclosure', pattern: /\b(?:(?:we(?:'re| are|'ll| will)?|I(?:'m| am|'ll| will)?)\s+(?:leaving|going away|going on vacation|on vacation|out of town|travelling|traveling|away)|(?:vacation|trip)\s+(?:starts|begins))\b[^.!?\n]{0,90}/giu, explanation: 'Public travel plans can reveal when someone may be away.', suggestion: 'Consider sharing vacation details after returning.' },
  { id: 'contact', title: 'Possible phone number', pattern: /(?<!\w)(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\w)/gu, explanation: 'A public phone number may invite unwanted contact.', suggestion: 'Ask people to contact you through a private message instead.' },
  { id: 'contact', title: 'Possible email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, explanation: 'An email address may attract unsolicited contact.', suggestion: 'Consider using a private message rather than publishing the address.' },
  { id: 'contact', title: 'Possible full-name disclosure', pattern: /\b(?:my\s+(?:full\s+)?name\s+is|I\s+am\s+named)\s+[\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){1,3}/giu, explanation: 'A complete name may identify someone when combined with other details.', suggestion: 'Consider whether the full name needs to be public.' },
  { id: 'children', title: 'Possible child-school disclosure', pattern: new RegExp(`${childMention}[^.!?\\n]{0,120}\\b(?:school|daycare|classroom|teacher|school\\s+bus|bus\\s+stop|kindergarten)\\b[^.!?\\n]{0,60}`, 'giu'), explanation: 'Details linking a child to a school or routine can make them easier to identify or locate.', suggestion: 'Remove identifying school and routine details about children.' },
  { id: 'children', title: 'Possible child-age disclosure', pattern: new RegExp(String.raw`\b(?:my|our)\s+(?:(?:young|little)\s+)?${childAgeBefore}\s+${childRelationship}\b`, 'giu'), explanation: 'A child’s age may add to identifying information.', suggestion: 'Consider removing the child’s exact age from public posts.' },
  { id: 'children', title: 'Possible child-age disclosure', pattern: new RegExp(`${childMention}[^.!?\\n]{0,35}\\b(?:is\\s+(?:[1-9]|1[0-7])\\s+years?\\s+old|turned\\s+(?:[1-9]|1[0-7])|age\\s+(?:[1-9]|1[0-7]))\\b`, 'giu'), explanation: 'A child’s age may add to identifying information.', suggestion: 'Consider removing the child’s exact age from public posts.' },
  { id: 'account', title: 'Possible Social Security number', pattern: /\b\d{3}-\d{2}-\d{4}\b/gu, explanation: 'This number resembles a highly sensitive identifier.', suggestion: 'Do not include government identifiers in public posts.' },
  { id: 'account', title: 'Possible account or routing number', pattern: financialNumberPattern, valid: match => { const count = (match.groups?.number.match(/\d/g) || []).length; return count >= 6 && count <= 19; }, explanation: 'Financial account details should not be public.', suggestion: 'Remove account details completely.' },
  { id: 'account', title: 'Possible secret or password', pattern: /\b(?:my\s+)?(?:password|passcode|pin|one[-\s]?time\s+code|verification\s+code)\s*(?:is|:|=)\s*[^\s.,;!?]{3,40}/giu, explanation: 'A password, PIN or access code should not be shared publicly.', suggestion: 'Remove the secret and change it if already disclosed.' }
];

// BYP-003: A single explicit name + workplace + named location can form an
// identifying combination even though all three clues are in the "contact"
// category or aren't individually matched by the local detectors. Require a
// first-person employment statement and proper-name-like workplace/location
// to avoid turning arbitrary city mentions and long order numbers into risks.
// This is a conservative heuristic, not a business or geography database.
const workplaceCityPattern = /\bI\s+(?:work|am\s+employed)\s+(?:at|for)\s+(?<workplace>[\p{Lu}][\p{L}\d'’&-]*(?:\s+(?:[\p{Lu}][\p{L}\d'’&-]*|&|and)){0,5})\s+in\s+(?<place>[\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\b/gu;

function combinedNameWorkplacePlaceFinding(text, findings) {
  const names = findings.filter(f => f.category === 'contact' && f.title === 'Possible full-name disclosure');
  if (!names.length) return null;
  for (const employer of matchesOf(workplaceCityPattern, text)) {
    const employerStart = employer.index;
    const employerEnd = employerStart + employer[0].length;
    for (const name of names) {
      const start = Math.min(name.start, employerStart);
      const end = Math.max(name.end, employerEnd);
      // Do not connect unrelated parts of a long post or separate paragraphs.
      if (end - start > 240 || text.slice(start, end).includes('\n')) continue;
      return {
        category: 'combination',
        title: 'Possible combined name, workplace and location disclosure',
        sourceQuote: text.slice(start, end), start, end,
        explanation: 'A full name connected to a workplace and city or other named location may make someone easier to identify or find.',
        suggestion: 'Consider removing the full name, workplace or location, or sharing those details privately.'
      };
    }
  }
  return null;
}


function matchesOf(pattern, text) {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)];
}

export function reviewText(input) {
  if (typeof input !== 'string') throw new TypeError('Text must be a string');
  const text = input;
  const findings = [];
  const seen = new Set();
  for (const rule of signs) {
    for (const match of matchesOf(rule.pattern, text)) {
      if (rule.valid && !rule.valid(match)) continue;
      const sourceQuote = match[0];
      const key = `${rule.id}:${rule.title}:${match.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ category: rule.id, title: rule.title, sourceQuote, start: match.index, end: match.index + sourceQuote.length, explanation: rule.explanation, suggestion: rule.suggestion });
    }
  }
  // Prefer the actionable, directly supported combination finding; don't
  // pile a second generic combination warning on top of the same evidence.
  const targetedCombination = combinedNameWorkplacePlaceFinding(text, findings);
  if (targetedCombination) findings.push(targetedCombination);
  const ids = new Set(findings.map(f => f.category));
  if (ids.size >= 2 && !targetedCombination) {
    findings.push({ category: 'combination', title: 'Several details may identify someone together', sourceQuote: '', start: -1, end: -1, explanation: 'Multiple different types of personal information appear together; their combination may increase risk.', suggestion: 'Consider removing some details even if each seems harmless on its own.' });
  }
  const hiddenCharacters = scanHiddenCharacters(text);
  const languageCoverage = assessLanguageCoverage(text);
  const languageLimited = languageCoverage.limited;
  const limitations = [];
  if (hiddenCharacters.length) limitations.push('Suspicious invisible or direction-control characters may affect detection; some are legitimate in certain languages or emoji.');
  if (languageLimited) limitations.push(`${languageCoverage.reason} Complete language-specific privacy checking is unavailable. Some risks may be missed.`);
  return {
    findings,
    hiddenCharacters,
    languageLimited,
    languageCoverage,
    limitations,
    checks: CATEGORIES.map(category => ({ ...category, completed: !languageLimited && hiddenCharacters.length === 0, concernCount: findings.filter(f => f.category === category.id).length })),
    complete: !languageLimited && hiddenCharacters.length === 0,
    concerns: findings.length > 0 || limitations.length > 0,
    status: languageLimited || hiddenCharacters.length ? 'limited' : findings.length ? 'concerns' : 'clear'
  };
}
