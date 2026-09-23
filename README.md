# GeoTrack World — Backend

API réelle (Node/Express + PostgreSQL + Socket.IO) pour le partage de position avec consentement.
Ce backend implémente le socle du cahier des charges : comptes, partages (invitation → acceptation →
arrêt immédiat), position en temps réel, historique, répertoire, et la règle de sécurité centrale :

> Utilisateur A ne peut voir la position de B que si un partage `status='active'` (non expiré) existe.
> Sinon : `403 — Accès à la localisation refusé`, et chaque tentative est journalisée dans `access_audit`.

## Ce qui est déjà fonctionnel
- Inscription / connexion (JWT, mots de passe hashés avec bcrypt)
- Publication de position (`POST /api/positions`) + diffusion temps réel via Socket.IO
- Invitation de partage, acceptation, refus, **arrêt immédiat** (`/api/shares/...`)
- Lecture de la position d'un tiers avec vérification d'autorisation stricte (403 sinon)
- Historique de trajet (par utilisateur autorisé)
- Répertoire : correspondance de numéros de téléphone avec des comptes GeoTrack (aucune position
  renvoyée tant qu'aucun partage actif n'existe), contacts enregistrés, favoris

## Pas encore fait (prochaines étapes)
- Zones/géofencing (déclenchement d'alertes — la table `geofences` existe, pas encore la logique serveur)
- SOS, véhicules/flotte, mode livraison, notifications push, abonnements payants, endpoints admin
- Vérification email/téléphone, réinitialisation de mot de passe
- Frontend réel branché sur cette API (le prototype `geotrack-world.html` fonctionne encore en démo locale)

## Installation locale (Termux ou autre)

```bash
npm install
cp .env.example .env
# renseigne DATABASE_URL (une base PostgreSQL locale ou distante) et JWT_SECRET dans .env
npm run migrate   # crée les tables (une seule fois)
npm run dev        # démarre le serveur avec rechargement automatique
```

Le serveur écoute sur `http://localhost:3000`. Test rapide :
```bash
curl http://localhost:3000/health
```

## Déploiement sur Render

1. Pousse ce dossier sur GitHub (dans ton repo, ou un repo dédié `geotrack-backend`).
2. Sur Render : **New → PostgreSQL** → crée une base, note son `Internal Database URL`.
3. **New → Web Service** → connecte le repo GitHub.
   - Build command : `npm install`
   - Start command : `npm start`
   - Variables d'environnement : colle `DATABASE_URL` (celle de l'étape 2), `JWT_SECRET` (valeur aléatoire longue), `CORS_ORIGIN` (l'URL de ton frontend), `NODE_ENV=production`.
4. Une fois déployé, exécute la migration une fois via le **Shell** Render du service :
   ```bash
   npm run migrate
   ```
5. Vérifie `https://<ton-service>.onrender.com/health`.

## Référence API (v1)

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | non | `{name,email,phone?,password}` |
| POST | `/api/auth/login` | non | `{email,password}` → `{token,user}` |
| GET | `/api/auth/me` | oui | Profil de l'utilisateur connecté |
| POST | `/api/positions` | oui | Publie ma position `{lat,lng,accuracy,speed?,heading?,battery?,isDemo?}` |
| GET | `/api/positions/:userId` | oui | Position actuelle d'un tiers (403 si non autorisé) |
| GET | `/api/positions/:userId/history?since=ISO` | oui | Trajet (même règle d'autorisation) |
| POST | `/api/shares` | oui | Invite `{identifier,durationMinutes}` (0 = jusqu'à désactivation) |
| POST | `/api/shares/:id/accept` | oui | Le destinataire accepte |
| POST | `/api/shares/:id/decline` | oui | Le destinataire refuse |
| POST | `/api/shares/:id/stop` | oui | Arrêt immédiat (propriétaire ou spectateur) |
| GET | `/api/shares/mine` | oui | Partages que j'ai créés |
| GET | `/api/shares/shared-with-me` | oui | Partages dont je suis spectateur |
| POST | `/api/contacts/match` | oui | `{phones:[...]}` → qui a un compte GeoTrack |
| POST | `/api/contacts` | oui | Enregistrer un contact `{userId,label?}` |
| GET | `/api/contacts` | oui | Mon répertoire avec statut de partage |
| DELETE | `/api/contacts/:userId` | oui | Retirer un contact |

Toutes les routes protégées attendent `Authorization: Bearer <token>`.

## Temps réel (Socket.IO)

Connexion : `io(URL, { auth: { token } })`.

- `watch:position` (émis par le client, payload = `ownerId`) → le serveur revérifie l'autorisation
  et répond `watch:ack {ownerId, ok, error?}`.
- `position:update` (reçu) → `{userId,lat,lng,accuracy,speed,heading,battery,isDemo,updatedAt}`
- `share:invite`, `share:accepted`, `share:declined`, `share:stopped` (reçus sur ma room personnelle)

## Brancher le frontend prototype

Le fichier `geotrack-world.html` livré précédemment simule tout en local (aucun appel réseau).
Pour le relier à cette API : ajouter le SDK Socket.IO client (`cdnjs`), stocker le token JWT après
login, remplacer les boutons Partager/Arrêter par des appels à `/api/shares` puis
`navigator.geolocation.watchPosition` → `POST /api/positions`, et écouter `position:update` côté
spectateur pour déplacer le marqueur Leaflet. Dis-moi quand tu veux que je fasse cette intégration.
