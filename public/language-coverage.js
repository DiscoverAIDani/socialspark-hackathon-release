/** English-first heuristic, not reliable language identification.
 * The purpose is to disclose limited coverage, not to translate or classify people.
 */
const scriptsNotSupported = /[\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Hebrew}\p{Script=Greek}\p{Script=Thai}\p{Script=Armenian}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Telugu}]/u;
const spanishStrong = /\b(?:nos\s+vamos|nuestra\s+casa|nuestro\s+hogar|estaremos|vacaciones|el\s+viernes|toda\s+la\s+semana|mi\s+casa|estará\s+vacía|direcci[oó]n|tel[eé]fono|mi\s+n[uú]mero|me\s+voy|salimos\s+ma[ñn]ana)\b/iu;
const spanishWords = /\b(?:nuestra|nuestro|estaremos|vamos|vacaciones|viernes|semana|direcci[oó]n|tel[eé]fono|ma[ñn]ana|salimos|estar[aá]|vac[ií]a|vuelve|nosotros)\b/giu;
const otherLatinExpressions = /\b(?:je\s+suis|nous\s+partons|ma\s+maison|ich\s+bin|wir\s+fahren|mein\s+haus|minha\s+casa|n[oó]s\s+vamos|andiamo\s+via)\b/iu;

export function assessLanguageCoverage(text) {
  if (typeof text !== 'string') throw new TypeError('Post must be text');
  if (scriptsNotSupported.test(text)) return {
    limited: true,
    reason: 'Some writing systems in this post are outside the English-first privacy checks.'
  };
  if (spanishStrong.test(text) || [...text.matchAll(spanishWords)].length >= 2 || otherLatinExpressions.test(text)) return {
    limited: true,
    reason: 'Some words or phrases suggest that the post may use a language not fully supported by the English-first checks.'
  };
  // This does NOT prove that text is English; short/mixed-language posts can escape detection.
  return { limited: false, reason: '' };
}
