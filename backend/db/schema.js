function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      uuid TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT,
      servicio TEXT NOT NULL,
      personas INTEGER DEFAULT 1,
      cabina TEXT,
      duracion INTEGER,
      notas TEXT,
      estado TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      salidaTimestamp INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS productos (
      uuid TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      unidad TEXT,
      stockMinimo INTEGER DEFAULT 0,
      precio REAL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      uuid TEXT PRIMARY KEY,
      clienteUuid TEXT,
      clienteNombre TEXT,
      items TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      notas TEXT,
      estado TEXT NOT NULL,
      pagado INTEGER DEFAULT 0,
      metodoPago TEXT,
      timestamp INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cajas (
      uuid TEXT PRIMARY KEY,
      fecha TEXT NOT NULL,
      montoInicial REAL DEFAULT 0,
      estado TEXT NOT NULL,
      montoContado REAL,
      efectivoEsperado REAL,
      diferencia REAL,
      aperturaTimestamp INTEGER,
      cierreTimestamp INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movimientos (
      uuid TEXT PRIMARY KEY,
      cajaUuid TEXT NOT NULL,
      tipo TEXT NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL,
      metodoPago TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clientes_updated ON clientes(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_productos_updated ON productos(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_pedidos_updated ON pedidos(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_cajas_updated ON cajas(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_movimientos_updated ON movimientos(updatedAt);
  `);
}

module.exports = { initSchema };
