const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance-secret-key-2024';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email és jelszó kötelező' });

  db.users.findOne({ email }, (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Hibás email vagy jelszó' });
    bcrypt.compare(password, user.passwordHash, (err, match) => {
      if (!match) return res.status(401).json({ error: 'Hibás email vagy jelszó' });
      const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
      res.json({ token, user: { id: user._id, email: user.email, role: user.role, name: user.name } });
    });
  });
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  db.users.findOne({ _id: req.user.id }, (err, user) => {
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található' });
    bcrypt.compare(currentPassword, user.passwordHash, (err, match) => {
      if (!match) return res.status(401).json({ error: 'Hibás jelenlegi jelszó' });
      bcrypt.hash(newPassword, 10, (err, hash) => {
        db.users.update({ _id: user._id }, { $set: { passwordHash: hash } }, {}, () => {
          res.json({ message: 'Jelszó sikeresen megváltoztatva' });
        });
      });
    });
  });
});

// GET /api/auth/users (csak admin)
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  db.users.find({}, { passwordHash: 0 }, (err, users) => {
    res.json(users);
  });
});

// POST /api/auth/users (csak admin)
router.post('/users', authenticateToken, requireAdmin, (req, res) => {
  const { email, password, name, role } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    db.users.insert({ email, passwordHash: hash, name, role: role || 'manager', createdAt: new Date().toISOString() }, (err, doc) => {
      if (err) return res.status(400).json({ error: 'Email már foglalt' });
      const { passwordHash, ...safe } = doc;
      res.json(safe);
    });
  });
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  db.users.remove({ _id: req.params.id }, {}, (err, n) => {
    res.json({ deleted: n });
  });
});

function authenticateToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Nincs jogosultság' });
  const token = auth.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ error: 'Érvénytelen token' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin jogosultság szükséges' });
  next();
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireAdmin = requireAdmin;
