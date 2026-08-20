/* Capa de acceso a IndexedDB. Diseñada para poder sincronizar luego con un backend
   (cada registro tiene 'synced' y 'updatedAt' para futura sincronización). */
const DB_NAME = 'sauna_db';
const DB_VERSION = 4;
const STORE_CLIENTES = 'clientes';
const STORE_PRODUCTOS = 'productos';
const STORE_PEDIDOS = 'pedidos';
const STORE_CAJAS = 'cajas';
const STORE_MOVIMIENTOS = 'movimientos';

let dbInstance = null;

/* Identificador global usado para sincronizar cada registro con el backend,
   independiente del id autoincremental local (que solo tiene sentido en este dispositivo). */
function generateUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_CLIENTES)) {
        const store = db.createObjectStore(STORE_CLIENTES, { keyPath: 'id', autoIncrement: true });
        store.createIndex('estado', 'estado', { unique: false });
        store.createIndex('nombre', 'nombre', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PRODUCTOS)) {
        const storeProd = db.createObjectStore(STORE_PRODUCTOS, { keyPath: 'id', autoIncrement: true });
        storeProd.createIndex('nombre', 'nombre', { unique: false });
        storeProd.createIndex('categoria', 'categoria', { unique: false });
        storeProd.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PEDIDOS)) {
        const storePed = db.createObjectStore(STORE_PEDIDOS, { keyPath: 'id', autoIncrement: true });
        storePed.createIndex('clienteId', 'clienteId', { unique: false });
        storePed.createIndex('estado', 'estado', { unique: false });
        storePed.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CAJAS)) {
        const storeCaja = db.createObjectStore(STORE_CAJAS, { keyPath: 'id', autoIncrement: true });
        storeCaja.createIndex('estado', 'estado', { unique: false });
        storeCaja.createIndex('fecha', 'fecha', { unique: false });
        storeCaja.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_MOVIMIENTOS)) {
        const storeMov = db.createObjectStore(STORE_MOVIMIENTOS, { keyPath: 'id', autoIncrement: true });
        storeMov.createIndex('cajaId', 'cajaId', { unique: false });
        storeMov.createIndex('tipo', 'tipo', { unique: false });
        storeMov.createIndex('synced', 'synced', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

async function addCliente(cliente) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIENTES, 'readwrite');
    const store = tx.objectStore(STORE_CLIENTES);
    const req = store.add(cliente);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateCliente(cliente) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIENTES, 'readwrite');
    const store = tx.objectStore(STORE_CLIENTES);
    const req = store.put(cliente);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteCliente(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIENTES, 'readwrite');
    const store = tx.objectStore(STORE_CLIENTES);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllClientes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIENTES, 'readonly');
    const store = tx.objectStore(STORE_CLIENTES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addProducto(producto) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTOS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTOS);
    const req = store.add(producto);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateProducto(producto) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTOS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTOS);
    const req = store.put(producto);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteProducto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTOS, 'readwrite');
    const store = tx.objectStore(STORE_PRODUCTOS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllProductos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTOS, 'readonly');
    const store = tx.objectStore(STORE_PRODUCTOS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addPedido(pedido) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PEDIDOS, 'readwrite');
    const store = tx.objectStore(STORE_PEDIDOS);
    const req = store.add(pedido);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updatePedido(pedido) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PEDIDOS, 'readwrite');
    const store = tx.objectStore(STORE_PEDIDOS);
    const req = store.put(pedido);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPedidos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PEDIDOS, 'readonly');
    const store = tx.objectStore(STORE_PEDIDOS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addCaja(caja) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAJAS, 'readwrite');
    const store = tx.objectStore(STORE_CAJAS);
    const req = store.add(caja);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateCaja(caja) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAJAS, 'readwrite');
    const store = tx.objectStore(STORE_CAJAS);
    const req = store.put(caja);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllCajas() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAJAS, 'readonly');
    const store = tx.objectStore(STORE_CAJAS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addMovimiento(movimiento) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MOVIMIENTOS, 'readwrite');
    const store = tx.objectStore(STORE_MOVIMIENTOS);
    const req = store.add(movimiento);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllMovimientos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MOVIMIENTOS, 'readonly');
    const store = tx.objectStore(STORE_MOVIMIENTOS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* Helpers genéricos usados por sync.js para leer/escribir cualquier store por nombre. */
async function getAllRecords(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putRecord(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
