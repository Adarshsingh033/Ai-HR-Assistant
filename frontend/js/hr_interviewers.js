/* ========================================================
   hr_interviewers.js – HR Interviewers Management
   ======================================================== */

let allInterviewers = [];
let allDepartments = [];
let ivState = { page: 1, limit: 10 };
let currentOrgId = null;
let currentBranchId = null;

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'hr') {
        location.href = '../index.html';
        return;
    }
    currentOrgId = session.org_id;
    currentBranchId = session.branch_id;

    syncHRSidebarFromSession();

    await loadDepartments();
    await loadInterviewers();
});

/* ── Load Data ─────────────────────────────────────────── */

async function loadDepartments() {
    try {
        const data = await apiRequest('GET', `/api/departments?branch_id=${currentBranchId}`);
        allDepartments = (data && data.departments) ? data.departments : [];
        populateDeptSelects();
    } catch (e) {
        console.warn('Failed to load departments:', e);
    }
}

function populateDeptSelects() {
    // Filter dropdown
    const filterSel = document.getElementById('iv-filter-dept');
    if (filterSel) {
        const options = allDepartments.map(d => `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`).join('');
        filterSel.innerHTML = '<option value="">All Departments</option>' + options;
    }

    // Modal form dropdown
    const formSel = document.getElementById('iv-dept-select');
    if (formSel) {
        const options = allDepartments.map(d => `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`).join('');
        formSel.innerHTML = '<option value="" disabled selected>Select Department</option>' + options;
    }
}

async function loadInterviewers() {
    showSkeleton(true);

    try {
        const deptId = document.getElementById('iv-filter-dept')?.value || '';
        const search = document.getElementById('iv-search')?.value?.trim() || '';

        let url = `/api/hr/interviewers?page=1&limit=1000`;
        if (deptId) url += `&department_id=${encodeURIComponent(deptId)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const data = await apiRequest('GET', url);
        allInterviewers = (data && data.interviewers) ? data.interviewers : [];
        ivState.page = 1;

        renderTable();
    } catch (e) {
        showToast('Failed to load interviewers: ' + e.message, 'error');
    } finally {
        showSkeleton(false);
    }
}

function onFilterChange() {
    clearTimeout(onFilterChange._t);
    onFilterChange._t = setTimeout(() => loadInterviewers(), 350);
}

/* ── Render Table ──────────────────────────────────────── */

function renderTable() {
    const tbody = document.getElementById('iv-tbody');
    const empty = document.getElementById('iv-empty');
    const wrap = document.getElementById('iv-table-wrap');

    if (!tbody) return;

    const total = allInterviewers.length;

    if (total === 0) {
        if (empty) empty.style.display = 'flex';
        if (wrap) wrap.style.display = 'none';
        renderPagination(0, 1, 0, 0);
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap) wrap.style.display = 'block';

    const totalPages = Math.ceil(total / ivState.limit) || 1;
    if (ivState.page > totalPages) ivState.page = totalPages;
    if (ivState.page < 1) ivState.page = 1;

    const startIdx = (ivState.page - 1) * ivState.limit;
    const pagedData = allInterviewers.slice(startIdx, startIdx + ivState.limit);

    tbody.innerHTML = pagedData.map(iv => {
        const initial = (iv.full_name || 'U').charAt(0).toUpperCase();
        const statusClass = iv.status === 'active' ? 'active' : 'inactive';
        
        return `
        <tr>
            <td>
                <div class="name-cell">
                    <div class="avatar-icon">${initial}</div>
                    <div>
                        <div class="name-text">${escapeHtml(iv.full_name)}</div>
                        <div class="email-text">${escapeHtml(iv.email)}</div>
                    </div>
                </div>
            </td>
            <td>
                <span style="font-size:0.84rem;font-family:monospace;color:#a5b4fc;background:rgba(99,102,241,0.1);padding:3px 8px;border-radius:6px;border:1px solid rgba(99,102,241,0.2);">
                    @${escapeHtml(iv.username)}
                </span>
            </td>
            <td>
                <span class="dept-badge"><i class="fa-solid fa-sitemap"></i> ${escapeHtml(iv.department_name)}</span>
            </td>
            <td>
                <span class="status-pill ${statusClass}">${escapeHtml(iv.status)}</span>
            </td>
            <td class="action-cell">
                <button class="action-dots-btn" onclick="toggleActionMenu(event, '${iv.interviewer_id}')" title="Actions">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="action-dropdown" id="amenu-${iv.interviewer_id}">
                    <div class="action-dropdown-item" onclick="openEditModal('${iv.interviewer_id}')">
                        <i class="fa-solid fa-pen" style="color:#38bdf8;"></i> Edit
                    </div>
                    <div class="action-dropdown-item danger" onclick="openDeleteModal('${iv.interviewer_id}', '${escapeHtml(iv.full_name)}')">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    renderPagination(total, totalPages, startIdx, pagedData.length);
}

function changeLimit(newLimit) {
    ivState.limit = parseInt(newLimit, 10) || 10;
    ivState.page = 1;
    renderTable();
}

function changePage(page) {
    ivState.page = page;
    renderTable();
}

function renderPagination(total, totalPages, startIdx, pagedCount) {
    const container = document.getElementById('iv-pagination');
    if (!container) return;

    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    const startItem = total === 0 ? 0 : startIdx + 1;
    const endItem = startIdx + pagedCount;
    const currentPage = ivState.page;

    let pageBtns = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        pageBtns += `<button onclick="changePage(1)" class="page-btn">1</button>`;
        if (startPage > 2) pageBtns += `<span class="page-dots">…</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        if (p === currentPage) {
            pageBtns += `<button class="page-btn active">${p}</button>`;
        } else {
            pageBtns += `<button onclick="changePage(${p})" class="page-btn">${p}</button>`;
        }
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pageBtns += `<span class="page-dots">…</span>`;
        pageBtns += `<button onclick="changePage(${totalPages})" class="page-btn">${totalPages}</button>`;
    }

    container.innerHTML = `
        <div class="pagination-wrap">
            <div class="pagination-info">
                <span>${startItem}–${endItem} of ${total} <span class="dot">·</span> Page ${currentPage} of ${totalPages}</span>
                <div class="limit-select">
                    <span>Rows:</span>
                    <select onchange="changeLimit(this.value)">
                        <option value="10" ${ivState.limit === 10 ? 'selected' : ''}>10</option>
                        <option value="25" ${ivState.limit === 25 ? 'selected' : ''}>25</option>
                        <option value="50" ${ivState.limit === 50 ? 'selected' : ''}>50</option>
                    </select>
                </div>
            </div>
            <div class="pagination-controls">
                <button onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} class="page-nav" title="Previous page">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                ${pageBtns}
                <button onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} class="page-nav" title="Next page">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

