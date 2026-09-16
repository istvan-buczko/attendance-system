/**
 * Jelenlét nyilvántartó - Adatbázis inicializálás (NeDB)
 */
const Datastore = require('nedb');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, 'data');
const fs = require('fs');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

const db = {
  employees:  new Datastore({ filename: path.join(DB_DIR, 'employees.db'),  autoload: true }),
  attendance: new Datastore({ filename: path.join(DB_DIR, 'attendance.db'), autoload: true }),
  nfcTags:    new Datastore({ filename: path.join(DB_DIR, 'nfc_tags.db'),   autoload: true }),
  users:      new Datastore({ filename: path.join(DB_DIR, 'users.db'),      autoload: true }),
  locations:  new Datastore({ filename: path.join(DB_DIR, 'locations.db'),  autoload: true }),
  auditLog:   new Datastore({ filename: path.join(DB_DIR, 'audit_log.db'),  autoload: true }),
};

// Indexek
db.employees.ensureIndex({ fieldName: 'qrCode', unique: true, sparse: true });
db.attendance.ensureIndex({ fieldName: 'createdAt' });
db.nfcTags.ensureIndex({ fieldName: 'tagId', unique: true });
db.users.ensureIndex({ fieldName: 'email', unique: true });
db.locations.ensureIndex({ fieldName: 'code', unique: true, sparse: true });

// Seed: admin felhasználó
function seedAdmin() {
  db.users.findOne({ email: 'admin@company.hu' }, (err, doc) => {
    if (!doc) {
      bcrypt.hash('Admin1234!', 10, (err, hash) => {
        db.users.insert({
          email: 'admin@company.hu', passwordHash: hash,
          name: 'Rendszergazda', role: 'admin',
          createdAt: new Date().toISOString()
        });
        console.log('✅ Admin felhasználó létrehozva: admin@company.hu / Admin1234!');
      });
    }
  });
}

// Seed: demo telephelyek
function seedLocations(cb) {
  db.locations.count({}, (err, count) => {
    if (count === 0) {
      const locations = [
        { code: 'BP-01',  name: 'Budapest – Központ',    city: 'Budapest',  address: 'Kossuth tér 1.',   active: true },
        { code: 'BP-02',  name: 'Budapest – Raktár',     city: 'Budapest',  address: 'Soroksári út 45.',  active: true },
        { code: 'DEB-01', name: 'Debrecen – Iroda',      city: 'Debrecen',  address: 'Piac u. 12.',       active: true },
        { code: 'GYR-01', name: 'Győr – Telephely',      city: 'Győr',      address: 'Árpád u. 8.',       active: true },
        { code: 'PCS-01', name: 'Pécs – Telephely',      city: 'Pécs',      address: 'Király u. 22.',     active: true },
      ];
      let inserted = [];
      let done = 0;
      locations.forEach(loc => {
        loc.createdAt = new Date().toISOString();
        db.locations.insert(loc, (err, doc) => {
          inserted.push(doc);
          if (++done === locations.length) {
            console.log('✅ Demo telephelyek létrehozva (5 db)');
            if (cb) cb(inserted);
          }
        });
      });
    } else {
      if (cb) db.locations.find({}, cb.bind(null, null));
    }
  });
}

// Seed: demo NFC tagek (telephelyhez rendelve)
function seedNfcTags(locations) {
  db.nfcTags.findOne({}, (err, doc) => {
    if (!doc && locations && locations.length > 0) {
      const loc = locations[0]; // Első telephely
      db.nfcTags.insert([
        { tagId: 'NFC-ENTRY-001', locationName: loc.name + ' – Főbejárat', locationId: loc._id, locationCode: loc.code, type: 'entry', createdAt: new Date().toISOString() },
        { tagId: 'NFC-EXIT-001',  locationName: loc.name + ' – Főkijárat', locationId: loc._id, locationCode: loc.code, type: 'exit',  createdAt: new Date().toISOString() },
      ]);
      console.log('✅ Demo NFC tagek létrehozva');
    }
  });
}

// Seed: demo dolgozók
function seedEmployees(locations) {
  db.employees.count({}, (err, count) => {
    if (count === 0) {
      const locs = locations || [];
      const employees = [
        { name: 'Nagy Péter',    department: 'IT',          position: 'Fejlesztő',  qrCode: 'EMP-001', pin: '1234', locationId: locs[0]?._id, locationName: locs[0]?.name, mobile: false },
        { name: 'Kovács Anna',   department: 'HR',          position: 'HR Manager', qrCode: 'EMP-002', pin: '2345', locationId: locs[0]?._id, locationName: locs[0]?.name, mobile: false },
        { name: 'Szabó János',   department: 'Pénzügy',     position: 'Könyvelő',   qrCode: 'EMP-003', pin: '3456', locationId: locs[1]?._id, locationName: locs[1]?.name, mobile: false },
        { name: 'Horváth Éva',   department: 'IT',          position: 'Tesztelő',   qrCode: 'EMP-004', pin: '4567', locationId: locs[2]?._id, locationName: locs[2]?.name, mobile: false },
        { name: 'Tóth Miklós',   department: 'Értékesítés', position: 'Sales Mgr',  qrCode: 'EMP-005', pin: '5678', locationId: null, locationName: null, mobile: true },
      ];
      employees.forEach(emp => {
        emp.pinHash = bcrypt.hashSync(emp.pin, 10);
        delete emp.pin;
        emp.active = true;
        emp.createdAt = new Date().toISOString();
        db.employees.insert(emp);
      });
      console.log('✅ Demo dolgozók létrehozva (5 fő)');
    }
  });
}

function initializeDatabase() {
  seedAdmin();
  // Demo adatok seedelése ki van kapcsolva (éles rendszer)
  // seedLocations((err, locations) => {
  //   const locs = Array.isArray(err) ? err : (locations || []);
  //   seedNfcTags(locs);
  //   seedEmployees(locs);
  // });
}

module.exports = { db, initializeDatabase };