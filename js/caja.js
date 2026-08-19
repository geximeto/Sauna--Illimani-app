const aperturaForm = document.getElementById('apertura-form');
const cierreForm = document.getElementById('cierre-form');
const movimientoForm = document.getElementById('movimiento-form');
const cajaEstadoBadge = document.getElementById('caja-estado-badge');
const cajaFechaLabel = document.getElementById('caja-fecha-label');
const cajaResumenEl = document.getElementById('caja-resumen');
const cajaDiferenciaEl = document.getElementById('caja-diferencia');
const listaPedidosCobrarEl = document.getElementById('lista-pedidos-cobrar');
const listaMovimientosEl = document.getElementById('lista-movimientos');
const contadorMovimientosEl = document.getElementById('contador-movimientos');

let cajaActual = null;
let movimientosCache = [];

function hoyStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatBsCaja(num) {
  return `Bs. ${Number(num).toFixed(2)}`;
}

async function obtenerCajaAbierta() {
  const cajas = await getAllCajas();
  return cajas.find(c => c.estado === 'abierta' && c.fecha === hoyStr()) || null;
}

async function refrescarCaja() {
  cajaActual = await obtenerCajaAbierta();
  cajaFechaLabel.textContent = new Date().toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!cajaActual) {
    cajaEstadoBadge.textContent = 'Cerrada';
    cajaEstadoBadge.className = 'status-badge status-offline';
    aperturaForm.style.display = 'flex';
    cajaResumenEl.style.display = 'none';
    listaPedidosCobrarEl.innerHTML = '<p class="empty-state">Abre la caja para registrar cobros.</p>';
    listaMovimientosEl.innerHTML = '<p class="empty-state">Abre la caja para ver movimientos.</p>';
    contadorMovimientosEl.textContent = '0';
    return;
  }

  cajaEstadoBadge.textContent = 'Abierta';
  cajaEstadoBadge.className = 'status-badge status-online';
  aperturaForm.style.display = 'none';
  cajaResumenEl.style.display = 'block';

  await cargarMovimientos();
  await cargarPedidosPorCobrar();
  actualizarResumen();
}

aperturaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const montoInicial = Number(document.getElementById('caja-monto-inicial').value) || 0;

  const caja = {
    uuid: generateUuid(),
    fecha: hoyStr(),
    montoInicial,
    estado: 'abierta',
    aperturaTimestamp: Date.now(),
    synced: false,
    updatedAt: Date.now()
  };

  try {
    await addCaja(caja);
    mostrarToast('✅ Caja abierta');
    document.getElementById('caja-monto-inicial').value = 0;
    await refrescarCaja();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al abrir caja', 'error');
  }
});

async function cargarMovimientos() {
  const todos = await getAllMovimientos();
  movimientosCache = todos
    .filter(m => cajaActual && m.cajaId === cajaActual.id)
    .sort((a, b) => b.timestamp - a.timestamp);
  renderMovimientos();
}

function renderMovimientos() {
  contadorMovimientosEl.textContent = movimientosCache.length;

  if (movimientosCache.length === 0) {
    listaMovimientosEl.innerHTML = '<p class="empty-state">Aún no hay movimientos.</p>';
    return;
  }

  listaMovimientosEl.innerHTML = movimientosCache.map(m => `
    <div class="client-item ${m.tipo === 'egreso' ? 'vencido' : ''}">
      <div class="client-info">
        <div class="client-name">${escapeHtml(m.concepto)}</div>
        <div class="client-meta">
          <span class="service-tag">${m.tipo === 'ingreso' ? '⬆ Ingreso' : '⬇ Egreso'}</span>
          <span>${m.metodoPago}</span>
          <span>⏱ ${formatHora(new Date(m.timestamp))}</span>
        </div>
      </div>
      <div class="client-actions">
        <span style="font-weight:700; color:${m.tipo === 'ingreso' ? 'var(--success)' : 'var(--danger)'};">
          ${m.tipo === 'ingreso' ? '+' : '-'}${formatBsCaja(m.monto)}
        </span>
      </div>
    </div>
  `).join('');
}

movimientoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!cajaActual) {
    mostrarToast('Primero abre la caja', 'error');
    return;
  }

  const tipo = document.getElementById('mov-tipo').value;
  const concepto = document.getElementById('mov-concepto').value.trim();
  const monto = Number(document.getElementById('mov-monto').value);
  const metodoPago = document.getElementById('mov-metodo').value;

  if (!concepto || !monto || monto <= 0) {
    mostrarToast('Completa los campos requeridos', 'error');
    return;
  }

  const movimiento = {
    uuid: generateUuid(),
    cajaId: cajaActual.id,
    cajaUuid: cajaActual.uuid,
    tipo,
    concepto,
    monto,
    metodoPago,
    timestamp: Date.now(),
    synced: false,
    updatedAt: Date.now()
  };

  try {
    await addMovimiento(movimiento);
    mostrarToast(`✅ ${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} registrado`);
    movimientoForm.reset();
    document.getElementById('mov-tipo').value = 'ingreso';
    document.getElementById('mov-metodo').value = 'efectivo';
    await cargarMovimientos();
    actualizarResumen();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al registrar movimiento', 'error');
  }
});

