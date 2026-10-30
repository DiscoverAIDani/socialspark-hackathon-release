/**
 * Shared D1/SQLite statement strings for the disabled-by-default judge gateway.
 * Exporting them allows real SQLite smoke tests without turning on inference.
 */
export const JUDGE_SQL = Object.freeze({
  createTicket:
    'INSERT OR IGNORE INTO judge_tickets(ticket_sha256,invite_sha256,prompt_id,tone,expires_at_utc,consumed) '+
    'SELECT ?,?,?,?,?,0 WHERE EXISTS ('+
    'SELECT 1 FROM judge_invites WHERE token_sha256=? AND enabled=1 AND expires_at_utc>=?) '+
    'AND (SELECT COUNT(*) FROM judge_tickets WHERE consumed=0 AND expires_at_utc>=?)<20',
  consumeTicket:
    'UPDATE judge_tickets SET consumed=1 WHERE ticket_sha256=? AND invite_sha256=? '+
    'AND prompt_id=? AND tone=? AND consumed=0 AND expires_at_utc>=?',
  validInvite:
    'SELECT token_sha256 FROM judge_invites '+
    'WHERE token_sha256=? AND enabled=1 AND expires_at_utc>=? LIMIT 1',
  reserve:
    'UPDATE judge_gate SET used_requests=used_requests+1, request_active=1 '+
    'WHERE id=1 AND enabled=1 AND request_active=0 '+
    'AND used_requests<max_requests AND window_starts_utc<=? '+
    'AND window_ends_utc>=? AND EXISTS ('+
    'SELECT 1 FROM judge_invites WHERE token_sha256=? AND enabled=1 AND expires_at_utc>=?) '+
    'AND EXISTS (SELECT 1 FROM judge_tickets WHERE ticket_sha256=? '+
    'AND invite_sha256=? AND prompt_id=? AND tone=? AND consumed=0 AND expires_at_utc>=?)',
  singleTestReserve:
    // Reserved for the owner's explicitly approved one-call live test only.
    // The WHERE clause makes an accidentally raised quota inert for this mode.
    'UPDATE judge_gate SET used_requests=used_requests+1, request_active=1 '+
    'WHERE id=1 AND enabled=1 AND request_active=0 '+
    'AND max_requests=1 AND used_requests=0 '+
    'AND window_starts_utc<=? AND window_ends_utc>=? '+
    'AND EXISTS (SELECT 1 FROM judge_invites WHERE token_sha256=? AND enabled=1 AND expires_at_utc>=?) '+
    'AND EXISTS (SELECT 1 FROM judge_tickets WHERE ticket_sha256=? '+
    'AND invite_sha256=? AND prompt_id=? AND tone=? AND consumed=0 AND expires_at_utc>=?)',
  release:
    'UPDATE judge_gate SET request_active=0 WHERE id=1 AND request_active=1'
});
