/**
 * Jelenlét Nyilvántartó – Kriptográfiai integritás modul
 *
 * Minden jelenlét bejegyzés kap egy SHA-256 hash-t, amely tartalmazza:
 *   - a bejegyzés összes lényeges adatát (ki, mikor, mit, hol)
 *   - az előző bejegyzés hash-ét (lánc-hivatkozás)
 *
 * Ha bárki utólag módosít egy rekordot az adatbázisban,
 * a hash nem egyezik meg az újraszámítottal → manipuláció detektálva.
 *
 * Ez a megközelítés NEM igényel külső szervert vagy blockchain hálózatot.
 */

const crypto = require('crypto');

/**
 * Egy jelenlét bejegyzés hash-ének kiszámítása.
 * A hash inputja szigorúan meghatározott – sorrendje és tartalma nem változhat.
 */
function computeRecordHash(record, prevHash) {
  const payload = [
    record.employeeId   || '',
    record.employeeName || '',
    record.type         || '',
    record.timestamp    || '',
    record.locationId   || '',
    record.locationName || '',
    record.nfcTagId     || '',
    prevHash            || 'GENESIS',
  ].join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * A teljes lánc verifikálása.
 * Minden rekordhoz újraszámítja a hash-t és összehasonlítja a tárolttal.
 *
 * @param {Array} records - Időrend szerint sorba rendezett rekordok
 * @returns {{ valid: boolean, total: number, broken: Array, checkedAt: string }}
 */
function verifyChain(records) {
  const sorted = [...records].sort((a, b) => (a.chainIndex || 0) - (b.chainIndex || 0));
  const broken = [];
  let prevHash = 'GENESIS';

  for (const rec of sorted) {
    const expected = computeRecordHash(rec, prevHash);
    if (rec.hash !== expected) {
      broken.push({
        chainIndex:    rec.chainIndex,
        recordId:      rec._id,
        employeeName:  rec.employeeName,
        timestamp:     rec.timestamp,
        storedHash:    rec.hash,
        expectedHash:  expected,
        reason:        'Hash mismatch – record may have been tampered with'
      });
    }
    prevHash = rec.hash || expected;
  }

  return {
    valid:      broken.length === 0,
    total:      sorted.length,
    broken,
    lastHash:   sorted.length > 0 ? sorted[sorted.length - 1].hash : 'GENESIS',
    checkedAt:  new Date().toISOString(),
  };
}

/**
 * Következő lánc-index lekérése (db-ből) és az előző hash.
 * Callback: (err, { nextIndex, prevHash })
 */
function getChainState(db, callback) {
  db.attendance.find({}, (err, all) => {
    if (err || !all || all.length === 0) {
      return callback(null, { nextIndex: 0, prevHash: 'GENESIS' });
    }
    const sorted = all
      .filter(r => typeof r.chainIndex === 'number')
      .sort((a, b) => b.chainIndex - a.chainIndex);
    if (sorted.length === 0) {
      return callback(null, { nextIndex: 0, prevHash: 'GENESIS' });
    }
    const last = sorted[0];
    callback(null, { nextIndex: last.chainIndex + 1, prevHash: last.hash || 'GENESIS' });
  });
}

module.exports = { computeRecordHash, verifyChain, getChainState };
