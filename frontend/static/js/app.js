/**
 * app.js — CemeteryBase User Frontend
 * Handles state/city dropdowns, search, results table, pagination, and CSV export.
 */

const API_BASE = '';   // Relative to same origin (Flask backend serves both)
const PAGE_SIZE = 50;

let currentPage = 0;
let currentTotal = 0;
let currentData = [];
let allStates = [];

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadStates();

  // Debounced search on text input
  document.getElementById('searchInput').addEventListener('input', debounce(() => {
    currentPage = 0;
    fetchCemeteries();
  }, 500));
});


// ─── STATS ────────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    document.getElementById('statTotal').textContent = data.total.toLocaleString();
    document.getElementById('statStates').textContent =
      (data.top_states || []).length;
    document.getElementById('statPhone').textContent =
      data.with_phone.toLocaleString();
  } catch (e) {
    console.warn('Stats load failed:', e);
  }
}


// ─── STATES / CITIES ──────────────────────────────────────────────────────────

async function loadStates() {
  try {
    const res = await fetch(`${API_BASE}/api/states`);
    const data = await res.json();
    allStates = data.states || [];
    const sel = document.getElementById('stateSelect');
    allStates.forEach(state => {
      const opt = document.createElement('option');
      opt.value = state;
      opt.textContent = state;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn('States load failed:', e);
  }
}


async function onStateChange() {
  const state = document.getElementById('stateSelect').value;
  const citySelect = document.getElementById('citySelect');
  citySelect.innerHTML = '<option value="">All Cities</option>';
  citySelect.disabled = true;

  if (!state) return;

  try {
    const res = await fetch(`${API_BASE}/api/cities?state=${encodeURIComponent(state)}`);
    const data = await res.json();
    (data.cities || []).forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      citySelect.appendChild(opt);
    });
    citySelect.disabled = false;
  } catch (e) {
    console.warn('Cities load failed:', e);
  }
}

// Hook into state dropdown change
document.getElementById('stateSelect').addEventListener('change', () => {
  onStateChange();
  currentPage = 0;
});
document.getElementById('citySelect').addEventListener('change', () => {
  currentPage = 0;
});
document.getElementById('typeSelect').addEventListener('change', () => {
  currentPage = 0;
});


// ─── FETCH CEMETERIES ─────────────────────────────────────────────────────────

async function fetchCemeteries() {
  const state = document.getElementById('stateSelect').value;
  const city = document.getElementById('citySelect').value;
  const search = document.getElementById('searchInput').value.trim();
  const type = document.getElementById('typeSelect').value;

  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (city && city !== "All Cities") {
    params.set('city', city);
  }
  if (search) params.set('search', search);
  if (type) params.set('type', type);
  params.set('limit', PAGE_SIZE);
  params.set('skip', currentPage * PAGE_SIZE);

  showLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/cemeteries?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    currentTotal = data.total;
    currentData = data.data;

    renderTable(data.data);
    renderPagination(data.total, data.skip, data.limit);
    updateResultsHeader(data.total, data.skip, data.limit);
  } catch (e) {
    console.error('Fetch error:', e);
    showError('Failed to load data. Is the backend running?');
  } finally {
    showLoading(false);
  }
}

