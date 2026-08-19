/* Sincronización con el backend (Node + Express + SQLite).
   Estrategia: cada registro tiene un 'uuid' global. Se hace 'push' de los registros
   locales no sincronizados y 'pull' de los cambios del servidor (last-write-wins por updatedAt).
   Los cambios de otros dispositivos llegan en tiempo real vía Socket.IO. */

const SYNC_RESOURCES = [
  { store: STORE_CLIENTES, resource: 'clientes' },
  { store: STORE_PRODUCTOS, resource: 'productos' },
  { store: STORE_PEDIDOS, resource: 'pedidos' },
  { store: STORE_CAJAS, resource: 'cajas' },
  { store: STORE_MOVIMIENTOS, resource: 'movimientos' }
];

const BACKEND_URL_KEY = 'sauna_backend_url';
let socket = null;
let syncEnCurso = false;

function getBackendUrl() {
  const guardado = (localStorage.getItem(BACKEND_URL_KEY) || '').trim();
  if (guardado) return guardado;
  // Si la app se sirve desde el mismo backend (Railway/Render), se autodetecta sin configurar nada.
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return location.origin;
  }
  return '';
}

function setBackendUrl(url) {
  localStorage.setItem(BACKEND_URL_KEY, url.trim().replace(/\/+$/, ''));
}

function normalizeServerRecord(resource, record) {
  const out = { ...record };
  if (resource === 'pedidos') {
    out.pagado = !!out.pagado;
    if (typeof out.items === 'string') {
      try { out.items = JSON.parse(out.items); } catch (e) { out.items = []; }
    }
  }
  return out;
}

