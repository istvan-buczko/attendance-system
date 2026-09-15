const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authenticateToken } = require('./auth');

// GET /api/nfc-tags
router.get('/', authenticateToken, (req, res) => {
  db.nfcTags.find({}, (err, tags) => res.json(tags));
});

// POST /api/nfc-tags
router.post('/', authenticateToken, (req, res) => {
  const { tagId, locationName, type } = req.body;
  if (!tagId || !locationName || !type) return res.status(400).json({ error: 'Minden mező kötelező' });
  const tag = { tagId, locationName, type, createdAt: new Date().toISOString() };
  db.nfcTags.insert(tag, (err, doc) => {
    if (err) return res.status(400).json({ error: 'Tag ID már létezik' });
    res.json(doc);
  });
});

// DELETE /api/nfc-tags/:id
router.delete('/:id', authenticateToken, (req, res) => {
  db.nfcTags.remove({ _id: req.params.id }, {}, (err, n) => res.json({ deleted: n }));
});

module.exports = router;
