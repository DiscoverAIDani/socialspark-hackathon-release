/** Local-only explanation of the fixed fictional demo gate. No user text leaves the tab. */
import { FICTIONAL_POST, MULTI_FINDING_POST } from './suggestion-workflow.js';

export function getDemoAvailability({ original, review, reviewRevision, currentRevision }) {
  if (typeof original !== 'string' || !original) {
    return Object.freeze({ enabled: false, code: 'empty',
      explanation: 'Enter one of the exact fictional examples above to enable this offline demonstration.' });
  }
  if (original !== FICTIONAL_POST && original !== MULTI_FINDING_POST) {
    return Object.freeze({ enabled: false, code: 'sample-mismatch',
      explanation: 'The offline demonstration accepts only the exact fictional examples above. Check spaces, punctuation and extra characters. Your draft has not been changed.' });
  }
  if (!review || reviewRevision !== currentRevision || !review.complete) {
    return Object.freeze({ enabled: false, code: 'checks-incomplete',
      explanation: 'Local privacy checks have not completed for this exact draft. No fictional suggestion can be loaded.' });
  }
  const findingCount = original === MULTI_FINDING_POST ? 2 : 1;
  return Object.freeze({ enabled: true, code: 'ready',
    explanation: `Ready: this exact fictional example shows ${findingCount} finding${findingCount === 1 ? '' : 's'}. Loading it does not send data or replace your draft.` });
}