function changePage(delta) {
  const totalPages = Math.ceil(currentTotal / PAGE_SIZE);
  const newPage = currentPage + delta;
  if (newPage < 0 || newPage >= totalPages) return;
  currentPage = newPage;
  fetchCemeteries();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ─── RENDER TABLE ─────────────────────────────────────────────────────────────

function renderTable(cemeteries) {
  const tbody = document.getElementById('tableBody');
  const tableWrap = document.getElementById('tableWrap');
  const emptyState = document.getElementById('emptyState');
  const noResults = document.getElementById('noResults');

  emptyState.style.display = 'none';

  if (!cemeteries || cemeteries.length === 0) {
    tableWrap.style.display = 'none';
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';
  tableWrap.style.display = 'block';

  tbody.innerHTML = cemeteries.map(c => `
    <tr onclick="openDetail('${c._id}')">
      <td class="name-cell" title="${esc(c.name)}">${esc(c.name) || '—'}</td>
      <td title="${esc(c.address)}">${esc(c.address) || '—'}</td>
      <td>${esc(c.city) || '—'}</td>
      <td>${esc(c.county) || '—'}</td>
      <td>${esc(c.state) || '—'}</td>
      <td>${esc(c.zip_code) || '—'}</td>
      <td><span class="badge badge-${c.type || 'unknown'}">${c.type || 'unknown'}</span></td>
      <td>${c.phone ? `<a href="tel:${c.phone}" onclick="event.stopPropagation()">${esc(c.phone)}</a>` : '—'}</td>
      <td>${c.website ? `<a href="${c.website}" target="_blank" onclick="event.stopPropagation()">Visit →</a>` : '—'}</td>
      <td title="${esc(c.opening_hours)}">${c.opening_hours ? '✓' : '—'}</td>
      <td><span class="source-badge ${sourceClass(c.data_source)}">${esc(c.data_source) || 'OSM'}</span></td>
    </tr>
  `).join('');
}


// ─── DETAIL MODAL ─────────────────────────────────────────────────────────────

async function openDetail(id) {
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('modalContent');
  modal.classList.add('open');
  content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';

  try {
    const res = await fetch(`${API_BASE}/api/cemeteries/${id}`);
    const c = await res.json();

    const mapsUrl = c.latitude && c.longitude
      ? `https://www.google.com/maps?q=${c.latitude},${c.longitude}`
      : null;

    content.innerHTML = `
      <div class="detail-name">${esc(c.name)}</div>
      <div class="detail-location">
        ${[c.address, c.city, c.county, c.state, c.zip_code].filter(Boolean).join(', ')}
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-key">Type</span>
          <span class="detail-val"><span class="badge badge-${c.type || 'unknown'}">${c.type || 'unknown'}</span></span>
        </div>
        <div class="detail-item">
          <span class="detail-key">Data Source</span>
          <span class="detail-val"><span class="source-badge ${sourceClass(c.data_source)}">${c.data_source || 'OSM'}</span></span>
        </div>
        <div class="detail-item">
          <span class="detail-key">Phone</span>
          <span class="detail-val">${c.phone ? `<a href="tel:${c.phone}">${esc(c.phone)}</a>` : '—'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-key">Website</span>
          <span class="detail-val">${c.website ? `<a href="${esc(c.website)}" target="_blank">${esc(c.website)}</a>` : '—'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-key">Latitude</span>
          <span class="detail-val">${c.latitude || '—'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-key">Longitude</span>
          <span class="detail-val">${c.longitude || '—'}</span>
        </div>
        ${c.opening_hours ? `
        <div class="detail-item detail-full">
          <span class="detail-key">Opening Hours</span>
          <span class="detail-val">${esc(c.opening_hours)}</span>
        </div>` : ''}
        ${c.notes ? `
        <div class="detail-item detail-full">
          <span class="detail-key">Notes</span>
          <span class="detail-val">${esc(c.notes)}</span>
        </div>` : ''}
      </div>

      ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" class="detail-map-link">🗺 View on Google Maps</a>` : ''}
    `;
  } catch (e) {
    content.innerHTML = '<p style="color:var(--red)">Failed to load details.</p>';
  }
}

function closeModal(event) {
  if (event && event.target !== document.getElementById('detailModal')) return;
  document.getElementById('detailModal').classList.remove('open');
}


// ─── UI HELPERS ───────────────────────────────────────────────────────────────

function showLoading(show) {
  document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
  document.getElementById('tableWrap').style.display = show ? 'none' : (currentData.length > 0 ? 'block' : 'none');
  document.getElementById('emptyState').style.display = 'none';
  if (!show && currentData.length === 0) {
    document.getElementById('emptyState').style.display = 'block';
  }
  document.getElementById('fetchBtn').disabled = show;
  document.querySelector('#fetchBtn .btn-text').textContent = show ? 'Searching...' : 'Search';
}

function showError(msg) {
  const empty = document.getElementById('emptyState');
  empty.style.display = 'block';
  empty.innerHTML = `<div class="empty-icon">⚠</div><p>${msg}</p>`;
}

function updateResultsHeader(total, skip, limit) {
  const header = document.getElementById('resultsHeader');
  const count = document.getElementById('resultsCount');
  const from = skip + 1;
  const to = Math.min(skip + limit, total);
  header.style.display = total > 0 ? 'flex' : 'none';
  count.innerHTML = `Showing <strong>${from}–${to}</strong> of <strong>${total.toLocaleString()}</strong> cemeteries`;
}

function renderPagination(total, skip, limit) {
  const pages = document.getElementById('pagination');
  const info = document.getElementById('pageInfo');
  const prev = document.getElementById('prevBtn');
  const next = document.getElementById('nextBtn');

  if (total <= limit) {
    pages.style.display = 'none';
    return;
  }

  pages.style.display = 'flex';
  const totalPages = Math.ceil(total / limit);
  const current = Math.floor(skip / limit) + 1;
  info.textContent = `Page ${current} of ${totalPages}`;
  prev.disabled = current === 1;
  next.disabled = current === totalPages;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sourceClass(source) {
  if (!source) return 'source-osm';
  const s = source.toLowerCase();
  if (s.includes('google')) return 'source-google';
  if (s.includes('nominatim')) return 'source-nominatim';
  if (s.includes('+') || s.includes('mixed')) return 'source-mixed';
  return 'source-osm';
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

async function exportCSV() {
  const state = document.getElementById('stateSelect').value;
  const city = document.getElementById('citySelect').value;
  const search = document.getElementById('searchInput').value.trim();
  const type = document.getElementById('typeSelect').value;

  // Fetch all matching records for export (up to 2000)
  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (city && city !== "") {
    params.set('city', city);
}
  if (search) params.set('search', search);
  if (type) params.set('type', type);
  params.set('limit', 2000);
  params.set('skip', 0);

  try {
    const res = await fetch(`${API_BASE}/api/cemeteries?${params.toString()}`);
    const data = await res.json();
    downloadCSV(data.data, 'cemeteries_export.csv');
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}

function downloadCSV(records, filename) {
  const headers = [
    'Name', 'Address', 'City', 'County', 'State', 'ZIP',
    'Latitude', 'Longitude', 'Phone', 'Website', 'Opening Hours',
    'Type', 'Data Source', 'Notes'
  ];
  const rows = records.map(c => [
    c.name, c.address, c.city, c.county, c.state, c.zip_code,
    c.latitude, c.longitude, c.phone, c.website, c.opening_hours,
    c.type, c.data_source, c.notes
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`));

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
