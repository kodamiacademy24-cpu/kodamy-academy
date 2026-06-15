// KODAMI RECURSOS — Carga dinámica desde API

const typeIcons = { juego:'⚔️', libro:'📚', video:'🎬', audio:'🎵', documento:'📄', imagen:'🖼️', embed:'🔗' };
const typeLabels = { juego:'Juego', libro:'Libro', video:'Video', audio:'Audio', documento:'Documento', imagen:'Imagen', embed:'Enlace' };
const embedIcons = { youtube:'🎬', geogebra:'📐', khanacademy:'📚', desmos:'📊' };

let recursos = [];
let currentMateria = 'matematicas';
let currentCat = 'all';
let currentResource = null;

const materiaInfo = {
  matematicas: { title:'Matemáticas', jp:'数学' },
  ciencias: { title:'Ciencias', jp:'科学' },
  historia: { title:'Historia', jp:'歴史' },
  geografia: { title:'Geografía', jp:'地理' },
  espanol: { title:'Español', jp:'言語' },
  arte: { title:'Arte', jp:'芸術' }
};

async function cargarRecursos() {
  try {
    const params = new URLSearchParams({ materia: currentMateria });
    if (currentCat !== 'all') params.set('tipo', currentCat);
    const q = document.getElementById('searchInput')?.value?.trim();
    if (q) params.set('q', q);
    const res = await fetch(`${API}/api/recursos?${params}`);
    const json = await res.json();
    recursos = json.success ? json.data : [];
  } catch {
    recursos = [];
  }
  renderRecursos();
}

