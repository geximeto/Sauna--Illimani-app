const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite');

const { initSchema } = require('./db/schema');
const { makeResourceRouter } = require('./routes/makeResourceRouter');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db', 'sauna.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
initSchema(db);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const RESOURCES = {
  clientes: ['uuid', 'nombre', 'telefono', 'servicio', 'personas', 'cabina', 'duracion', 'notas', 'estado', 'timestamp', 'salidaTimestamp', 'updatedAt'],
  productos: ['uuid', 'nombre', 'categoria', 'stock', 'unidad', 'stockMinimo', 'precio', 'updatedAt'],
  pedidos: ['uuid', 'clienteUuid', 'clienteNombre', 'items', 'total', 'notas', 'estado', 'pagado', 'metodoPago', 'timestamp', 'updatedAt'],
  cajas: ['uuid', 'fecha', 'montoInicial', 'estado', 'montoContado', 'efectivoEsperado', 'diferencia', 'aperturaTimestamp', 'cierreTimestamp', 'updatedAt'],
  movimientos: ['uuid', 'cajaUuid', 'tipo', 'concepto', 'monto', 'metodoPago', 'timestamp', 'updatedAt']
};

for (const [resource, columns] of Object.entries(RESOURCES)) {
  app.use(`/api/${resource}`, makeResourceRouter(db, io, resource, columns));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hora: new Date().toISOString() });
});

// Sirve el frontend PWA directamente desde el mismo servidor (opcional, para probar todo junto)
app.use(express.static(path.join(__dirname, '..')));

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id} (total: ${io.engine.clientsCount})`);
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id} (total: ${io.engine.clientsCount})`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🧖 Backend Sauna Illimani escuchando en http://localhost:${PORT}`);
  console.log(`   Base de datos SQLite: ${DB_PATH}\n`);
});
