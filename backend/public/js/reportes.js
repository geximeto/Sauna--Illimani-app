const repFechaInput = document.getElementById('rep-fecha');
const repClientesEl = document.getElementById('rep-clientes');
const repPedidosEl = document.getElementById('rep-pedidos');
const repIngresosEl = document.getElementById('rep-ingresos');
const repEgresosEl = document.getElementById('rep-egresos');
const repNetoEl = document.getElementById('rep-neto');
const repArqueoEl = document.getElementById('rep-arqueo');
const repServiciosEl = document.getElementById('rep-servicios');
const repProductosEl = document.getElementById('rep-productos');
const repMetodosEl = document.getElementById('rep-metodos');
const repListaMovimientosEl = document.getElementById('rep-lista-movimientos');
const repContadorMovimientosEl = document.getElementById('rep-contador-movimientos');

function formatBsRep(num) {
  return `Bs. ${Number(num).toFixed(2)}`;
}

function fechaDeTimestamp(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function initFechaReporte() {
  if (!repFechaInput.value) {
    repFechaInput.value = hoyStr();
  }
}

function renderBarras(contenedor, items, formatValor) {
  if (items.length === 0) {
    contenedor.innerHTML = '<p class="empty-state">Sin datos para esta fecha.</p>';
    return;
  }
  const max = Math.max(...items.map(i => i.valor));
  contenedor.innerHTML = items.map(i => `
    <div class="report-bar-row">
      <div class="report-bar-label">
        <span>${escapeHtml(i.etiqueta)}</span>
        <span class="report-bar-valor">${formatValor(i.valor)}</span>
      </div>
      <div class="report-bar-track">
        <div class="report-bar-fill" style="width:${max > 0 ? (i.valor / max * 100) : 0}%;"></div>
      </div>
    </div>
  `).join('');
}

async function generarReporte() {
  const fecha = repFechaInput.value || hoyStr();

  const [clientes, pedidos, movimientos, cajas] = await Promise.all([
    getAllClientes(),
    getAllPedidos(),
    getAllMovimientos(),
    getAllCajas()
  ]);

  const clientesDia = clientes.filter(c => fechaDeTimestamp(c.timestamp) === fecha);
  const pedidosDia = pedidos.filter(p => fechaDeTimestamp(p.timestamp) === fecha);
  const movimientosDia = movimientos.filter(m => fechaDeTimestamp(m.timestamp) === fecha);
  const cajaDia = cajas.find(c => c.fecha === fecha);

  const ingresos = movimientosDia.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const egresos = movimientosDia.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  const neto = ingresos - egresos;

  repClientesEl.textContent = clientesDia.length;
  repPedidosEl.textContent = pedidosDia.length;
  repIngresosEl.textContent = formatBsRep(ingresos);
  repEgresosEl.textContent = formatBsRep(egresos);
  repNetoEl.textContent = formatBsRep(neto);
  repNetoEl.style.color = neto >= 0 ? 'var(--success)' : 'var(--danger)';

  if (cajaDia && cajaDia.estado === 'cerrada') {
    const dif = cajaDia.diferencia;
    repArqueoEl.textContent = `${dif === 0 ? 'Sin diferencia' : (dif > 0 ? '+' : '') + formatBsRep(dif)}`;
    repArqueoEl.style.color = dif === 0 ? 'var(--success)' : 'var(--danger)';
  } else if (cajaDia && cajaDia.estado === 'abierta') {
    repArqueoEl.textContent = 'Caja abierta';
    repArqueoEl.style.color = 'var(--warning)';
  } else {
    repArqueoEl.textContent = 'Sin cierre';
    repArqueoEl.style.color = 'var(--text-muted)';
  }

  const serviciosCount = {};
  clientesDia.forEach(c => {
    const label = SERVICIOS_LABEL[c.servicio] || c.servicio;
    serviciosCount[label] = (serviciosCount[label] || 0) + 1;
  });
  const serviciosItems = Object.entries(serviciosCount)
    .map(([etiqueta, valor]) => ({ etiqueta, valor }))
    .sort((a, b) => b.valor - a.valor);
  renderBarras(repServiciosEl, serviciosItems, v => `${v} cliente${v !== 1 ? 's' : ''}`);

  const productosCount = {};
  pedidosDia.forEach(p => {
    p.items.forEach(item => {
      if (!productosCount[item.nombre]) productosCount[item.nombre] = { cantidad: 0, total: 0 };
      productosCount[item.nombre].cantidad += item.cantidad;
      productosCount[item.nombre].total += item.subtotal;
    });
  });
  const productosItems = Object.entries(productosCount)
    .map(([etiqueta, data]) => ({ etiqueta, valor: data.cantidad, total: data.total }))
    .sort((a, b) => b.valor - a.valor);
  renderBarras(repProductosEl, productosItems, (v) => {
    const item = productosItems.find(i => i.valor === v);
    return `${v} und. · ${formatBsRep(item ? item.total : 0)}`;
  });

  const metodosCount = {};
  movimientosDia.filter(m => m.tipo === 'ingreso').forEach(m => {
    metodosCount[m.metodoPago] = (metodosCount[m.metodoPago] || 0) + m.monto;
  });
  const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', qr: 'QR' };
  const metodosItems = Object.entries(metodosCount)
    .map(([key, valor]) => ({ etiqueta: metodosLabel[key] || key, valor }))
    .sort((a, b) => b.valor - a.valor);
  renderBarras(repMetodosEl, metodosItems, formatBsRep);

  const movimientosOrdenados = movimientosDia.sort((a, b) => b.timestamp - a.timestamp);
  repContadorMovimientosEl.textContent = movimientosOrdenados.length;
  if (movimientosOrdenados.length === 0) {
    repListaMovimientosEl.innerHTML = '<p class="empty-state">Sin movimientos para esta fecha.</p>';
  } else {
    repListaMovimientosEl.innerHTML = movimientosOrdenados.map(m => `
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
            ${m.tipo === 'ingreso' ? '+' : '-'}${formatBsRep(m.monto)}
          </span>
        </div>
      </div>
    `).join('');
  }
}

repFechaInput.addEventListener('change', generarReporte);