function renderRecursos() {
  const grid = document.getElementById('resourcesGrid');
  const cs = document.getElementById('comingSoon');
  if (!grid) return;
  if (currentMateria !== 'matematicas') { grid.style.display = 'none'; if (cs) cs.classList.add('visible'); return; }
  if (cs) cs.classList.remove('visible');
  grid.style.display = 'grid';
  const data = recursos;
  if (!data.length) {
    const placeholders = [
      { id:0, titulo:'Álgebra Básica', tipo:'libro', tema:'Álgebra', descripcion:'Conceptos fundamentales de álgebra. ¡Sube este recurso!', nivel:1 },
      { id:0, titulo:'Fracciones', tipo:'juego', tema:'Aritmética', descripcion:'Practica fracciones con este juego interactivo.', nivel:1 },
      { id:0, titulo:'Geometría Sagrada', tipo:'video', tema:'Geometría', descripcion:'Explora formas y figuras geométricas.', nivel:2 }
    ];
    grid.innerHTML = placeholders.map((r, i) => `
      <div class="resource-card placeholder" style="animation-delay:${i*.06}s;opacity:.5;cursor:default;">
        <div class="card-thumb">
          <div class="card-icon">${typeIcons[r.tipo] || '📁'}</div>
          <span class="card-badge badge-${r.tipo}">${r.tipo.toUpperCase()}</span>
        </div>
        <div class="card-body">
          <div class="card-category">${typeLabels[r.tipo]} · ${r.tema}</div>
          <div class="card-title">${r.titulo}</div>
          <div class="card-desc">${r.descripcion}</div>
          <div class="card-footer">
            <div class="card-level">${[1,2,3].map(n => `<div class="level-dot ${n <= r.nivel ? 'active' : ''}"></div>`).join('')}</div>
            <button class="card-btn" style="pointer-events:none;opacity:.5;">▶ Ejemplo</button>
          </div>
        </div>
      </div>
    `).join('');
    return;
  }
  grid.innerHTML = data.map((r, i) => `
    <div class="resource-card" style="animation-delay:${i*.06}s" onclick="abrirRecurso(${r.id})">
      <div class="card-thumb${r.portada_url ? ' has-portada' : ''}">
        ${r.portada_url ? `<div class="card-portada" style="background-image:url('${API}/api/recurso/${r.id}/portada')"></div><div class="card-icon card-fallback">${typeIcons[r.tipo] || '📁'}</div>`
          : `<div class="card-icon">${typeIcons[r.tipo] || '📁'}</div>`}
        <span class="card-badge badge-${r.tipo}">${(r.tipo||'').toUpperCase()}</span>
      </div>
      <div class="card-body">
        <div class="card-category">${typeLabels[r.tipo] || r.tipo} · ${r.tema || ''}</div>
        <div class="card-title">${r.titulo}</div>
        <div class="card-desc">${r.descripcion || ''}</div>
        <div class="card-footer">
          <div class="card-level">${[1,2,3].map(n => `<div class="level-dot ${n <= (r.nivel||1) ? 'active' : ''}"></div>`).join('')}</div>
          <button class="card-btn" onclick="event.stopPropagation();abrirRecurso(${r.id})">▶ Abrir</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function abrirRecurso(id) {
  try {
    const res = await fetch(`${API}/api/recursos/${id}`);
    const json = await res.json();
    if (!json.success) return;
    mostrarVisor(json.data);
  } catch {}
}

async function mostrarVisor(r) {
  currentResource = r;
  const overlay = document.getElementById('modalOverlay') || crearModal();
  const title = document.getElementById('modalTitle');
  if (title) title.textContent = r.titulo;
  // Reset tabs: preview activo, download inactivo
  document.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  renderPreview(r);
  if (overlay) overlay.classList.add('open');
}

function cambiarVista(tab) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.textContent.includes(tab === 'preview' ? 'Vista' : 'Descargar')));
  if (tab === 'preview') renderPreview(currentResource);
  else renderDownload(currentResource);
}

function renderPreview(r) {
  const body = document.getElementById('modalBody');
  if (!body) return;
  const archivoUrl = `${API}/api/recurso/${r.id}/archivo`;
  body.style.overflow = r.tipo === 'video' || r.tipo === 'audio' || r.tipo === 'imagen' ? 'hidden' : 'hidden';

  // MODO EMBED: renderizar iframe con embed URL
  if (r.tipo === 'embed' || r.tipo === 'enlace') {
    body.style.overflow = 'hidden';
    body.innerHTML = embedIframe(r.extension, r.archivo_url, r.titulo);
    return;
  }

  if (r.tipo === 'video') {
    body.innerHTML = `<video controls autoplay style="width:100%;height:100%"><source src="${archivoUrl}" type="video/${r.extension}"></video>`;
  } else if (r.tipo === 'audio') {
    body.innerHTML = `<audio controls autoplay style="width:100%"><source src="${archivoUrl}" type="audio/${r.extension}"></audio>`;
  } else if (r.tipo === 'imagen') {
    body.innerHTML = `<img src="${archivoUrl}" alt="${r.titulo}" style="max-width:100%;max-height:100%;object-fit:contain;margin:auto;">`;
  } else if (r.tipo === 'juego' && r.extension === 'html') {
    body.innerHTML = `<iframe src="${archivoUrl}" sandbox="allow-scripts allow-same-origin" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
  } else if (r.tipo === 'juego' && r.extension === 'apk') {
    body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;padding:40px;gap:20px;"><div style="font-size:4rem">📱</div><p style="color:var(--ash);font-size:1rem">APK listo para descargar</p><a href="${archivoUrl}" download="${r.titulo}.apk" class="btn-primary"><span>⬇ Descargar APK</span></a></div>`;
  } else if (r.extension === 'pdf') {
    body.innerHTML = `<iframe src="https://docs.google.com/viewer?url=${encodeURIComponent(archivoUrl)}&embedded=true" style="width:100%;height:100%;border:none;"></iframe>`;
  } else {
    body.innerHTML = `<iframe src="${archivoUrl}" style="width:100%;height:100%;border:none;"></iframe>`;
  }
  if (r.extension === 'pptx' || r.extension === 'ppt') {
    body.innerHTML = `<iframe src="https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(archivoUrl)}" style="width:100%;height:100%;border:none;"></iframe>`;
  }
}

function embedIframe(ext, url, titulo) {
  if (ext === 'youtube') {
    const vid = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/)?.[1] || '';
    return vid ? `<iframe src="https://www.youtube.com/embed/${vid}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>` : `<iframe src="${url}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
  }
  if (ext === 'geogebra') {
    const id = url.match(/\/m\/([a-zA-Z0-9]+)/)?.[1] || url.match(/\/classic\/([a-zA-Z0-9]+)/)?.[1] || '';
    return id ? `<iframe src="https://www.geogebra.org/classic/embed/${id}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>` : `<iframe src="${url}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
  }
  if (ext === 'khanacademy') {
    return `<iframe src="${url}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
  }
  if (ext === 'desmos') {
    return `<iframe src="${url}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
  }
  return `<iframe src="${url}" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`;
}