async function pushResource({ store, resource }) {
  const backendUrl = getBackendUrl();
  const todos = await getAllRecords(store);
  const pendientes = todos.filter(r => r.uuid && r.synced === false);
  if (pendientes.length === 0) return 0;

  const res = await fetch(`${backendUrl}/api/${resource}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pendientes)
  });
  if (!res.ok) throw new Error(`Fallo al enviar ${resource}`);

  for (const r of pendientes) {
    r.synced = true;
    await putRecord(store, r);
  }
  return pendientes.length;
}

async function pullResource({ store, resource }) {
  const backendUrl = getBackendUrl();
  const res = await fetch(`${backendUrl}/api/${resource}`);
  if (!res.ok) throw new Error(`Fallo al recibir ${resource}`);
  const serverRecords = await res.json();
  const localRecords = await getAllRecords(store);

  let cambios = 0;
  for (const raw of serverRecords) {
    const normalizado = normalizeServerRecord(resource, raw);
    const local = localRecords.find(l => l.uuid === normalizado.uuid);

    if (local) {
      if ((normalizado.updatedAt || 0) > (local.updatedAt || 0)) {
        const actualizado = { ...local, ...normalizado, id: local.id, synced: true };
        await putRecord(store, actualizado);
        cambios++;
      }
    } else {
      const nuevo = { ...normalizado, synced: true };
      delete nuevo.id;
      await putRecord(store, nuevo);
      cambios++;
    }
  }
  return cambios;
}

function refrescarVistaActual() {
  const activa = document.querySelector('.tab-content.active');
  if (!activa) return;
  if (activa.id === 'registro' && typeof cargarClientes === 'function') cargarClientes();
  if (activa.id === 'inventario' && typeof cargarProductos === 'function') cargarProductos();
  if (activa.id === 'pedidos' && typeof cargarPedidos === 'function') {
    cargarPedidos();
    poblarSelectClientes();
    poblarSelectProductos();
  }
  if (activa.id === 'caja' && typeof refrescarCaja === 'function') refrescarCaja();
  if (activa.id === 'reportes' && typeof generarReporte === 'function') generarReporte();
}

function actualizarBadgeSync(estado) {
  const btn = document.getElementById('sync-status-btn');
  if (!btn) return;
  const estados = {
    'sin-servidor': { texto: '☁ Sin servidor', clase: 'status-offline' },
    'conectando': { texto: '☁ Conectando...', clase: 'status-offline' },
    'conectado': { texto: '☁ En vivo', clase: 'status-online' },
    'sincronizando': { texto: '🔄 Sincronizando...', clase: 'status-offline' },
    'desconectado': { texto: '☁ Desconectado', clase: 'status-offline' },
    'error': { texto: '☁ Error de conexión', clase: 'status-offline' }
  };
  const info = estados[estado] || estados['sin-servidor'];
  btn.textContent = info.texto;
  btn.className = `status-badge ${info.clase}`;
}

async function sincronizarTodo({ silencioso = false } = {}) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    actualizarBadgeSync('sin-servidor');
    if (!silencioso) mostrarToast('Configura la URL del servidor primero (⚙)', 'error');
    return;
  }
  if (!navigator.onLine) {
    if (!silencioso) mostrarToast('Sin conexión a internet', 'error');
    return;
  }
  if (syncEnCurso) return;
  syncEnCurso = true;
  actualizarBadgeSync('sincronizando');

  try {
    let totalEnviados = 0;
    let totalRecibidos = 0;
    for (const r of SYNC_RESOURCES) totalEnviados += await pushResource(r);
    for (const r of SYNC_RESOURCES) totalRecibidos += await pullResource(r);

    actualizarBadgeSync(socket && socket.connected ? 'conectado' : 'desconectado');
    refrescarVistaActual();

    if (!silencioso) {
      mostrarToast(`🔄 Sincronizado: ${totalEnviados} enviados, ${totalRecibidos} recibidos`);
    }
  } catch (err) {
    console.warn('Error de sincronización:', err);
    actualizarBadgeSync('error');
    if (!silencioso) mostrarToast('Error al sincronizar con el servidor', 'error');
  } finally {
    syncEnCurso = false;
  }
}

function cargarScriptSocketIO(backendUrl) {
  return new Promise((resolve, reject) => {
    if (window.io) return resolve(window.io);
    const script = document.createElement('script');
    script.src = `${backendUrl}/socket.io/socket.io.js`;
    script.onload = () => resolve(window.io);
    script.onerror = () => reject(new Error('No se pudo cargar socket.io desde el servidor'));
    document.head.appendChild(script);
  });
}

async function conectarTiempoReal() {
  const backendUrl = getBackendUrl();
  if (!backendUrl) return;

  actualizarBadgeSync('conectando');
  try {
    const io = await cargarScriptSocketIO(backendUrl);
    if (socket) socket.disconnect();
    socket = io(backendUrl, { reconnectionDelay: 3000, timeout: 8000 });

    socket.on('connect', () => {
      actualizarBadgeSync('conectado');
      sincronizarTodo({ silencioso: true });
    });

    socket.on('disconnect', () => actualizarBadgeSync('desconectado'));
    socket.on('connect_error', () => actualizarBadgeSync('error'));

    socket.on('sync:update', async ({ resource, record }) => {
      const entry = SYNC_RESOURCES.find(r => r.resource === resource);
      if (!entry) return;
      await pullResource(entry);
      refrescarVistaActual();
    });
  } catch (err) {
    console.warn('Tiempo real no disponible:', err.message);
    actualizarBadgeSync('error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const syncBtn = document.getElementById('sync-status-btn');
  const configBtn = document.getElementById('sync-config-btn');

  syncBtn.addEventListener('click', () => sincronizarTodo());

  configBtn.addEventListener('click', () => {
    const actual = getBackendUrl() || 'http://localhost:3000';
    const nueva = prompt('URL del servidor de sincronización (ej: http://192.168.1.10:3000):', actual);
    if (nueva === null) return;
    if (!nueva.trim()) {
      localStorage.removeItem(BACKEND_URL_KEY);
      actualizarBadgeSync('sin-servidor');
      return;
    }
    setBackendUrl(nueva);
    conectarTiempoReal();
  });

  if (getBackendUrl()) {
    conectarTiempoReal();
  } else {
    actualizarBadgeSync('sin-servidor');
  }

  window.addEventListener('online', () => sincronizarTodo({ silencioso: true }));

  setInterval(() => sincronizarTodo({ silencioso: true }), 30000);
});
