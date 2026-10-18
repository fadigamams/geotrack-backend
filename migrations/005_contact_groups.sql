CREATE TABLE IF NOT EXISTS contact_groups (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_key TEXT NOT NULL,
  grp TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contact_key)
);
