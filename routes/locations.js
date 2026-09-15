const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authenticateToken } = require('./auth');

// GET /api/locations
router.get('/', authenticateToken, (req, res) => {
  const query = req.query.active !== undefined ? { active: req.query.active === 'true' } : {};
  db.locations.find(query, (err, docs) => {
    res.json(docs.sort((a, b) => a.name.localeCompare(b.name, 'hu')));
  });
});

// GET /api/locations/public – auth nélkül (mobil terminál számára)
router.get('/public', (req, res) => {
  db.locations.find({ active: true }, { _id: 1, code: 1, name: 1, city: 1 }, (err, docs) => {
    res.json(docs.sort((a, b) => a.name.localeCompare(b.name, 'hu')));
  });
});

// GET /api/locations/:id
router.get('/:id', authenticateToken, (req, res) => {
  db.locations.findOne({ _id: req.params.id }, (err, doc) => {
    if (!doc) return res.status(404).json({ error: 'Telephely nem található' });
    res.json(doc);
  });
});

// POST /api/locations
router.post('/', authenticateToken, (req, res) => {
  const { code, name, city, address, manager, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Telephely neve kötelező' });
  const loc = { code: code || '', name, city: city || '', address: address || '', manager: manager || '', phone: phone || '', email: email || '', active: true, createdAt: new Date().toISOString() };
  db.locations.insert(loc, (err, doc) => {
    if (err) return res.status(400).json({ error: 'Kód már foglalt' });
    res.json(doc);
  });
});

// PUT /api/locations/:id
router.put('/:id', authenticateToken, (req, res) => {
  const { code, name, city, address, manager, phone, email, active } = req.body;
  const update = {};
  if (code !== undefined) update.code = code;
  if (name !== undefined) update.name = name;
  if (city !== undefined) update.city = city;
  if (address !== undefined) update.address = address;
  if (manager !== undefined) update.manager = manager;
  if (phone !== undefined) update.phone = phone;
  if (email !== undefined) update.email = email;
  if (active !== undefined) update.active = active;
  update.updatedAt = new Date().toISOString();
  db.locations.update({ _id: req.params.id }, { $set: update }, {}, (err, n) => {
    if (n === 0) return res.status(404).json({ error: 'Telephely nem található' });
    db.locations.findOne({ _id: req.params.id }, (err, doc) => res.json(doc));
  });
});

// DELETE /api/locations/:id (soft delete)
router.delete('/:id', authenticateToken, (req, res) => {
  db.locations.update({ _id: req.params.id }, { $set: { active: false, updatedAt: new Date().toISOString() } }, {}, (err, n) => {
    res.json({ deactivated: n });
  });
});

// GET /api/locations/:id/stats – telephely statisztika
router.get('/:id/stats', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.attendance.find({ locationId: req.params.id, date: today }, (err, records) => {
    const present = new Set(records.filter(r => r.type === 'checkin').map(r => r.employeeId));
    const left = new Set(records.filter(r => r.type === 'checkout').map(r => r.employeeId));
    res.json({ today, presentCount: present.size, leftCount: left.size, eventCount: records.length });
  });
});

module.exports = router;
