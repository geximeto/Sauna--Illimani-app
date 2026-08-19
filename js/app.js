const SERVICIOS_LABEL = {
  sauna_individual: 'Sauna Individual',
  sauna_grupal: 'Sauna Grupal',
  masaje_simple: 'Masaje Simple',
  masaje_sauna: 'Masaje + Sauna',
  piscina_jacuzzi: 'Piscina/Jacuzzi',
  paquete_completo: 'Paquete Completo'
};

const ALERTA_MIN_RESTANTES = 10; // minutos antes del fin para mostrar alerta

const form = document.getElementById('ingreso-form');
const horaInput = document.getElementById('hora');
const listaEl = document.getElementById('lista-clientes');
const contadorEl = document.getElementById('contador-activos');
const buscarInput = document.getElementById('buscar-cliente');
const toastEl = document.getElementById('toast');
const statusEl = document.getElementById('connection-status');

let clientesCache = [];
let filtroTexto = '';

function formatHora(date) {
  return date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

function actualizarHoraInput() {
  horaInput.value = formatHora(new Date());
}

function mostrarToast(msg, tipo = 'success') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + tipo;
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

function actualizarEstadoConexion() {
  if (navigator.onLine) {
    statusEl.textContent = 'En línea';
    statusEl.className = 'status-badge status-online';
  } else {
    statusEl.textContent = 'Sin conexión';
    statusEl.className = 'status-badge status-offline';
  }
}

function tiempoTranscurrido(timestamp) {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'recién ingresó';
  if (mins < 60) return `hace ${mins} min`;
  const horas = Math.floor(mins / 60);
  return `hace ${horas}h ${mins % 60}min`;
}

function estadoTiempo(cliente) {
  const minsTranscurridos = (Date.now() - cliente.timestamp) / 60000;
  const restantes = cliente.duracion - minsTranscurridos;
  if (restantes <= 0) return { nivel: 'vencido', texto: `Excedió ${Math.abs(Math.round(restantes))} min` };
  if (restantes <= ALERTA_MIN_RESTANTES) return { nivel: 'alerta', texto: `Quedan ${Math.round(restantes)} min` };
  return { nivel: 'normal', texto: `Quedan ${Math.round(restantes)} min` };
}

async function cargarClientes() {
  const todos = await getAllClientes();
  clientesCache = todos
    .filter(c => c.estado === 'activo')
    .sort((a, b) => b.timestamp - a.timestamp);
  renderLista();
}

function renderLista() {
  const texto = filtroTexto.trim().toLowerCase();
  const filtrados = texto
    ? clientesCache.filter(c => c.nombre.toLowerCase().includes(texto))
    : clientesCache;

  contadorEl.textContent = clientesCache.length;

  if (filtrados.length === 0) {
    listaEl.innerHTML = `<p class="empty-state">${texto ? 'No se encontraron clientes.' : 'No hay clientes registrados aún.'}</p>`;
    return;
  }

  listaEl.innerHTML = filtrados.map(c => {
    const estado = estadoTiempo(c);
    const claseAlerta = estado.nivel !== 'normal' ? estado.nivel : '';
    return `
    <div class="client-item ${claseAlerta}" data-id="${c.id}">
      <div class="client-info">
        <div class="client-name">${escapeHtml(c.nombre)}${c.telefono ? ` · 📞 ${escapeHtml(c.telefono)}` : ''}</div>
        <div class="client-meta">
          <span class="service-tag">${SERVICIOS_LABEL[c.servicio] || c.servicio}</span>
          <span>👥 ${c.personas || 1}</span>
          ${c.cabina ? `<span>🚪 ${escapeHtml(c.cabina)}</span>` : ''}
          <span>⏱ ${formatHora(new Date(c.timestamp))} · ${tiempoTranscurrido(c.timestamp)}</span>
          <span class="time-badge ${claseAlerta}">${estado.texto}</span>
        </div>
      </div>
      <div class="client-actions">
        <button class="btn-icon btn-salida" title="Registrar salida" data-action="salida" data-id="${c.id}">✔</button>
      </div>
    </div>
  `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const servicio = document.getElementById('servicio').value;
  const personas = Number(document.getElementById('personas').value) || 1;
  const cabina = document.getElementById('cabina').value.trim();
  const duracion = Number(document.getElementById('duracion').value);
  const notas = document.getElementById('notas').value.trim();

  if (!nombre || !servicio || !duracion) {
    mostrarToast('Completa los campos requeridos', 'error');
    return;
  }

  const cliente = {
    uuid: generateUuid(),
    nombre,
    telefono,
    servicio,
    personas,
    cabina,
    duracion,
    notas,
    estado: 'activo',
    timestamp: Date.now(),
    synced: false,
    updatedAt: Date.now()
  };

  try {
    await addCliente(cliente);
    mostrarToast(`✅ ${nombre} registrado`);
    form.reset();
    document.getElementById('personas').value = 1;
    document.getElementById('duracion').value = '60';
    actualizarHoraInput();
    await cargarClientes();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al registrar cliente', 'error');
  }
});

listaEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="salida"]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const cliente = clientesCache.find(c => c.id === id);
  if (!cliente) return;

  cliente.estado = 'finalizado';
  cliente.salidaTimestamp = Date.now();
  cliente.synced = false;
  cliente.updatedAt = Date.now();

  try {
    await updateCliente(cliente);
    mostrarToast(`👋 Salida registrada: ${cliente.nombre}`);
    await cargarClientes();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al registrar salida', 'error');
  }
});

buscarInput.addEventListener('input', (e) => {
  filtroTexto = e.target.value;
  renderLista();
});

window.addEventListener('online', actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);

setInterval(() => {
  if (document.getElementById('registro').classList.contains('active')) {
    renderLista();
  }
}, 15000);

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach(sec => {
        sec.classList.toggle('active', sec.id === tab);
      });
      if (tab === 'inventario' && typeof cargarProductos === 'function') {
        cargarProductos();
      }
      if (tab === 'pedidos' && typeof cargarPedidos === 'function') {
        poblarSelectClientes();
        poblarSelectProductos();
        cargarPedidos();
      }
      if (tab === 'caja' && typeof refrescarCaja === 'function') {
        refrescarCaja();
      }
      if (tab === 'reportes' && typeof generarReporte === 'function') {
        initFechaReporte();
        generarReporte();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  actualizarHoraInput();
  actualizarEstadoConexion();
  initTabs();
  await cargarClientes();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW error:', err));
  }
});
