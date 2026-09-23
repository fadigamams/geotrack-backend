-- Contacts du répertoire enregistrés côté utilisateur (juste une référence à un compte GeoTrack,
-- jamais une position — la position dépend uniquement d'un partage actif dans la table shares).
CREATE TABLE contacts (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,                 -- nom tel qu'enregistré dans le téléphone de l'utilisateur
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contact_user_id)
);
