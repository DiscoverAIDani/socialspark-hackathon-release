-- Deploy ONLY into a separately provisioned judge-only D1 database.
-- No request is permitted until a human explicitly sets enabled=1 with a
-- short, authorized window and nonzero cap; source-controlled defaults deny.
CREATE TABLE IF NOT EXISTS judge_gate (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  window_starts_utc INTEGER NOT NULL DEFAULT 0,
  window_ends_utc INTEGER NOT NULL DEFAULT 0,
  max_requests INTEGER NOT NULL DEFAULT 0 CHECK(max_requests BETWEEN 0 AND 100),
  used_requests INTEGER NOT NULL DEFAULT 0 CHECK(used_requests>=0),
  request_active INTEGER NOT NULL DEFAULT 0 CHECK(request_active IN (0,1)),
  CHECK(window_ends_utc>=window_starts_utc)
);
INSERT OR IGNORE INTO judge_gate
  (id,enabled,window_starts_utc,window_ends_utc,max_requests,used_requests,request_active)
VALUES (1,0,0,0,0,0,0);

-- Only SHA-256 of a 256-bit random bearer code is stored. Labels should
-- be random pseudonyms, never names/emails. No IP or post content persisted.
CREATE TABLE IF NOT EXISTS judge_invites (
  token_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(token_sha256)=64),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  expires_at_utc INTEGER NOT NULL,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 32)
);
CREATE INDEX IF NOT EXISTS idx_judge_invites_expiry
  ON judge_invites (expires_at_utc);

-- One-use approvals are bound to a specific invite, prompt and tone. Tokens
-- expire after 120 seconds; consumed tickets are never reusable. Purge expired
-- rows only through an owner-audited maintenance procedure.
CREATE TABLE IF NOT EXISTS judge_tickets (
  ticket_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(ticket_sha256)=64),
  invite_sha256 TEXT NOT NULL CHECK(length(invite_sha256)=64),
  prompt_id TEXT NOT NULL,
  tone TEXT NOT NULL,
  expires_at_utc INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_judge_tickets_expiry
  ON judge_tickets (expires_at_utc);
