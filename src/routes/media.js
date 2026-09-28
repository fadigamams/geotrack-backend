const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
    const type = (req.body.type || 'message').replace(/[^a-z]/g, '') || 'message';
    const resourceType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    const b64 = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    const result = await cloudinary.uploader.upload(b64, {
      folder: 'yam/' + type,
      resource_type: resourceType
    });
    res.json({ url: result.secure_url, publicId: result.public_id, resourceType });
  } catch (err) {
    res.status(500).json({ error: 'Erreur upload: ' + err.message });
  }
});

module.exports = router;
