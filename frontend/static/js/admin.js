/**
 * admin.js — CemeteryBase Admin Dashboard
 * Stats, cemetery table, data collection.
 */

const API_BASE = '';
let adminCurrentPage = 0;
let adminTotal = 0;
let adminStates = [];

document.addEventListener('DOMContentLoaded', () => {
  loadAdminStates();
  loadStats();
  
  // Tab switching
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      switchTab(tab);
    });
  });

  // Event listeners
  document.getElementById('adminStateSelect').addEventListener('change', loadAdminCities);
  document.getElementById('adminCitySelect').addEventListener('change', () => { adminCurrentPage = 0; });
  document.getElementById('adminSearch').addEventListener('input', debounce(() => { adminCurrentPage = 0; loadAdminCemeteries(); }, 500));
});

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  event.target.closest('.sidebar-link').classList.add('active');
  
  if (tabName === 'overview') loadStats();
  if (tabName === 'cemeteries') loadAdminCemeteries();
  if (tabName === 'collect') loadCollectStates();
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    
    document.getElementById('sTotalCemeteries').textContent = data.total?.toLocaleString() || 0;
    document.getElementById('sWithPhone').textContent = data.with_phone?.toLocaleString() || 0;
    document.getElementById('sWithWebsite').textContent = data.with_website?.toLocaleString() || 0;
    document.getElementById('sWithHours').textContent = data.with_hours?.toLocaleString() || 0;
  } catch (e) {
    console.error('Stats failed:', e);
  }
}

