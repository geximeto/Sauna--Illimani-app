const CATEGORIAS_LABEL = {
  amenities: 'Amenities',
  bebidas: 'Bebidas',
  snacks: 'Snacks',
  limpieza: 'Limpieza',
  insumos_spa: 'Insumos de Spa',
  otros: 'Otros'
};

const invForm = document.getElementById('inventario-form');
const invIdInput = document.getElementById('prod-id');
const invFormTitle = document.getElementById('inv-form-title');
const invSubmitBtn = document.getElementById('inv-submit-btn');
const invCancelBtn = document.getElementById('inv-cancel-btn');
const listaProductosEl = document.getElementById('lista-productos');
const contadorProductosEl = document.getElementById('contador-productos');
const buscarProductoInput = document.getElementById('buscar-producto');
const filtroCategoriaSelect = document.getElementById('filtro-categoria');
const filtroBajoStockCheck = document.getElementById('filtro-bajo-stock');

let productosCache = [];
let filtroProductoTexto = '';
let filtroProductoCategoria = '';
let filtroSoloBajoStock = false;

function esBajoStock(p) {
  return p.stock <= p.stockMinimo;
}

async function cargarProductos() {
  const todos = await getAllProductos();
  productosCache = todos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  renderProductos();
}

function renderProductos() {
  let filtrados = productosCache;

  if (filtroProductoTexto.trim()) {
    const texto = filtroProductoTexto.trim().toLowerCase();
    filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(texto));
  }
  if (filtroProductoCategoria) {
    filtrados = filtrados.filter(p => p.categoria === filtroProductoCategoria);
  }
  if (filtroSoloBajoStock) {
    filtrados = filtrados.filter(esBajoStock);
  }

  contadorProductosEl.textContent = productosCache.length;

  if (filtrados.length === 0) {
    listaProductosEl.innerHTML = `<p class="empty-state">${productosCache.length === 0 ? 'No hay productos registrados aún.' : 'No se encontraron productos.'}</p>`;
    return;
  }

  listaProductosEl.innerHTML = filtrados.map(p => {
    const bajoStock = esBajoStock(p);
    return `
    <div class="client-item ${bajoStock ? 'vencido' : ''}" data-id="${p.id}">
      <div class="client-info">
        <div class="client-name">${escapeHtml(p.nombre)}</div>
        <div class="client-meta">
          <span class="service-tag">${CATEGORIAS_LABEL[p.categoria] || p.categoria}</span>
          <span class="time-badge ${bajoStock ? 'vencido' : ''}">${p.stock} ${escapeHtml(p.unidad || 'unidades')}</span>
          <span>Mínimo: ${p.stockMinimo}</span>
          ${p.precio ? `<span>Bs. ${Number(p.precio).toFixed(2)}</span>` : ''}
          ${bajoStock ? '<span style="color:var(--danger);font-weight:700;">⚠ Bajo stock</span>' : ''}
        </div>
      </div>
      <div class="client-actions">
        <button class="btn-icon" title="Restar 1" data-action="restar" data-id="${p.id}">−</button>
        <button class="btn-icon" title="Sumar 1" data-action="sumar" data-id="${p.id}">+</button>
        <button class="btn-icon" title="Editar" data-action="editar" data-id="${p.id}">✎</button>
        <button class="btn-icon btn-salida" title="Eliminar" data-action="eliminar" data-id="${p.id}">🗑</button>
      </div>
    </div>
  `;
  }).join('');
}

function resetFormularioProducto() {
  invForm.reset();
  invIdInput.value = '';
  document.getElementById('prod-stock').value = 0;
  document.getElementById('prod-unidad').value = 'unidades';
  document.getElementById('prod-stock-min').value = 5;
  document.getElementById('prod-precio').value = 0;
  invFormTitle.textContent = 'Nuevo Producto';
  invSubmitBtn.textContent = 'Agregar Producto';
  invCancelBtn.style.display = 'none';
}

invForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = document.getElementById('prod-nombre').value.trim();
  const categoria = document.getElementById('prod-categoria').value;
  const stock = Number(document.getElementById('prod-stock').value);
  const unidad = document.getElementById('prod-unidad').value.trim() || 'unidades';
  const stockMinimo = Number(document.getElementById('prod-stock-min').value);
  const precio = Number(document.getElementById('prod-precio').value) || 0;
  const idEditando = invIdInput.value;

  if (!nombre || !categoria) {
    mostrarToast('Completa los campos requeridos', 'error');
    return;
  }

  try {
    if (idEditando) {
      const producto = productosCache.find(p => p.id === Number(idEditando));
      Object.assign(producto, { nombre, categoria, stock, unidad, stockMinimo, precio, synced: false, updatedAt: Date.now() });
      await updateProducto(producto);
      mostrarToast(`✏️ ${nombre} actualizado`);
    } else {
      const producto = { uuid: generateUuid(), nombre, categoria, stock, unidad, stockMinimo, precio, synced: false, updatedAt: Date.now() };
      await addProducto(producto);
      mostrarToast(`✅ ${nombre} agregado al inventario`);
    }
    resetFormularioProducto();
    await cargarProductos();
  } catch (err) {
    console.error(err);
    mostrarToast('Error al guardar producto', 'error');
  }
});

invCancelBtn.addEventListener('click', resetFormularioProducto);

listaProductosEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const producto = productosCache.find(p => p.id === id);
  if (!producto) return;
  const accion = btn.dataset.action;

  if (accion === 'sumar' || accion === 'restar') {
    const delta = accion === 'sumar' ? 1 : -1;
    producto.stock = Math.max(0, producto.stock + delta);
    producto.synced = false;
    producto.updatedAt = Date.now();
    await updateProducto(producto);
    await cargarProductos();
    return;
  }

  if (accion === 'editar') {
    invIdInput.value = producto.id;
    document.getElementById('prod-nombre').value = producto.nombre;
    document.getElementById('prod-categoria').value = producto.categoria;
    document.getElementById('prod-stock').value = producto.stock;
    document.getElementById('prod-unidad').value = producto.unidad;
    document.getElementById('prod-stock-min').value = producto.stockMinimo;
    document.getElementById('prod-precio').value = producto.precio;
    invFormTitle.textContent = 'Editar Producto';
    invSubmitBtn.textContent = 'Guardar Cambios';
    invCancelBtn.style.display = 'block';
    document.getElementById('prod-nombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (accion === 'eliminar') {
    if (!confirm(`¿Eliminar "${producto.nombre}" del inventario?`)) return;
    await deleteProducto(id);
    mostrarToast(`🗑 ${producto.nombre} eliminado`);
    await cargarProductos();
  }
});

buscarProductoInput.addEventListener('input', (e) => {
  filtroProductoTexto = e.target.value;
  renderProductos();
});

filtroCategoriaSelect.addEventListener('change', (e) => {
  filtroProductoCategoria = e.target.value;
  renderProductos();
});

filtroBajoStockCheck.addEventListener('change', (e) => {
  filtroSoloBajoStock = e.target.checked;
  renderProductos();
});
