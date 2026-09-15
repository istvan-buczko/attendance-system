/**
 * Jelenlét Nyilvántartó Rendszer - Backend Server
 * Port: 3000 (módosítható PORT env változóval)
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/employees',  require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/nfc-tags',   require('./routes/nfc'));
app.use('/api/locations',  require('./routes/locations'));

// SPA fallback – admin dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mobile.html')));

// Adatbázis inicializálás + szerver indítás
initializeDatabase();
app.listen(PORT, () => {
  console.log(`\n🏢 Jelenlét Nyilvántartó Rendszer`);
  console.log(`📡 Szerver fut: http://localhost:${PORT}`);
  console.log(`📱 Mobil terminál: http://localhost:${PORT}/mobile`);
  console.log(`🔑 Admin belépés: admin@company.hu / Admin1234!\n`);
});

module.exports = app;
