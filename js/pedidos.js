const pedidoForm = document.getElementById('pedido-form');
const pedidoClienteSelect = document.getElementById('pedido-cliente');
const pedidoProductoSelect = document.getElementById('pedido-producto');
const pedidoCantidadInput = document.getElementById('pedido-cantidad');
const pedidoAddItemBtn = document.getElementById('pedido-add-item-btn');
const pedidoCarritoEl = document.getElementById('pedido-carrito');
const pedidoTotalEl = document.getElementById('pedido-total');
const listaPedidosEl = document.getElementById('lista-pedidos');
const contadorPedidosEl = document.getElementById('contador-pedidos');
const filtroPedidosPendientesCheck = document.getElementById('filtro-pedidos-pendientes');

let carrito = [];
let pedidosCache = [];
let filtroSoloPendientes = false;

function formatBs(num) {
  return `Bs. ${Number(num).toFixed(2)}`;
}

async function poblarSelectClientes() {
  const todos = await getAllClientes();
  const activos = todos.filter(c => c.estado === 'activo').sort((a, b) => b.timestamp - a.timestamp);
  const valorActual = pedidoClienteSelect.value;
  pedidoClienteSelect.innerHTML = '<option value="" disabled selected>Selecciona un cliente</option>' +
    activos.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  if (activos.some(c => String(c.id) === valorActual)) {
    pedidoClienteSelect.value = valorActual;
  }
}

