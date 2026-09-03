const express = require('express');

/* Crea un router REST genérico para un recurso sincronizable por 'uuid'.
   Estrategia de conflicto: last-write-wins comparando 'updatedAt'. */
function makeResourceRouter(db, io, resourceName, columns) {
  const router = express.Router();
  const table = resourceName;
  const placeholders = columns.map(() => '?').join(', ');
  const updateSet = columns.filter(c => c !== 'uuid').map(c => `${c} = excluded.${c}`).join(', ');

  const upsertStmt = db.prepare(`
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(uuid) DO UPDATE SET ${updateSet}
    WHERE excluded.updatedAt >= ${table}.updatedAt
  `);

  const getByUuidStmt = db.prepare(`SELECT * FROM ${table} WHERE uuid = ?`);
  const getAllStmt = db.prepare(`SELECT * FROM ${table} ORDER BY updatedAt DESC`);
  const getSinceStmt = db.prepare(`SELECT * FROM ${table} WHERE updatedAt > ? ORDER BY updatedAt ASC`);
  const deleteStmt = db.prepare(`DELETE FROM ${table} WHERE uuid = ?`);

  function toRow(record) {
    return columns.map(c => {
      const v = record[c];
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'object' && v !== null) return JSON.stringify(v);
      return v === undefined ? null : v;
    });
  }

  function upsertOne(record) {
    if (!record.uuid) throw new Error('Falta uuid');
    upsertStmt.run(...toRow(record));
    return getByUuidStmt.get(record.uuid);
  }

  router.get('/', (req, res) => {
    res.json(getAllStmt.all());
  });

  router.get('/since/:timestamp', (req, res) => {
    const since = Number(req.params.timestamp) || 0;
    res.json(getSinceStmt.all(since));
  });

  router.post('/', (req, res) => {
    try {
      const saved = upsertOne(req.body);
      io.emit('sync:update', { resource: resourceName, record: saved });
      res.status(201).json(saved);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/batch', (req, res) => {
    const records = Array.isArray(req.body) ? req.body : [];
    const saved = [];
    db.exec('BEGIN');
    try {
      for (const item of records) {
        saved.push(upsertOne(item));
      }
      db.exec('COMMIT');
      saved.forEach(record => io.emit('sync:update', { resource: resourceName, record }));
      res.status(201).json(saved);
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:uuid', (req, res) => {
    deleteStmt.run(req.params.uuid);
    io.emit('sync:delete', { resource: resourceName, uuid: req.params.uuid });
    res.status(204).end();
  });

  return router;
}

module.exports = { makeResourceRouter };
