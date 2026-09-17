/* ========================================================
   utils.js – Shared helpers used across all pages
   ======================================================== */

/* ── Base API Configuration ─────────────────────────────── */
const _configuredApi = (window.CONFIG && window.CONFIG.API_BASE_URL && window.CONFIG.API_BASE_URL.trim())
    || (window.ENV && window.ENV.API_BASE_URL && window.ENV.API_BASE_URL.trim());

const API = _configuredApi
    ? _configuredApi.replace(/\/+$/, '')
    : ((window.location.protocol && window.location.protocol.startsWith('http'))
        ? window.location.origin
        : 'http://localhost:8000');




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
    if (s) {
        const adminId = s.user_id || s.id || s.admin_id;
        if (adminId) {
            headers['X-Admin-ID'] = adminId;
            if (s.role === 'super_admin') {
                headers['X-Super-Admin-ID'] = adminId;
            }
        }
    }

    const opts = {
        method,
        headers,
        body: body ? (isFormData ? body : JSON.stringify(body)) : null,
    };
    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json();
    if (!res.ok) {
        let msg = 'Request failed';
        if (typeof data.detail === 'string') {
            msg = data.detail;
        } else if (Array.isArray(data.detail)) {
            msg = data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
        } else if (data.detail && typeof data.detail === 'object') {
            msg = data.detail.msg || JSON.stringify(data.detail);
        } else if (data.message) {
            msg = data.message;
        }
        throw new Error(msg);
    }
    return data;
}

/* ── Pagination bar ───────────────────────────────────────
   Builds the shared pagination markup (.pagination-bar / .page-btn
   from main.css) so every listing page renders an identical,
   responsive control instead of its own inline-styled copy.

   opts: { page, totalPages, total, limit, onPage, onPageSize, pageSizes }
   `onPage` / `onPageSize` are names of global functions on the page.
─────────────────────────────────────────────────────────── */
function paginationBarHTML(opts) {
    const page = Math.max(1, opts.page || 1);
    const totalPages = Math.max(1, opts.totalPages || 1);
    const total = opts.total || 0;
    const limit = opts.limit || 10;
    const onPage = opts.onPage || 'goToPage';
    const onPageSize = opts.onPageSize || '';
    const pageSizes = opts.pageSizes || [10, 15, 25, 50];

    if (!total) return '';

    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);

    // Sliding window of page numbers
    let startPage = 1;
    let endPage = totalPages;
    const maxVisible = 5;
    if (totalPages > 7) {
        if (page <= 4) { startPage = 1; endPage = maxVisible; }
        else if (page >= totalPages - 3) { startPage = totalPages - 4; endPage = totalPages; }
        else { startPage = page - 2; endPage = page + 2; }
    }

    let pageBtns = '';
    if (startPage > 1) {
        pageBtns += `<button type="button" class="page-btn" onclick="${onPage}(1)">1</button>`;
        if (startPage > 2) pageBtns += `<span class="page-ellipsis">…</span>`;
    }
    for (let p = startPage; p <= endPage; p++) {
        pageBtns += p === page
            ? `<button type="button" class="page-btn active">${p}</button>`
            : `<button type="button" class="page-btn" onclick="${onPage}(${p})">${p}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pageBtns += `<span class="page-ellipsis">…</span>`;
        pageBtns += `<button type="button" class="page-btn" onclick="${onPage}(${totalPages})">${totalPages}</button>`;
    }

    const prevDisabled = page <= 1 ? 'disabled' : '';
    const nextDisabled = page >= totalPages ? 'disabled' : '';

    const sizeSelect = onPageSize ? `
            <div class="pagination-size">
                <span>Rows per page:</span>
                <select onchange="${onPageSize}(this.value)">
                    ${pageSizes.map(s => `<option value="${s}" ${limit === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>` : '';

    return `
        <div class="pagination-bar">
            <div class="pagination-info">
                <span>${startItem}–${endItem} of ${total} <span style="margin:0 4px;opacity:0.4;">·</span> Page ${page} of ${totalPages}</span>
                ${sizeSelect}
            </div>
            <div class="pagination-controls">
                <button type="button" class="page-btn nav-btn" ${prevDisabled} onclick="${onPage}(1)" title="First page"><i class="fa-solid fa-angles-left"></i></button>
                <button type="button" class="page-btn nav-btn" ${prevDisabled} onclick="${onPage}(${page - 1})" title="Previous page"><i class="fa-solid fa-chevron-left"></i></button>
                ${pageBtns}
                <button type="button" class="page-btn nav-btn" ${nextDisabled} onclick="${onPage}(${page + 1})" title="Next page"><i class="fa-solid fa-chevron-right"></i></button>
                <button type="button" class="page-btn nav-btn" ${nextDisabled} onclick="${onPage}(${totalPages})" title="Last page"><i class="fa-solid fa-angles-right"></i></button>
            </div>
        </div>`;
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
    const modal = document.getElementById('logout-confirm-modal');
    if (modal) {
        modal.classList.add('open');
    } else {
        confirmLogoutAction();
    }
}

function closeLogoutModal() {
    const modal = document.getElementById('logout-confirm-modal');
    if (modal) modal.classList.remove('open');
}

function confirmLogoutAction() {
    closeLogoutModal();
    showToast('<i class="fa-solid fa-right-from-bracket"></i> Logging out...', 'info', 1500);
    Session.clear();
    setTimeout(() => {
        window.location.href = '/index.html';
    }, 800);
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
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

/* ── HTML Escaping Helper ───────────────────────────────── */
function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

/* ── Toggle Password Visibility ─────────────────────────── */
function togglePasswordVisibility(inputId, btn) {
    const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
    if (!input) return;
    const targetBtn = btn || (input.parentElement ? input.parentElement.querySelector('.eye-toggle-btn, .pwd-toggle-btn') : null);
    const icon = targetBtn ? targetBtn.querySelector('i') : null;
    
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.className = 'fa-regular fa-eye-slash';
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.className = 'fa-regular fa-eye';
        }
    }
}

/* ── Restrict Spaces in Password Fields ──────────────────── */
document.addEventListener('keydown', function (e) {
    const target = e.target;
    if (target && (target.type === 'password' || (target.id && /pass|pwd/i.test(target.id)))) {
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
        }
    }
}, true);

document.addEventListener('input', function (e) {
    const target = e.target;
    if (target && (target.type === 'password' || (target.id && /pass|pwd/i.test(target.id)))) {
        if (/\s/.test(target.value)) {
            target.value = target.value.replace(/\s/g, '');
        }
    }
}, true);