async function poblarSelectProductos() {
  const productos = await getAllProductos();
  const disponibles = productos.filter(p => p.stock > 0).sort((a, b) => a.nombre.localeCompare(b.nombre));
  pedidoProductoSelect.innerHTML = '<option value="" disabled selected>Selecciona un producto</option>' +
    disponibles.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (${p.stock} ${escapeHtml(p.unidad || '')}) - ${formatBs(p.precio)}</option>`).join('');
}

function renderCarrito() {
  if (carrito.length === 0) {
    pedidoCarritoEl.innerHTML = '<p class="empty-state">Aún no agregaste productos.</p>';
    pedidoTotalEl.textContent = formatBs(0);
    return;
  }

  pedidoCarritoEl.innerHTML = carrito.map((item, idx) => `
    <div class="carrito-item" data-idx="${idx}">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${escapeHtml(item.nombre)}</span>
        <span class="carrito-item-detalle">${item.cantidad} x ${formatBs(item.precioUnitario)}</span>
      </div>
      <div class="carrito-item-right">
        <span class="carrito-item-subtotal">${formatBs(item.subtotal)}</span>
        <button type="button" class="btn-icon btn-salida" data-action="quitar-item" data-idx="${idx}">✕</button>
      </div>
    </div>
  `).join('');

  const total = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  pedidoTotalEl.textContent = formatBs(total);
}

pedidoAddItemBtn.addEventListener('click', async () => {
  const productoId = Number(pedidoProductoSelect.value);
  const cantidad = Number(pedidoCantidadInput.value);

  if (!productoId) {
    mostrarToast('Selecciona un producto', 'error');
    return;
  }
  if (!cantidad || cantidad < 1) {
    mostrarToast('Cantidad inválida', 'error');
    return;
  }

  const productos = await getAllProductos();
  const producto = productos.find(p => p.id === productoId);
  if (!producto) return;

  const yaEnCarrito = carrito.find(i => i.productoId === productoId);
  const cantidadTotal = (yaEnCarrito ? yaEnCarrito.cantidad : 0) + cantidad;

  if (cantidadTotal > producto.stock) {
    mostrarToast(`Stock insuficiente. Disponible: ${producto.stock}`, 'error');
    return;
  }

  if (yaEnCarrito) {
    yaEnCarrito.cantidad = cantidadTotal;
    yaEnCarrito.subtotal = yaEnCarrito.cantidad * yaEnCarrito.precioUnitario;
  } else {
    carrito.push({
      productoId,
      nombre: producto.nombre,
      cantidad,
      precioUnitario: producto.precio || 0,
      subtotal: cantidad * (producto.precio || 0)
    });
  }

  pedidoProductoSelect.value = '';
  pedidoCantidadInput.value = 1;
  renderCarrito();
});

pedidoCarritoEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="quitar-item"]');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  carrito.splice(idx, 1);
  renderCarrito();
});

pedidoForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const clienteId = Number(pedidoClienteSelect.value);
  if (!clienteId) {
    mostrarToast('Selecciona un cliente', 'error');
    return;
  }
  if (carrito.length === 0) {
    mostrarToast('Agrega al menos un producto', 'error');
    return;
  }

  const clientes = await getAllClientes();
  const cliente = clientes.find(c => c.id === clienteId);
  if (!cliente || cliente.estado !== 'activo') {
    mostrarToast('El cliente ya no está activo', 'error');
    return;
  }

  const productos = await getAllProductos();
  for (const item of carrito) {
    const producto = productos.find(p => p.id === item.productoId);
    if (!producto || producto.stock < item.cantidad) {
      mostrarToast(`Stock insuficiente para ${item.nombre}`, 'error');
      return;
    }
  }

  const total = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  const notas = document.getElementById('pedido-notas').value.trim();

  const pedido = {
    uuid: generateUuid(),
    clienteId,
    clienteUuid: cliente.uuid,
    clienteNombre: cliente.nombre,
    items: carrito.map(i => ({ ...i })),
    total,
    notas,
    estado: 'pendiente',
    pagado: false,
    timestamp: Date.now(),
    synced: false,
    updatedAt: Date.now()
  };

  try {
    await addPedido(pedido);

    for (const item of carrito) {
      const producto = productos.find(p => p.id === item.productoId);
      producto.stock -= item.cantidad;
      producto.synced = false;
      producto.updatedAt = Date.now();
      await updateProducto(producto);
    }

    mostrarToast(`✅ Pedido registrado para ${cliente.nombre}`);
    carrito = [];
    pedidoForm.reset();
    renderCarrito();
    await poblarSelectClientes();
    await poblarSelectProductos();
    await cargarPedidos();
    if (typeof cargarProductos === 'function') await cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al registrar el pedido', 'error');
  }
});

async function cargarPedidos() {
  const todos = await getAllPedidos();
  pedidosCache = todos.sort((a, b) => b.timestamp - a.timestamp);
  renderPedidos();
}

function renderPedidos() {
  let filtrados = pedidosCache;
  if (filtroSoloPendientes) {
    filtrados = filtrados.filter(p => p.estado === 'pendiente');
  }

  contadorPedidosEl.textContent = pedidosCache.filter(p => p.estado === 'pendiente').length;

  if (filtrados.length === 0) {
    listaPedidosEl.innerHTML = `<p class="empty-state">${pedidosCache.length === 0 ? 'No hay pedidos registrados aún.' : 'No hay pedidos pendientes.'}</p>`;
    return;
  }

  listaPedidosEl.innerHTML = filtrados.map(p => {
    const itemsTexto = p.items.map(i => `${i.cantidad}x ${escapeHtml(i.nombre)}`).join(', ');
    const pendiente = p.estado === 'pendiente';
    return `
    <div class="client-item ${pendiente ? 'alerta' : ''}" data-id="${p.id}">
      <div class="client-info">
        <div class="client-name">${escapeHtml(p.clienteNombre)}</div>
        <div class="client-meta">
          <span class="service-tag">${itemsTexto}</span>
          <span>⏱ ${formatHora(new Date(p.timestamp))}</span>
          <span class="time-badge ${pendiente ? 'alerta' : ''}">${pendiente ? 'Pendiente' : 'Entregado'}</span>
          <span class="time-badge ${p.pagado ? '' : 'vencido'}">${p.pagado ? 'Pagado' : 'Sin pagar'}</span>
          <span style="font-weight:700;">${formatBs(p.total)}</span>
        </div>
      </div>
      <div class="client-actions">
        ${pendiente ? `<button class="btn-icon btn-salida" title="Marcar entregado" data-action="entregar" data-id="${p.id}">✔</button>` : ''}
      </div>
    </div>
  `;
  }).join('');
}

listaPedidosEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="entregar"]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const pedido = pedidosCache.find(p => p.id === id);
  if (!pedido) return;

  pedido.estado = 'entregado';
  pedido.synced = false;
  pedido.updatedAt = Date.now();
  await updatePedido(pedido);
  mostrarToast(`✔ Pedido de ${pedido.clienteNombre} entregado`);
  await cargarPedidos();
});

filtroPedidosPendientesCheck.addEventListener('change', (e) => {
  filtroSoloPendientes = e.target.checked;
  renderPedidos();
});
