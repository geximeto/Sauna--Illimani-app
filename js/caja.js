const aperturaForm = document.getElementById('apertura-form');
const cierreForm = document.getElementById('cierre-form');
const movimientoForm = document.getElementById('movimiento-form');
const cajaEstadoBadge = document.getElementById('caja-estado-badge');
const cajaFechaLabel = document.getElementById('caja-fecha-label');
const cajaResumenEl = document.getElementById('caja-resumen');
const cajaDiferenciaEl = document.getElementById('caja-diferencia');
const listaPorCobrarEl = document.getElementById('lista-por-cobrar');
const listaMovimientosEl = document.getElementById('lista-movimientos');
const contadorMovimientosEl = document.getElementById('contador-movimientos');

let cajaActual = null;
let movimientosCache = [];

// Precios de servicio: null significa que no tiene tarifa fija y se cobra manual.
const PRECIO_SERVICIO = {
  sauna_grupal: (cliente) => (cliente.personas || 1) * 40,
  sauna_individual: (cliente) => (cliente.personas || 1) * (cliente.duracion / 60) * 35,
  masaje_sauna: () => null
};

function calcularMontoServicio(cliente) {
  const calc = PRECIO_SERVICIO[cliente.servicio];
  return calc ? calc(cliente) : null;
}

function hoyStr() {
  return new Date().toISOString().slice(0, 10);
}

function fechaDeTimestampCaja(ts) {
  return new Date(ts).toISOString().slice(0, 10);
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
    listaPorCobrarEl.innerHTML = '<p class="empty-state">Abre la caja para registrar cobros.</p>';
    listaMovimientosEl.innerHTML = '<p class="empty-state">Abre la caja para ver movimientos.</p>';
    contadorMovimientosEl.textContent = '0';
    return;
  }

  cajaEstadoBadge.textContent = 'Abierta';
  cajaEstadoBadge.className = 'status-badge status-online';
  aperturaForm.style.display = 'none';
  cajaResumenEl.style.display = 'block';

  await cargarMovimientos();
  await cargarPorCobrar();
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

