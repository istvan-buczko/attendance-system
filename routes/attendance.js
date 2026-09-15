/**
 * Jelenlét Nyilvántartó – Attendance API
 *
 * MANIPULÁCIÓ VÉDELEM:
 * - Minden bejegyzés SHA-256 hash-t kap (az előző rekord hash-ét is tartalmazza)
 * - Fizikai törlés TILTOTT – csak érvénytelenítés lehetséges kötelező indoklással
 * - Érvénytelenítés is rögzítésre kerül az audit logban
 * - Kézi bejegyzések kötelező indoklással, admin jogosultsággal vihetők be
 * - A lánc bármikor ellenőrizhető a /verify endpoint-on
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { authenticateToken } = require('./auth');
const { computeRecordHash, verifyChain, getChainState } = require('../integrity');

// ─── TERMINÁL: QR + PIN + NFC azonosítás ──────────────────────────────────────
router.post('/identify', (req, res) => {
  const { qrCode, pin, nfcTagId, locationId, locationName } = req.body;
  if (!qrCode || !pin) return res.status(400).json({ error: 'QR kód és PIN kötelező' });

  db.employees.findOne({ qrCode: qrCode.toUpperCase(), active: true }, (err, employee) => {
    if (!employee) return res.status(404).json({ error: 'Dolgozó nem található' });

    bcrypt.compare(String(pin), employee.pinHash, (err, match) => {
      if (!match) return res.status(401).json({ error: 'Hibás PIN kód' });

      const processAttendance = (tagType, tag) => {
        const today = new Date().toISOString().split('T')[0];

        db.attendance.find({ employeeId: employee._id, date: today, voided: { $ne: true } }, (err, todayEvents) => {
          let eventType;
          if (tagType === 'entry')      eventType = 'checkin';
          else if (tagType === 'exit')  eventType = 'checkout';
          else {
            const sorted = todayEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const last = sorted[0];
            eventType = (!last || last.type === 'checkout') ? 'checkin' : 'checkout';
          }
          insertEvent(eventType, tag);
        });

        function insertEvent(eventType, tag) {
          const now = new Date();
          const recLocationId   = tag?.locationId   || locationId   || employee.locationId   || null;
          const recLocationName = tag?.locationName || locationName || employee.locationName || null;
          const recLocationCode = tag?.locationCode || null;

          getChainState(db, (err, { nextIndex, prevHash }) => {
            const baseRecord = {
              employeeId:    employee._id,
              employeeName:  employee.name,
              department:    employee.department || '',
              type:          eventType,
              timestamp:     now.toISOString(),
              date:          now.toISOString().split('T')[0],
              time:          now.toTimeString().split(' ')[0].substring(0, 5),
              nfcTagId:      nfcTagId || null,
              locationId:    recLocationId,
              locationName:  recLocationName,
              locationCode:  recLocationCode,
              chainIndex:    nextIndex,
              voided:        false,
              manual:        false,
              createdAt:     now.toISOString(),
            };

            // Hash kiszámítása az immutábilis mezőkből
            const hash = computeRecordHash(baseRecord, prevHash);
            baseRecord.hash    = hash;
            baseRecord.prevHash = prevHash;

            db.attendance.insert(baseRecord, (err, doc) => {
              if (err) return res.status(500).json({ error: 'Adatbázis hiba' });
              res.json({
                success:    true,
                eventType,
                employee:   { name: employee.name, department: employee.department, qrCode: employee.qrCode },
                location:   recLocationName,
                timestamp:  now.toISOString(),
                chainIndex: nextIndex,
                hash:       hash.substring(0, 16) + '…', // csak az első 16 karakter a UI-ban
                message:    eventType === 'checkin'
                  ? '✅ Sikeres érkezés rögzítve'
                  : '✅ Sikeres távozás rögzítve'
              });
            });
          });
        }
      };

      if (nfcTagId) {
        db.nfcTags.findOne({ tagId: nfcTagId }, (err, tag) => processAttendance(tag?.type || null, tag));
      } else {
        processAttendance(null, null);
      }
    });
  });
});

// ─── NFC tag előkészítés ───────────────────────────────────────────────────────
router.post('/nfc-scan', (req, res) => {
  const { tagId } = req.body;
  db.nfcTags.findOne({ tagId }, (err, tag) => {
    if (!tag) return res.status(404).json({ error: 'Ismeretlen NFC tag' });
    res.json({ tag, message: tag.type === 'entry' ? 'Érkezés terminál' : 'Távozás terminál' });
  });
});

// ─── Napló listázás ────────────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const { employeeId, date, dateFrom, dateTo, type, department, locationId, includeVoided } = req.query;
  const query = {};
  if (employeeId) query.employeeId = employeeId;
  if (date)       query.date = date;
  if (type)       query.type = type;
  if (department) query.department = department;
  if (locationId) query.locationId = locationId;
  if (dateFrom || dateTo) { query.date = {}; if (dateFrom) query.date.$gte = dateFrom; if (dateTo) query.date.$lte = dateTo; }
  if (includeVoided !== 'true') query.voided = { $ne: true };

  db.attendance.find(query, (err, docs) => {
    res.json(docs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
  });
});

// ─── Mai jelenlét ──────────────────────────────────────────────────────────────
router.get('/today', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const { locationId } = req.query;
  const empQuery = { active: true };
  if (locationId) empQuery.locationId = locationId;

  db.attendance.find({ date: today, voided: { $ne: true }, ...(locationId ? { locationId } : {}) }, (err, records) => {
    db.employees.find(empQuery, { pinHash: 0 }, (err, employees) => {
      const summary = employees.map(emp => {
        const empRecords = records.filter(r => r.employeeId === emp._id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const checkin = empRecords.find(r => r.type === 'checkin');
        const lastRecord = empRecords[empRecords.length - 1];
        return {
          employee: { id: emp._id, name: emp.name, department: emp.department, locationName: emp.locationName, mobile: emp.mobile },
          status: !checkin ? 'absent' : (lastRecord.type === 'checkin' ? 'present' : 'left'),
          checkinTime: checkin ? checkin.time : null,
          lastEventTime: lastRecord ? lastRecord.time : null,
          checkinLocation: checkin ? checkin.locationName : null,
          events: empRecords
        };
      });
      res.json(summary);
    });
  });
});

// ─── Összes telephely áttekintő ────────────────────────────────────────────────
router.get('/overview', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.locations.find({ active: true }, (err, locations) => {
    db.attendance.find({ date: today, voided: { $ne: true } }, (err, records) => {
      db.employees.find({ active: true }, { pinHash: 0 }, (err, employees) => {
        const overview = locations.map(loc => {
          const locEmps = employees.filter(e => e.locationId === loc._id);
          const locRecords = records.filter(r => r.locationId === loc._id);
          const presentIds = new Set(locRecords.filter(r => r.type === 'checkin').map(r => r.employeeId));
          const leftIds    = new Set(locRecords.filter(r => r.type === 'checkout').map(r => r.employeeId));
          return {
            location: { id: loc._id, code: loc.code, name: loc.name, city: loc.city },
            totalEmployees: locEmps.length, present: presentIds.size, left: leftIds.size,
            absent: Math.max(0, locEmps.length - presentIds.size),
          };
        });
        res.json(overview);
      });
    });
  });
});

// ─── Kimutatás ─────────────────────────────────────────────────────────────────
router.get('/report', authenticateToken, (req, res) => {
  const { dateFrom, dateTo, locationId } = req.query;
  if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom és dateTo kötelező' });

  const attQuery = { date: { $gte: dateFrom, $lte: dateTo }, voided: { $ne: true } };
  if (locationId) attQuery.locationId = locationId;

  db.attendance.find(attQuery, (err, records) => {
    const empQuery = { active: true };
    if (locationId) empQuery.locationId = locationId;
    db.employees.find(empQuery, { pinHash: 0 }, (err, employees) => {
      const workDays = getWorkDays(dateFrom, dateTo);
      const report = employees.map(emp => {
        const empRecords = records.filter(r => r.employeeId === emp._id);
        const byDay = {};
        empRecords.forEach(r => { if (!byDay[r.date]) byDay[r.date] = []; byDay[r.date].push(r); });
        let totalMinutes = 0;
        const days = Object.entries(byDay).map(([date, dayRecs]) => {
          const sorted = dayRecs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          const checkin  = sorted.find(r => r.type === 'checkin');
          const checkout = sorted.filter(r => r.type === 'checkout').pop();
          let minutes = 0;
          if (checkin && checkout) minutes = Math.round((new Date(checkout.timestamp) - new Date(checkin.timestamp)) / 60000);
          totalMinutes += minutes;
          return { date, checkin: checkin?.time, checkout: checkout?.time, minutes, locationName: checkin?.locationName };
        });
        return {
          employee: { id: emp._id, name: emp.name, department: emp.department, locationName: emp.locationName, mobile: emp.mobile },
          daysPresent: days.length, daysAbsent: workDays - days.length, totalMinutes,
          totalHours: Math.round(totalMinutes / 60 * 10) / 10, days
        };
      });
      res.json({ dateFrom, dateTo, workDays, locationId: locationId || null, report });
    });
  });
});

// ─── ÉRVÉNYTELENÍTÉS (törlés helyett) ─────────────────────────────────────────
// FIZIKAI TÖRLÉS NINCS – csak érvénytelenítés kötelező indoklással
router.post('/:id/void', authenticateToken, (req, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Indoklás kötelező (min. 5 karakter) – pl. "Téves beolvasás"' });
  }

  db.attendance.findOne({ _id: req.params.id }, (err, rec) => {
    if (!rec) return res.status(404).json({ error: 'Rekord nem található' });
    if (rec.voided) return res.status(400).json({ error: 'Ez a rekord már érvénytelen' });

    const voidedAt = new Date().toISOString();
    db.attendance.update(
      { _id: req.params.id },
      { $set: { voided: true, voidReason: reason.trim(), voidedBy: req.user.email, voidedAt } },
      {},
      (err, n) => {
        // Audit log bejegyzés
        db.auditLog.insert({
          action:      'void',
          recordId:    rec._id,
          employeeName: rec.employeeName,
          originalTimestamp: rec.timestamp,
          originalType: rec.type,
          reason:      reason.trim(),
          performedBy: req.user.email,
          performedAt: voidedAt,
        });
        res.json({ success: true, message: 'Rekord érvénytelenítve', voidedAt });
      }
    );
  });
});

// ─── KÉZI BEJEGYZÉS (kötelező indoklással) ────────────────────────────────────
router.post('/manual', authenticateToken, (req, res) => {
  const { employeeId, type, date, time, locationId, locationName, reason } = req.body;
  if (!employeeId || !type || !date || !time) return res.status(400).json({ error: 'Minden mező kötelező' });
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Kézi bejegyzésnél indoklás kötelező (min. 5 karakter) – pl. "Terminál meghibásodás 2024-01-15"' });
  }

  db.employees.findOne({ _id: employeeId }, (err, emp) => {
    if (!emp) return res.status(404).json({ error: 'Dolgozó nem található' });

    const timestamp = new Date(`${date}T${time}:00`).toISOString();

    getChainState(db, (err, { nextIndex, prevHash }) => {
      const baseRecord = {
        employeeId:    emp._id,
        employeeName:  emp.name,
        department:    emp.department || '',
        type, timestamp, date, time,
        locationId:    locationId || emp.locationId || null,
        locationName:  locationName || emp.locationName || null,
        locationCode:  null,
        chainIndex:    nextIndex,
        voided:        false,
        manual:        true,
        manualReason:  reason.trim(),
        manualBy:      req.user.email,
        nfcTagId:      null,
        createdAt:     new Date().toISOString(),
      };

      const hash = computeRecordHash(baseRecord, prevHash);
      baseRecord.hash    = hash;
      baseRecord.prevHash = prevHash;

      db.attendance.insert(baseRecord, (err, doc) => {
        // Audit log
        db.auditLog.insert({
          action: 'manual_entry', recordId: doc._id,
          employeeName: emp.name, timestamp, type,
          reason: reason.trim(), performedBy: req.user.email,
          performedAt: new Date().toISOString(),
        });
        res.json(doc);
      });
    });
  });
});

// ─── LÁNC INTEGRITÁS ELLENŐRZÉS ───────────────────────────────────────────────
router.get('/verify', authenticateToken, (req, res) => {
  db.attendance.find({}, (err, records) => {
    const result = verifyChain(records);
    res.json(result);
  });
});

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
router.get('/audit-log', authenticateToken, (req, res) => {
  db.auditLog.find({}, (err, docs) => {
    res.json(docs.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt)));
  });
});

// ─── CSV EXPORT (hash-sel, érvénytelenített rekordok jelölve) ─────────────────
router.get('/export/csv', authenticateToken, (req, res) => {
  const { dateFrom, dateTo, locationId, includeVoided } = req.query;
  const query = {};
  if (dateFrom && dateTo) query.date = { $gte: dateFrom, $lte: dateTo };
  if (locationId) query.locationId = locationId;
  // Alapból csak érvényes rekordok
  if (includeVoided !== 'true') query.voided = { $ne: true };

  db.attendance.find(query, (err, records) => {
    const sorted = records.sort((a, b) => (a.chainIndex || 0) - (b.chainIndex || 0));
    const header = 'Lánc#;Dátum;Idő;Dolgozó;Osztály;Telephely;Esemény;Típus;Hash (első 16 kar.);Érvényes\n';
    const rows = sorted.map(r => [
      r.chainIndex ?? '',
      r.date, r.time,
      r.employeeName,
      r.department || '',
      r.locationName || '',
      r.type === 'checkin' ? 'Érkezés' : 'Távozás',
      r.manual ? 'KÉZI' : 'NFC/QR',
      (r.hash || '').substring(0, 16),
      r.voided ? `ÉRVÉNYTELEN: ${r.voidReason || ''}` : 'IGEN'
    ].join(';')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jelenlét_hiteles_${dateFrom||'all'}_${dateTo||'all'}.csv"`);
    res.send('﻿' + header + rows);
  });
});

// Helper
function getWorkDays(from, to) {
  let count = 0;
  const d = new Date(from), end = new Date(to);
  while (d <= end) { const day = d.getDay(); if (day !== 0 && day !== 6) count++; d.setDate(d.getDate() + 1); }
  return count;
}

module.exports = router;
