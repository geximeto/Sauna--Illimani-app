/* Control de acceso por código compartido: "encargada" (todos los módulos)
   o "asistente" (solo Pedidos). No es un login robusto tipo banco, es un
   filtro simple para que el personal no entre por accidente a módulos
   que no le corresponden. */
const ROLE_KEY = 'sauna_role';

const loginGate = document.getElementById('login-gate');
const loginForm = document.getElementById('login-form');
const loginPinInput = document.getElementById('login-pin');
const loginErrorEl = document.getElementById('login-error');
const roleBadge = document.getElementById('role-badge');
const logoutBtn = document.getElementById('logout-btn');

const TABS_SOLO_ASISTENTE = ['pedidos'];

function getRole() {
  return localStorage.getItem(ROLE_KEY);
}

function ocultarGate() {
  loginGate.style.display = 'none';
}

function mostrarGate() {
  loginGate.style.display = 'flex';
  loginPinInput.value = '';
  loginPinInput.focus();
}

function aplicarRestriccionesDeRol(role) {
  const esAsistente = role === 'asistente';

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const permitido = !esAsistente || TABS_SOLO_ASISTENTE.includes(btn.dataset.tab);
    btn.style.display = permitido ? '' : 'none';
  });

  if (esAsistente) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'pedidos'));
    document.querySelectorAll('.tab-content').forEach(sec => sec.classList.toggle('active', sec.id === 'pedidos'));
  }

  roleBadge.style.display = 'inline-flex';
  roleBadge.textContent = esAsistente ? '👤 Asistente' : '👤 Encargada';
  logoutBtn.style.display = 'inline-flex';
}

async function intentarLogin(pin) {
  const backendUrl = (location.protocol === 'http:' || location.protocol === 'https:') ? location.origin : '';
  const res = await fetch(`${backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if (!res.ok) throw new Error('Código incorrecto');
  return res.json();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorEl.textContent = '';
  const pin = loginPinInput.value.trim();
  if (!pin) return;

  try {
    const { role } = await intentarLogin(pin);
    localStorage.setItem(ROLE_KEY, role);
    aplicarRestriccionesDeRol(role);
    ocultarGate();
    if (role === 'asistente' && typeof poblarSelectClientes === 'function') {
      poblarSelectClientes();
      poblarSelectProductos();
      cargarPedidos();
    }
  } catch (err) {
    loginErrorEl.textContent = err.message.includes('fetch')
      ? 'No se pudo conectar al servidor. Revisa tu internet.'
      : 'Código incorrecto, intenta de nuevo.';
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(ROLE_KEY);
  location.reload();
});

(function initAuth() {
  const role = getRole();
  if (role) {
    ocultarGate();
    aplicarRestriccionesDeRol(role);
  } else {
    mostrarGate();
  }
})();