async function loadAdminStates() {
  try {
    const res = await fetch(`${API_BASE}/api/states`);
    const data = await res.json();
    adminStates = data.states || [];
    
    const select = document.getElementById('adminStateSelect');
    select.innerHTML = '<option value="">All States</option>';
    adminStates.forEach(state => {
      const opt = document.createElement('option');
      opt.value = state;
      opt.textContent = state;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('States failed:', e);
  }
}

async function loadAdminCities() {
  const state = document.getElementById('adminStateSelect').value;
  const citySelect = document.getElementById('adminCitySelect');
  citySelect.innerHTML = '<option value="">All Cities</option>';
  
  if (!state) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/cities?state=${encodeURIComponent(state)}`);
    const data = await res.json();
    data.cities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      citySelect.appendChild(opt);
    });
  } catch (e) {
    console.error('Cities failed:', e);
  }
}

async function loadAdminCemeteries() {
  const state = document.getElementById('adminStateSelect').value;
  const city = document.getElementById('adminCitySelect').value;
  const search = document.getElementById('adminSearch').value.trim();

  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (city) params.set('city', city);
  if (search) params.set('search', search);
  params.set('limit', 50);
  params.set('skip', adminCurrentPage * 50);

  document.getElementById('adminLoading').style.display = 'flex';

  try {
    const res = await fetch(`${API_BASE}/api/cemeteries?${params}`);
    const data = await res.json();
    
    adminTotal = data.total;
    renderAdminTable(data.data);
    renderAdminPagination(data.total, data.skip, data.limit);
  } catch (e) {
    console.error('Admin table failed:', e);
  } finally {
    document.getElementById('adminLoading').style.display = 'none';
  }
}

function renderAdminTable(cemeteries) {
  const tbody = document.getElementById('adminTableBody');
  tbody.innerHTML = cemeteries.map(c => `
    <tr>
      <td class="name-cell">
        ${esc(c.name)}
        <br><small>
          <a href="https://www.google.com/maps?q=${(c.latitude || 0).toFixed(4)},${(c.longitude || 0).toFixed(4)}" 
             target="_blank" style="color: #c9a84c; font-size: 12px;">
            📍 View on Map
          </a>
        </small>
      </td>
      <td>${esc(c.city) || '—'}</td>
      <td><span class="badge badge-${c.state?.toLowerCase()}">${esc(c.state)}</span></td>
      <td><span class="badge badge-${c.type || 'unknown'}">${c.type || 'unknown'}</span></td>
      <td>${c.phone ? `<a href="tel:${c.phone}">${esc(c.phone)}</a>` : '—'}</td>
      <td><span class="source-badge source-${c.data_source?.toLowerCase().replace(' ', '-')}">${esc(c.data_source)}</span></td>
      <td>
        <button class="btn-sm btn-ghost" onclick="editCemetery('${c._id}')">Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteCemetery('${c._id}', '${esc(c.name)}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderAdminPagination(total, skip, limit) {
  const pages = document.getElementById('adminPagination');
  const info = document.getElementById('adminPageInfo');
  const prev = document.getElementById('adminPrevBtn');
  const next = document.getElementById('adminNextBtn');

  if (total <= limit) {
    pages.style.display = 'none';
    return;
  }

  pages.style.display = 'flex';
  const current = Math.floor(skip / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  info.textContent = `Page ${current} of ${totalPages}`;
  prev.disabled = current === 1;
  next.disabled = current === totalPages;
}

function adminChangePage(delta) {
  const totalPages = Math.ceil(adminTotal / 50);
  const newPage = adminCurrentPage + delta;
  if (newPage < 0 || newPage >= totalPages) return;
  adminCurrentPage = newPage;
  loadAdminCemeteries();
}

async function triggerCollection() {
  const state = document.getElementById('collectState').value;
  const enrich = document.getElementById('enrichToggle').checked;
  
  if (!state) {
    alert('Select a state');
    return;
  }

  const log = document.getElementById('collectionLog');
  log.innerHTML += `<div>[${new Date().toLocaleTimeString()}] Starting collection for ${state} (enrich: ${enrich})...</div>`;
  log.scrollTop = log.scrollHeight;

  try {
    const res = await fetch('/api/collect', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({state, enrich})
    });
    const data = await res.json();
    
    log.innerHTML += `<div style="color: #4ade80;">[SUCCESS] Fetched ${data.fetched}, inserted ${data.inserted}, skipped ${data.skipped}</div>`;
    loadStats(); // Refresh stats
  } catch (e) {
    log.innerHTML += `<div style="color: #f87171;">[ERROR] ${e.message}</div>`;
  }
  log.scrollTop = log.scrollHeight;
}

async function loadCollectStates() {
  loadAdminStates().then(() => {
    const select = document.getElementById('collectState');
    select.innerHTML = '<option value="">Choose a state...</option>';
    adminStates.forEach(state => {
      const opt = document.createElement('option');
      opt.value = state;
      opt.textContent = state;
      select.appendChild(opt);
    });
  });
}

async function editCemetery(id) {
  try {
    const res = await fetch(`/api/cemeteries/${id}`);
    const cemetery = await res.json();
    showEditModal(cemetery);
  } catch (e) {
    alert('Failed to load cemetery');
  }
}

async function deleteCemetery(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await fetch(`/api/cemeteries/${id}`, {method: 'DELETE'});
    loadAdminCemeteries();
  } catch (e) {
    alert('Delete failed');
  }
}

function showEditModal(cemetery) {
  const modal = document.getElementById('editModal');
  const form = document.getElementById('editForm');
  
  form.innerHTML = `
    <input type="hidden" id="editId" value="${cemetery._id}">
    <div class="field-group"><label>Name</label><input type="text" id="editName" class="input-field" value="${esc(cemetery.name)}"></div>
    <div class="field-group"><label>Phone</label><input type="text" id="editPhone" class="input-field" value="${esc(cemetery.phone || '')}"></div>
    <div class="field-group"><label>Website</label><input type="url" id="editWebsite" class="input-field" value="${esc(cemetery.website || '')}"></div>
    <div class="field-group"><label>Notes</label><textarea id="editNotes" class="input-field">${esc(cemetery.notes || '')}</textarea></div>
  `;
  
  modal.classList.add('open');
}

async function saveEdit() {
  const id = document.getElementById('editId').value;
  const updates = {
    name: document.getElementById('editName').value,
    phone: document.getElementById('editPhone').value,
    website: document.getElementById('editWebsite').value,
    notes: document.getElementById('editNotes').value
  };
  
  try {
    await fetch(`/api/cemeteries/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updates)
    });
    closeEditModal();
    loadAdminCemeteries();
  } catch (e) {
    alert('Save failed');
  }
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function exportAdminCSV() {
  const params = new URLSearchParams();
  params.set('limit', 10000); // Large export
  window.open(`/api/cemeteries?${params.toString()}&export=csv`);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