async function cargarPedidosPorCobrar() {
  const pedidos = await getAllPedidos();
  const porCobrar = pedidos
    .filter(p => p.estado === 'entregado' && !p.pagado)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (porCobrar.length === 0) {
    listaPedidosCobrarEl.innerHTML = '<p class="empty-state">No hay pedidos pendientes de cobro.</p>';
    return;
  }

  listaPedidosCobrarEl.innerHTML = porCobrar.map(p => {
    const itemsTexto = p.items.map(i => `${i.cantidad}x ${escapeHtml(i.nombre)}`).join(', ');
    return `
    <div class="client-item alerta" data-id="${p.id}">
      <div class="client-info">
        <div class="client-name">${escapeHtml(p.clienteNombre)}</div>
        <div class="client-meta">
          <span class="service-tag">${itemsTexto}</span>
          <span style="font-weight:700;">${formatBsCaja(p.total)}</span>
        </div>
      </div>
      <div class="client-actions">
        <select class="cobro-metodo" data-id="${p.id}">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="qr">QR</option>
        </select>
        <button class="btn-icon btn-salida" title="Cobrar" data-action="cobrar" data-id="${p.id}">✔</button>
      </div>
    </div>
  `;
  }).join('');
}

listaPedidosCobrarEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="cobrar"]');
  if (!btn) return;
  if (!cajaActual) {
    mostrarToast('Primero abre la caja', 'error');
    return;
  }

  const id = Number(btn.dataset.id);
  const select = listaPedidosCobrarEl.querySelector(`.cobro-metodo[data-id="${id}"]`);
  const metodoPago = select ? select.value : 'efectivo';

  const pedidos = await getAllPedidos();
  const pedido = pedidos.find(p => p.id === id);
  if (!pedido) return;

  pedido.pagado = true;
  pedido.metodoPago = metodoPago;
  pedido.synced = false;
  pedido.updatedAt = Date.now();
  await updatePedido(pedido);

  await addMovimiento({
    uuid: generateUuid(),
    cajaId: cajaActual.id,
    cajaUuid: cajaActual.uuid,
    tipo: 'ingreso',
    concepto: `Pedido - ${pedido.clienteNombre}`,
    monto: pedido.total,
    metodoPago,
    timestamp: Date.now(),
    synced: false,
    updatedAt: Date.now()
  });

  mostrarToast(`💰 Cobro registrado: ${pedido.clienteNombre}`);
  await cargarPedidosPorCobrar();
  await cargarMovimientos();
  actualizarResumen();
});

function calcularTotales() {
  const totales = { ingresoEfectivo: 0, ingresoTarjeta: 0, ingresoQr: 0, egresoEfectivo: 0, egresoTarjeta: 0, egresoQr: 0 };
  for (const m of movimientosCache) {
    const clave = (m.tipo === 'ingreso' ? 'ingreso' : 'egreso') + m.metodoPago.charAt(0).toUpperCase() + m.metodoPago.slice(1);
    if (totales[clave] !== undefined) totales[clave] += m.monto;
  }
  return totales;
}

function actualizarResumen() {
  if (!cajaActual) return;
  const t = calcularTotales();
  const efectivoEsperado = cajaActual.montoInicial + t.ingresoEfectivo - t.egresoEfectivo;

  document.getElementById('res-monto-inicial').textContent = formatBsCaja(cajaActual.montoInicial);
  document.getElementById('res-ingresos-efectivo').textContent = formatBsCaja(t.ingresoEfectivo);
  document.getElementById('res-ingresos-tarjeta').textContent = formatBsCaja(t.ingresoTarjeta);
  document.getElementById('res-ingresos-qr').textContent = formatBsCaja(t.ingresoQr);
  document.getElementById('res-egresos-efectivo').textContent = formatBsCaja(t.egresoEfectivo);
  document.getElementById('res-efectivo-esperado').textContent = formatBsCaja(efectivoEsperado);
}

cierreForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!cajaActual) return;

  const montoContado = Number(document.getElementById('caja-monto-contado').value) || 0;
  const t = calcularTotales();
  const efectivoEsperado = cajaActual.montoInicial + t.ingresoEfectivo - t.egresoEfectivo;
  const diferencia = montoContado - efectivoEsperado;

  if (!confirm(`¿Cerrar la caja del día?\n\nEsperado: ${formatBsCaja(efectivoEsperado)}\nContado: ${formatBsCaja(montoContado)}\nDiferencia: ${formatBsCaja(diferencia)}`)) {
    return;
  }

  cajaActual.estado = 'cerrada';
  cajaActual.montoContado = montoContado;
  cajaActual.efectivoEsperado = efectivoEsperado;
  cajaActual.diferencia = diferencia;
  cajaActual.cierreTimestamp = Date.now();
  cajaActual.synced = false;
  cajaActual.updatedAt = Date.now();

  await updateCaja(cajaActual);
  mostrarToast(diferencia === 0 ? '✅ Caja cerrada sin diferencias' : `⚠️ Caja cerrada con diferencia de ${formatBsCaja(diferencia)}`, diferencia === 0 ? 'success' : 'error');

  cajaDiferenciaEl.textContent = `Diferencia del arqueo: ${formatBsCaja(diferencia)} (${diferencia >= 0 ? 'sobrante' : 'faltante'})`;
  cajaDiferenciaEl.style.color = diferencia === 0 ? 'var(--success)' : 'var(--danger)';

  setTimeout(() => refrescarCaja(), 2000);
});
