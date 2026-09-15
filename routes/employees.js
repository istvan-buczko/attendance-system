const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../database');
const { authenticateToken } = require('./auth');

// GET /api/employees
router.get('/', authenticateToken, (req, res) => {
  const query = req.query.active !== undefined ? { active: req.query.active === 'true' } : {};
  db.employees.find(query, { pinHash: 0 }, (err, docs) => {
    res.json(docs.sort((a, b) => a.name.localeCompare(b.name, 'hu')));
  });
});

// GET /api/employees/:id
router.get('/:id', authenticateToken, (req, res) => {
  db.employees.findOne({ _id: req.params.id }, { pinHash: 0 }, (err, doc) => {
    if (!doc) return res.status(404).json({ error: 'Dolgozó nem található' });
    res.json(doc);
  });
});

// POST /api/employees
router.post('/', authenticateToken, (req, res) => {
  const { name, department, position, pin, email, phone, locationId, locationName, mobile } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Név és PIN kötelező' });
  if (String(pin).length < 4) return res.status(400).json({ error: 'A PIN legalább 4 számjegyű' });

  const qrCode = 'EMP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  bcrypt.hash(String(pin), 10, (err, pinHash) => {
    const employee = {
      name, department: department || '', position: position || '',
      email: email || '', phone: phone || '',
      locationId: locationId || null, locationName: locationName || null,
      mobile: mobile === true || mobile === 'true',
      qrCode, pinHash, active: true,
      createdAt: new Date().toISOString()
    };
    db.employees.insert(employee, (err, doc) => {
      if (err) return res.status(400).json({ error: 'Hiba a dolgozó létrehozásakor' });
      const { pinHash: _, ...safe } = doc;
      res.json(safe);
    });
  });
});

// PUT /api/employees/:id
router.put('/:id', authenticateToken, (req, res) => {
  const { name, department, position, email, phone, active, pin, locationId, locationName, mobile } = req.body;
  const update = {};
  if (locationId !== undefined) update.locationId = locationId;
  if (locationName !== undefined) update.locationName = locationName;
  if (mobile !== undefined) update.mobile = mobile === true || mobile === 'true';
  if (name !== undefined) update.name = name;
  if (department !== undefined) update.department = department;
  if (position !== undefined) update.position = position;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (active !== undefined) update.active = active;
  update.updatedAt = new Date().toISOString();

  const doUpdate = (extra = {}) => {
    db.employees.update({ _id: req.params.id }, { $set: { ...update, ...extra } }, {}, (err, n) => {
      if (n === 0) return res.status(404).json({ error: 'Dolgozó nem található' });
      db.employees.findOne({ _id: req.params.id }, { pinHash: 0 }, (err, doc) => res.json(doc));
    });
  };

  if (pin) {
    bcrypt.hash(pin, 10, (err, pinHash) => doUpdate({ pinHash }));
  } else {
    doUpdate();
  }
});

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', authenticateToken, (req, res) => {
  db.employees.update({ _id: req.params.id }, { $set: { active: false, updatedAt: new Date().toISOString() } }, {}, (err, n) => {
    res.json({ deactivated: n });
  });
});

// GET /api/employees/:id/qr  – QR kód adatok
router.get('/:id/qr', authenticateToken, (req, res) => {
  db.employees.findOne({ _id: req.params.id }, (err, doc) => {
    if (!doc) return res.status(404).json({ error: 'Dolgozó nem található' });
    res.json({ qrCode: doc.qrCode, name: doc.name });
  });
});

// POST /api/employees/reset-pin/:id
router.post('/reset-pin/:id', authenticateToken, (req, res) => {
  const { newPin } = req.body;
  if (!newPin || newPin.length < 4) return res.status(400).json({ error: 'Érvénytelen PIN' });
  bcrypt.hash(newPin, 10, (err, pinHash) => {
    db.employees.update({ _id: req.params.id }, { $set: { pinHash } }, {}, (err, n) => {
      res.json({ updated: n });
    });
  });
});

module.exports = router;