function renderDownload(r) {
  const body = document.getElementById('modalBody');
  if (!body) return;
  body.style.overflow = 'auto';

  // EMBED: mostrar enlace externo en vez de descarga
  if (r.tipo === 'embed' || r.tipo === 'enlace') {
    body.innerHTML = `
      <div class="modal-download">
        <div class="download-icon">${embedIcons[r.extension] || typeIcons[r.tipo] || '🔗'}</div>
        <div class="download-info">
          <div class="download-label">Nombre</div>
          <div class="download-value">${r.titulo}</div>
          <div class="download-label">Tipo</div>
          <div class="download-value">${(r.extension||'').toUpperCase()} · ${typeLabels[r.tipo] || r.tipo}</div>
          <div class="download-label">URL</div>
          <div class="download-value" style="font-size:.75rem;word-break:break-all;">${r.archivo_url}</div>
        </div>
        <a href="${r.archivo_url}" target="_blank" rel="noopener" class="download-btn">
          <span>🔗 Abrir en nueva pestaña</span>
        </a>
      </div>
    `;
    return;
  }

  const archivoUrl = `${API}/api/recurso/${r.id}/archivo`;
  body.innerHTML = `
    <div class="modal-download">
      <div class="download-icon">${typeIcons[r.tipo] || '📄'}</div>
      <div class="download-info">
        <div class="download-label">Nombre</div>
        <div class="download-value">${r.titulo}</div>
        <div class="download-label">Tipo</div>
        <div class="download-value">${typeLabels[r.tipo] || r.tipo}</div>
        <div class="download-label">Extensión</div>
        <div class="download-value">.${r.extension}</div>
      </div>
      <a href="${archivoUrl}" download="${r.titulo}.${r.extension}" class="download-btn">
        <span>⬇ Descargar ${r.titulo}.${r.extension}</span>
      </a>
    </div>
  `;
}

function crearModal() {
  const div = document.createElement('div');
  div.id = 'modalOverlay';
  div.className = 'modal-overlay';
  div.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title" id="modalTitle">Recurso</div>
        <button class="modal-close" onclick="cerrarModal()">✕</button>
      </div>
      <div class="modal-tabs" id="modalTabs">
        <div class="modal-tab active" onclick="cambiarVista('preview')">👁 Vista Previa</div>
        <div class="modal-tab" onclick="cambiarVista('download')">⬇ Descargar</div>
      </div>
      <div class="modal-body" id="modalBody"></div>
    </div>
  `;
  document.body.appendChild(div);
  div.addEventListener('click', e => { if (e.target === div) cerrarModal(); });
  return div;
}
window.cerrarModal = () => {
  const m = document.getElementById('modalOverlay');
  if (m) m.classList.remove('open');
};

// Filtros
function filterCat(cat, el) {
  currentCat = cat;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  cargarRecursos();
}

function switchMateria(mat, el) {
  currentMateria = mat; currentCat = 'all';
  document.querySelectorAll('.materia-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.pill').forEach((p,i) => i===0 ? p.classList.add('active') : p.classList.remove('active'));
  const info = materiaInfo[mat] || { title: mat, jp: '' };
  const st = document.getElementById('sectionTitle'); if (st) st.textContent = info.title;
  const sj = document.getElementById('sectionJp'); if (sj) sj.textContent = info.jp;
  const cs = document.getElementById('comingSoon');
  if (mat !== 'matematicas') { if (cs) cs.classList.add('visible'); const g = document.getElementById('resourcesGrid'); if (g) g.style.display = 'none'; }
  else { if (cs) cs.classList.remove('visible'); cargarRecursos(); }
}

function applyFilters() { cargarRecursos(); }

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  cargarRecursos();
  // Cargar stats reales
  fetch(`${API}/api/stats`).then(r => r.json()).then(j => {
    if (j.success && j.data) {
      const total = document.querySelector('.stat-num[data-target]');
      if (total) total.dataset.target = j.data.total;
    }
  }).catch(() => {});
});