function toggleActionMenu(event, id) {
    event.stopPropagation();
    const targetMenu = document.getElementById(`amenu-${id}`);
    const isCurrentlyOpen = targetMenu && targetMenu.classList.contains('open');

    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));

    if (targetMenu && !isCurrentlyOpen) {
        targetMenu.classList.add('open');
    }
}

document.addEventListener('click', () => {
    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
});

/* ── Modal & CRUD ──────────────────────────────────────── */

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function (e) {
        if (e.target === this) this.classList.remove('open');
    });
});

function openCreateModal() {
    document.getElementById('iv-edit-id').value = '';
    document.getElementById('iv-form').reset();
    document.getElementById('iv-modal-title').textContent = 'Add Interviewer';
    document.getElementById('iv-modal-subtitle').textContent = 'Create a new interviewer account';
    document.getElementById('iv-submit-label').textContent = 'Create Account';
    
    document.getElementById('iv-pwd-input').required = true;
    document.getElementById('iv-pwd-req').style.display = 'inline';

    openModal('iv-modal');
}

function openEditModal(id) {
    const iv = allInterviewers.find(x => x.interviewer_id === id);
    if (!iv) return;

    document.getElementById('iv-edit-id').value = iv.interviewer_id;
    document.getElementById('iv-dept-select').value = iv.department_id;
    document.getElementById('iv-name-input').value = iv.full_name;
    document.getElementById('iv-username-input').value = iv.username;
    document.getElementById('iv-email-input').value = iv.email;
    document.getElementById('iv-pwd-input').value = '';
    
    document.getElementById('iv-modal-title').textContent = 'Edit Interviewer';
    document.getElementById('iv-modal-subtitle').textContent = 'Update interviewer details';
    document.getElementById('iv-submit-label').textContent = 'Save Changes';
    
    // Password is optional on edit
    document.getElementById('iv-pwd-input').required = false;
    document.getElementById('iv-pwd-req').style.display = 'none';

    openModal('iv-modal');
}

function closeIvModal() {
    closeModal('iv-modal');
}

async function handleSaveIv(event) {
    event.preventDefault();
    
    const editId = document.getElementById('iv-edit-id').value;
    const btn = document.getElementById('iv-submit-btn');
    
    const payload = {
        department_id: document.getElementById('iv-dept-select').value,
        full_name: document.getElementById('iv-name-input').value.trim(),
        username: document.getElementById('iv-username-input').value.trim(),
        email: document.getElementById('iv-email-input').value.trim(),
    };
    
    const pwd = document.getElementById('iv-pwd-input').value;
    if (pwd) payload.password = pwd;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        if (editId) {
            await apiRequest('PUT', `/api/hr/interviewers/${editId}`, payload);
            showToast('Interviewer updated successfully', 'success');
        } else {
            await apiRequest('POST', `/api/hr/interviewers`, payload);
            showToast('Interviewer created successfully', 'success');
        }
        closeIvModal();
        await loadInterviewers();
    } catch (err) {
        showToast(err.message || 'Failed to save interviewer', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/* ── Delete Flow ───────────────────────────────────────── */

let ivToDelete = null;

function openDeleteModal(id, name) {
    ivToDelete = id;
    document.getElementById('delete-iv-msg').innerHTML = `Are you sure you want to delete interviewer <strong>${escapeHtml(name)}</strong>?`;
    openModal('delete-iv-modal');
}

function closeDeleteModal() {
    ivToDelete = null;
    closeModal('delete-iv-modal');
}

async function confirmDeleteIv() {
    if (!ivToDelete) return;

    const btn = document.getElementById('confirm-delete-iv-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        await apiRequest('DELETE', `/api/hr/interviewers/${ivToDelete}`);
        showToast('Interviewer deleted successfully', 'success');
        closeDeleteModal();
        
        // If last item on page deleted and not page 1, go back a page
        if (allInterviewers.length % ivState.limit === 1 && ivState.page > 1) {
            ivState.page--;
        }
        await loadInterviewers();
    } catch (err) {
        showToast(err.message || 'Failed to delete interviewer', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function showSkeleton(show) {
    const sk = document.getElementById('iv-skeleton');
    const wrap = document.getElementById('iv-table-wrap');
    const emp = document.getElementById('iv-empty');
    if (show) {
        if (sk) sk.style.display = 'block';
        if (wrap) wrap.style.display = 'none';
        if (emp) emp.style.display = 'none';
    } else {
        if (sk) sk.style.display = 'none';
    }
}