async function cargarPorCobrar() {
  const [clientes, pedidos] = await Promise.all([getAllClientes(), getAllPedidos()]);

  const serviciosPendientes = clientes.filter(c => !c.servicioPagado && fechaDeTimestampCaja(c.timestamp) === hoyStr());
  const pedidosPendientes = pedidos.filter(p => p.estado === 'entregado' && !p.pagado);

  // Agrupa por cliente (uuid) para poder cobrar servicio + sus pedidos juntos, en un solo paso.
  const grupos = new Map();

  serviciosPendientes.forEach(c => {
    grupos.set(c.uuid, { clave: c.uuid, nombre: c.nombre, cliente: c, pedidos: [], timestamp: c.timestamp });
  });

  pedidosPendientes.forEach(p => {
    const clave = p.clienteUuid || `sin-cliente-${p.uuid}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, { clave, nombre: p.clienteNombre, cliente: null, pedidos: [], timestamp: p.timestamp });
    }
    grupos.get(clave).pedidos.push(p);
  });

  const listaGrupos = Array.from(grupos.values()).sort((a, b) => a.timestamp - b.timestamp);

  if (listaGrupos.length === 0) {
    listaPorCobrarEl.innerHTML = '<p class="empty-state">No hay nada pendiente de cobro.</p>';
    return;
  }

  listaPorCobrarEl.innerHTML = listaGrupos.map(g => {
    const montoServicio = g.cliente ? calcularMontoServicio(g.cliente) : null;
    const servicioEsManual = g.cliente && montoServicio === null;
    const totalPedidos = g.pedidos.reduce((s, p) => s + p.total, 0);

    const lineas = [];
    if (g.cliente) {
      lineas.push(`${SERVICIOS_LABEL[g.cliente.servicio] || g.cliente.servicio} (👥 ${g.cliente.personas || 1})`);
    }
    if (g.pedidos.length > 0) {
      lineas.push(`${g.pedidos.length} pedido${g.pedidos.length > 1 ? 's' : ''}: ${g.pedidos.map(p => p.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')).join(' + ')}`);
    }

    return `
    <div class="client-item alerta" data-clave="${g.clave}">
      <div class="client-info">
        <div class="client-name">${escapeHtml(g.nombre)}</div>
        <div class="client-meta">
          ${lineas.map(l => `<span class="service-tag">${escapeHtml(l)}</span>`).join('')}
          ${servicioEsManual ? '<span style="color:var(--warning);font-weight:600;">Servicio sin tarifa fija</span>' : ''}
        </div>
      </div>
      <div class="client-actions">
        <input type="number" class="cobro-monto-servicio" data-clave="${g.clave}" min="0" step="0.01"
          value="${g.cliente && !servicioEsManual ? montoServicio.toFixed(2) : ''}"
          placeholder="${g.cliente ? 'Servicio' : ''}" style="width:75px; ${g.cliente ? '' : 'display:none;'}">
        <span style="font-weight:700;" title="Total pedidos">${g.pedidos.length > 0 ? formatBsCaja(totalPedidos) : ''}</span>
        <select class="cobro-metodo" data-clave="${g.clave}">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="qr">QR</option>
        </select>
        <button class="btn-icon btn-salida" title="Cobrar todo" data-action="cobrar-grupo" data-clave="${g.clave}">✔</button>
      </div>
    </div>
  `;
  }).join('');

  listaPorCobrarEl._grupos = grupos;
}

listaPorCobrarEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="cobrar-grupo"]');
  if (!btn) return;
  if (!cajaActual) {
    mostrarToast('Primero abre la caja', 'error');
    return;
  }

  const clave = btn.dataset.clave;
  const grupo = listaPorCobrarEl._grupos && listaPorCobrarEl._grupos.get(clave);
  if (!grupo) return;

  const montoServicioInput = listaPorCobrarEl.querySelector(`.cobro-monto-servicio[data-clave="${clave}"]`);
  const montoServicio = grupo.cliente ? Number(montoServicioInput.value) : 0;
  const select = listaPorCobrarEl.querySelector(`.cobro-metodo[data-clave="${clave}"]`);
  const metodoPago = select ? select.value : 'efectivo';
  const totalPedidos = grupo.pedidos.reduce((s, p) => s + p.total, 0);
  const totalCobro = montoServicio + totalPedidos;

  if (grupo.cliente && (!montoServicio || montoServicio <= 0)) {
    mostrarToast('Ingresa un monto válido para el servicio', 'error');
    return;
  }
  if (totalCobro <= 0) {
    mostrarToast('No hay nada que cobrar', 'error');
    return;
  }

  try {
    if (grupo.cliente) {
      grupo.cliente.servicioPagado = true;
      grupo.cliente.synced = false;
      grupo.cliente.updatedAt = Date.now();
      await updateCliente(grupo.cliente);
    }

    for (const pedido of grupo.pedidos) {
      pedido.pagado = true;
      pedido.metodoPago = metodoPago;
      pedido.synced = false;
      pedido.updatedAt = Date.now();
      await updatePedido(pedido);
    }

    const partes = [];
    if (grupo.cliente) partes.push(SERVICIOS_LABEL[grupo.cliente.servicio] || grupo.cliente.servicio);
    if (grupo.pedidos.length > 0) partes.push(`${grupo.pedidos.length} pedido${grupo.pedidos.length > 1 ? 's' : ''}`);

    await addMovimiento({
      uuid: generateUuid(),
      cajaId: cajaActual.id,
      cajaUuid: cajaActual.uuid,
      tipo: 'ingreso',
      concepto: `${partes.join(' + ')} - ${grupo.nombre}`,
      monto: totalCobro,
      metodoPago,
      timestamp: Date.now(),
      synced: false,
      updatedAt: Date.now()
    });

    mostrarToast(`💰 Cobro registrado: ${grupo.nombre} (${formatBsCaja(totalCobro)})`);
    await cargarPorCobrar();
    await cargarMovimientos();
    actualizarResumen();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al registrar el cobro', 'error');
  }
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

  let mensaje = `¿Cerrar la caja del día?\n\nEsperado: ${formatBsCaja(efectivoEsperado)}\nContado: ${formatBsCaja(montoContado)}\nDiferencia: ${formatBsCaja(diferencia)}`;
  if (montoContado === 0 && efectivoEsperado > 0) {
    mensaje = `⚠️ Pusiste Bs. 0.00 como efectivo contado, pero se esperaban ${formatBsCaja(efectivoEsperado)}.\n\n¿Seguro que contaste el dinero antes de cerrar? Si no, cancela y vuelve a intentarlo.\n\n${mensaje}`;
  }

  if (!confirm(mensaje)) {
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
