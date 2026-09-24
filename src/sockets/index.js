const jwt = require('jsonwebtoken');
const db = require('../db');

const onlineUsers = new Set();

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
    // Room personnelle : notifications (invitations, acceptations, arrêts de partage, messages)
    socket.join(`user:${socket.userId}`);
    onlineUsers.add(socket.userId);
    io.emit('presence:update', { userId: socket.userId, online: true });

    socket.on('disconnect', () => {
      // Ne marque hors-ligne que si plus aucun autre onglet/appareil de ce user n'est connecté
      const stillConnected = [...io.sockets.sockets.values()].some(s => s.userId === socket.userId);
      if (!stillConnected) { onlineUsers.delete(socket.userId); io.emit('presence:update', { userId: socket.userId, online: false }); }
    });

    socket.on('presence:list', (userIds=[]) => {
      socket.emit('presence:list', userIds.map(id => ({ userId: id, online: onlineUsers.has(id) })));
    });

    // Rejoindre une conversation — on revérifie l'appartenance côté serveur
    socket.on('join:conversation', async (conversationId) => {
      const r = await db.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [conversationId, socket.userId]);
      if (r.rows.length) socket.join(`conv:${conversationId}`);
    });
    socket.on('leave:conversation', (conversationId) => socket.leave(`conv:${conversationId}`));

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
