-- GeoTrack World — schéma initial
-- Règle fondamentale : une position n'est JAMAIS visible sans un partage actif et consenti (voir table shares).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un partage = une autorisation explicite d'un propriétaire (owner) vers un spectateur (viewer).
-- status: pending (invitation envoyée) -> active (acceptée) -> stopped/declined/expired
CREATE TABLE shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','declined','stopped','expired')),
  duration_minutes INT,              -- NULL = jusqu'à désactivation manuelle
  expires_at TIMESTAMPTZ,            -- NULL si duration_minutes est NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  CHECK (owner_id <> viewer_id)
);
CREATE INDEX idx_shares_owner ON shares(owner_id);
CREATE INDEX idx_shares_viewer ON shares(viewer_id);
CREATE INDEX idx_shares_active ON shares(owner_id, viewer_id) WHERE status = 'active';

-- Dernière position connue de chaque utilisateur (une ligne par utilisateur, mise à jour en continu)
CREATE TABLE current_positions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery INT,
  is_demo BOOLEAN NOT NULL DEFAULT false,   -- true si mode démonstration (jamais mélangé avec du GPS réel)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique brut des positions (pour reconstruire les trajets)
CREATE TABLE position_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_user_time ON position_history(user_id, recorded_at DESC);

-- Groupes (Famille, Entreprise, Livraison, Amis...)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Contacts favoris (référence à un share existant — jamais une position inventée)
CREATE TABLE favorites (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (owner_id, favorite_user_id)
);

-- Zones (géofencing)
CREATE TABLE geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_m INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal d'audit : chaque accès à une position doit être tracé (exigence sécurité)
CREATE TABLE access_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,              -- 'view_position', 'share_created', 'share_stopped', 'access_denied'...
  allowed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
