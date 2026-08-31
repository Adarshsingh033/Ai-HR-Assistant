/* ========================================================
   utils.js – Shared helpers used across all pages
   ======================================================== */

const API = 'http://192.168.5.154:8000';

/* ── Theme (Dark / Light) ─────────────────────────────── */
function initTheme() {
    const saved = localStorage.getItem('recruit_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    _updateThemeButtons(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('recruit_theme', next);
    _updateThemeButtons(next);
}

function _updateThemeButtons(theme) {
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        const icon = btn.querySelector('.toggle-icon');
        const label = btn.querySelector('.toggle-label');
        if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
        if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
    });
}

// Apply theme as early as possible (before full DOM load)
(function () {
    const t = localStorage.getItem('recruit_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
})();

/* ── Session ──────────────────────────────────────────── */
const Session = {
    set(data) { localStorage.setItem('recruit_session', JSON.stringify(data)); },
    get() { try { return JSON.parse(localStorage.getItem('recruit_session')) || null; } catch { return null; } },
    clear() { localStorage.removeItem('recruit_session'); },
    require(expectedRole) {
        const s = this.get();
        if (!s) { location.href = '/'; return null; }
        if (expectedRole && s.role !== expectedRole) { location.href = '/'; return null; }
        return s;
    },
};

/* ── Toast notifications ──────────────────────────────── */
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '<i class="fa-solid fa-circle-check"></i>', error: '<i class="fa-solid fa-circle-xmark"></i>', info: '<i class="fa-solid fa-circle-info"></i>', warning: '<i class="fa-solid fa-triangle-exclamation"></i>' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || '<i class="fa-solid fa-circle-info"></i>'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/* ── API helper ───────────────────────────────────────── */
async function apiRequest(method, path, body = null, isFormData = false) {
    const s = Session.get();
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' };

    // Inject user_id if logged in
    if (s && s.user_id) {
        headers['X-Admin-ID'] = s.user_id;
    }

    const opts = {
        method,
        headers,
        body: body ? (isFormData ? body : JSON.stringify(body)) : null,
    };
    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
}

/* ── Loading state on buttons ─────────────────────────── */
function setLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn.classList.add('loading');
    } else {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

/* ── Modal helpers ───────────────────────────────────── */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/* ── Tag input (skills) ──────────────────────────────── */
function initTagInput(wrapperId, inputId, storageArray) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (['Enter', ',', 'Tab'].includes(e.key)) {
            e.preventDefault();
            const val = input.value.trim().replace(/,/g, '');
            if (val && !storageArray.includes(val)) {
                storageArray.push(val);
                renderTags(wrapperId, inputId, storageArray);
            }
            input.value = '';
        }
    });
}

function renderTags(wrapperId, inputId, storageArray) {
    const wrap = document.getElementById(wrapperId);
    const input = document.getElementById(inputId);
    const existing = wrap.querySelectorAll('.tag');
    existing.forEach(t => t.remove());
    storageArray.forEach((tag, i) => {
        const el = document.createElement('span');
        el.className = 'tag';
        el.innerHTML = `${tag}<button onclick="removeTag(${i},'${wrapperId}','${inputId}')" type="button">×</button>`;
        wrap.insertBefore(el, input);
    });
}

function removeTag(index, wrapperId, inputId) {
    // Resolved in page-level code via closure
}

/* ── Format date ─────────────────────────────────────── */
function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Logout ──────────────────────────────────────────── */
function logout() {
    if (window.confirm('Are you sure you want to logout?')) {
        Session.clear();
        window.location.href = '../index.html';
    }
}

/* ── Populate user chip in sidebar ────────────────────── */
function populateSidebarUser() {
    const s = Session.get();
    if (!s) return;
    const avatarEl = document.getElementById('sidebar-avatar');
    const nameEl = document.getElementById('sidebar-username');
    const roleEl = document.getElementById('sidebar-role');
    if (avatarEl) avatarEl.textContent = s.username.charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = s.username;
    if (roleEl) roleEl.textContent = s.role.toUpperCase();
}

/* ── Highlight active nav item ─────────────────────────── */
function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
}
