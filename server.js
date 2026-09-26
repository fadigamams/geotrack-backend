require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const { initSockets } = require('./src/sockets');
const authRoutes = require('./src/routes/auth');
const positionRoutes = require('./src/routes/positions');
const shareRoutes = require('./src/routes/shares');
const contactRoutes = require('./src/routes/contacts');
const groupRoutes = require('./src/routes/groups');
const companiesRoutes = require('./src/routes/companies');
const vehiclesRoutes = require('./src/routes/vehicles');
const adminRoutes = require('./src/routes/admin');

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
const corsOptions = { origin: allowedOrigins, credentials: true };

app.use(cors(corsOptions));
app.use(express.json({ limit: '200kb' }));

// Limite générale contre les abus — les positions et l'auth ont des routes sensibles
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 120 }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'geotrack-backend' }));

// Sert l'application GeoTrack World (frontend) depuis ce même serveur —
// évite tout blocage réseau lié à un domaine externe.
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/companies/:companyId/vehicles', vehiclesRoutes);
app.use('/api/admin', adminRoutes);

// Erreurs non gérées -> réponse JSON propre plutôt qu'un plantage silencieux
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const io = new Server(server, { cors: corsOptions });
app.set('io', io);
initSockets(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`GeoTrack backend en écoute sur le port ${PORT}`));
