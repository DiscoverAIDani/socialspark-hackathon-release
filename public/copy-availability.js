/** Explain exact-draft copy eligibility without weakening the acknowledgment gate.
 * No text, identifiers, or review evidence is returned in status strings.
 */
export function getCopyAvailability({ text, review, reviewRevision, currentRevision, acknowledged = false }) {
  if (typeof text !== 'string' || !text.length) {
    return Object.freeze({ enabled: false, code: 'empty', explanation: 'Enter a draft before copying.' });
  }
  if (!review || reviewRevision !== currentRevision) {
    return Object.freeze({ enabled: false, code: 'unchecked', explanation: 'Copy is unavailable until local checks finish for this exact draft.' });
  }
  // An incomplete local review is also a reason for explicit acknowledgment.
  const needsAcknowledgment = review.complete !== true || review.concerns === true;
  if (needsAcknowledgment && !acknowledged) {
    return Object.freeze({ enabled: false, code: 'acknowledgment-required',
      explanation: 'Copy is paused: review the warnings in Section 02 and check the acknowledgment there if you choose to copy this version.' });
  }
  if (needsAcknowledgment) {
    return Object.freeze({ enabled: true, code: 'acknowledged',
      explanation: 'Copy available with your acknowledgment. It copies your exact draft, including any unresolved privacy concerns.' });
  }
  return Object.freeze({ enabled: true, code: 'ready',
    explanation: 'Copy available. No concerns were flagged by these limited local checks; this is not a privacy guarantee.' });
}
