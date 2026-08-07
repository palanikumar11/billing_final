-- RetailPro D1 schema — per-record storage for multi-device, no-data-loss sync.
--
-- Every record of every collection lives in one row, keyed by (collection, id).
-- Merge rule: an incoming write wins only if its updated_at >= the stored one
-- (newest-wins). Deletes are tombstones (deleted=1) so a delete on one device
-- propagates to the others instead of the record silently reappearing.
-- `rev` is a server-assigned monotonic revision used as the pull cursor: a device
-- asks for everything with rev greater than the last rev it has seen.

CREATE TABLE IF NOT EXISTS records (
  collection TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  data       TEXT,                        -- JSON of the record; empty when deleted
  updated_at INTEGER NOT NULL DEFAULT 0,  -- client nowTS() in ms (merge key)
  deleted    INTEGER NOT NULL DEFAULT 0,
  rev        INTEGER NOT NULL DEFAULT 0,  -- server monotonic revision (pull cursor)
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS idx_records_rev ON records(rev);
CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
