const jwt = require('jsonwebtoken');
const db = require('../db');

function initSockets(io) {
  // Authentification à la connexion : le client passe son token JWT dans le handshake.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentification requise'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Token invalide ou expiré'));
    }
  });

  io.on('connection', (socket) => {
    // Room personnelle : notifications (invitations, acceptations, arrêts de partage)
    socket.join(`user:${socket.userId}`);

    // Le client demande à suivre la position en temps réel d'un owner.
    // On revérifie l'autorisation ici — ne jamais faire confiance au seul appel REST précédent.
    socket.on('watch:position', async (ownerId) => {
      if (ownerId === socket.userId) {
        socket.join(`pos:${ownerId}`);
        return socket.emit('watch:ack', { ownerId, ok: true });
      }
      const r = await db.query(
        `SELECT 1 FROM shares WHERE owner_id=$1 AND viewer_id=$2 AND status='active'
           AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
        [ownerId, socket.userId]
      );
      if (r.rows.length) {
        socket.join(`pos:${ownerId}`);
        socket.emit('watch:ack', { ownerId, ok: true });
      } else {
        socket.emit('watch:ack', { ownerId, ok: false, error: 'Accès à la localisation refusé' });
      }
    });

    socket.on('unwatch:position', (ownerId) => {
      socket.leave(`pos:${ownerId}`);
    });
  });
}

module.exports = { initSockets };
