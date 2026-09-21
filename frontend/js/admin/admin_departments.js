/* ====================================================================
   admin/admin_departments.js
   Admin: Departments CRUD — Create, List, Edit, Delete
   ==================================================================== */

'use strict';

let PAGE_SIZE = 10;
let currentPage = 1;
let totalPages = 1;
let editingDeptId = null;
let deletingDeptId = null;

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    await loadFilterOrgs();
    await loadDepartments();
});

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
    document.querySelectorAll('.action-dropdown.open').forEach(d => {
        if (!d.contains(e.target) && (!e.target.closest || !e.target.closest('.action-dots-btn'))) {
            d.classList.remove('open');
        }
    });
});

window.addEventListener('scroll', () => {
    document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
}, true);

// ── API helpers ───────────────────────────────────────────────────────────────

// ── API helpers ───────────────────────────────────────────────────────────────

function apiGet(url) {
    return apiRequest('GET', url);
}

function apiPost(url, body) {
    return apiRequest('POST', url, body);
}

function apiPut(url, body) {
    return apiRequest('PUT', url, body);
}

function apiDelete(url) {
    return apiRequest('DELETE', url);
}

// ── Load filters ──────────────────────────────────────────────────────────────

async function loadFilterOrgs() {
    try {
        const data = await apiGet('/api/admin/organizations?limit=200');
        const orgSelect = document.getElementById('dept-filter-org');
        const orgs = data.organizations || data.data || [];
        orgs.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.org_id || o.organization_id || o.id;
            opt.textContent = o.organization_name || o.company_name || o.name || 'Unknown';
            orgSelect.appendChild(opt);
        });
    } catch (_) {}
}

async function loadBranchFilterForOrg(orgId) {
    const branchSelect = document.getElementById('dept-filter-branch');
    branchSelect.innerHTML = '<option value="">All Branches</option>';
    if (!orgId) return;
    try {
        const data = await apiGet(`/api/admin/branches?organization_id=${orgId}&limit=200`);
        const branches = data.branches || data.data || [];
        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.branch_id || b.id;
            opt.textContent = b.branch_name || 'Unknown';
            branchSelect.appendChild(opt);
        });
    } catch (_) {}
}

// ── Table loading ─────────────────────────────────────────────────────────────

async function loadDepartments(page = 1) {
    currentPage = page;
    const search = document.getElementById('dept-search').value.trim();
    const orgId = document.getElementById('dept-filter-org').value;
    const branchId = document.getElementById('dept-filter-branch').value;

    let url = `/api/admin/departments?page=${page}&limit=${PAGE_SIZE}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (orgId) url += `&organization_id=${orgId}`;
    if (branchId) url += `&branch_id=${branchId}`;

    document.getElementById('dept-skeleton').style.display = '';
    document.getElementById('dept-empty').style.display = 'none';
    document.getElementById('dept-table-wrap').style.display = 'none';
    document.getElementById('dept-pagination').innerHTML = '';

    try {
        const data = await apiGet(url);
        const depts = data.departments || [];
        totalPages = data.total_pages || 1;

        document.getElementById('dept-skeleton').style.display = 'none';

        if (depts.length === 0) {
            document.getElementById('dept-empty').style.display = 'flex';
            return;
        }

        document.getElementById('dept-table-wrap').style.display = '';
        renderTable(depts);
        renderPagination(data.total || 0, page, data.limit || PAGE_SIZE, totalPages);
    } catch (err) {
        document.getElementById('dept-skeleton').style.display = 'none';
        document.getElementById('dept-empty').style.display = 'flex';
        showToast('Failed to load departments: ' + err.message, 'error');
    }
}

function renderTable(depts) {
    const tbody = document.getElementById('dept-tbody');
    tbody.innerHTML = depts.map(d => {
        const initials = (d.department_name || 'D').substring(0, 1).toUpperCase();
        const createdDate = d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        return `
        <tr>
            <td>
                <div class="dept-name-cell">
                    <div class="dept-icon">${initials}</div>
                    <div>
                        <div class="dept-name-text">${escHtml(d.department_name)}</div>
                        ${d.description ? `<div class="dept-desc-text">${escHtml(d.description)}</div>` : ''}
                    </div>
                </div>
            </td>
            <td><span class="org-badge"><i class="fa-solid fa-building"></i> ${escHtml(d.organization_name || '—')}</span></td>
            <td><span class="branch-badge"><i class="fa-solid fa-code-branch"></i> ${escHtml(d.branch_name || '—')}</span></td>
            <td style="color:var(--text-muted);font-size:0.82rem;">${createdDate}</td>
            <td class="action-cell">
                <button class="action-dots-btn" id="dots-${d.department_id}" onclick="toggleActionMenu(event, '${d.department_id}')">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
                <div class="action-dropdown" id="dropdown-${d.department_id}">
                    <div class="action-dropdown-item" onclick="openEditModal('${d.department_id}', ${JSON.stringify(d).replace(/"/g, '&quot;')})">
                        <i class="fa-solid fa-pen" style="color:#a5b4fc;"></i> Edit
                    </div>
                    <div class="action-dropdown-item danger" onclick="openDeleteModal('${d.department_id}', '${escHtml(d.department_name)}')">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function onDeptPageSizeChange(newSize) {
    PAGE_SIZE = parseInt(newSize, 10) || 10;
    loadDepartments(1);
}
window.onDeptPageSizeChange = onDeptPageSizeChange;

function renderPagination(total, page, limit, pages) {
    const container = document.getElementById('dept-pagination');
    if (!container) return;
    if (total === 0) { container.innerHTML = ''; return; }
    container.innerHTML = paginationBarHTML({
        page: page,
        totalPages: pages || 1,
        total: total,
        limit: limit,
        onPage: 'loadDepartments',
        onPageSize: 'onDeptPageSizeChange',
        pageSizes: [10, 25, 50]
    });
}

// ── Filters ───────────────────────────────────────────────────────────────────

let filterTimer;
function onFilterChange() {
    const orgId = document.getElementById('dept-filter-org').value;
    loadBranchFilterForOrg(orgId);
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => loadDepartments(1), 350);
}

// ── Action menu toggle ────────────────────────────────────────────────────────

function toggleActionMenu(e, deptId) {
    if (e) e.stopPropagation();
    const dd = document.getElementById(`dropdown-${deptId}`);
    const wasOpen = dd && dd.classList.contains('open');

    document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));

    if (dd && !wasOpen) {
        dd.classList.add('open');
        if (e && e.currentTarget) {
            const btn = e.currentTarget;
            const rect = btn.getBoundingClientRect();
            const menuHeight = dd.offsetHeight || 110;
            const menuWidth = dd.offsetWidth || 140;
            const spaceBelow = window.innerHeight - rect.bottom;

            dd.style.position = 'fixed';
            dd.style.right = 'auto';
            dd.style.left = `${Math.min(window.innerWidth - menuWidth - 16, Math.max(10, rect.right - menuWidth))}px`;
            dd.style.zIndex = '99999';

            if (spaceBelow < menuHeight + 15 && rect.top > menuHeight + 15) {
                dd.style.top = `${rect.top - menuHeight - 4}px`;
                dd.style.bottom = 'auto';
            } else {
                dd.style.top = `${rect.bottom + 4}px`;
                dd.style.bottom = 'auto';
            }
        }
    }
}

// ── Create modal ──────────────────────────────────────────────────────────────

async function openCreateModal() {
    editingDeptId = null;
    document.getElementById('dept-modal-title').textContent = 'Create Department';
    document.getElementById('dept-modal-subtitle').textContent = 'Select organization first, then branch, then department details';
    document.getElementById('dept-submit-label').textContent = 'Save Department';
    document.getElementById('dept-edit-id').value = '';
    document.getElementById('dept-name-input').value = '';
    document.getElementById('dept-desc-input').value = '';

    const branchSel = document.getElementById('dept-branch-select');
    if (branchSel) {
        branchSel.innerHTML = '<option value="" disabled selected>Select Organization First</option>';
        branchSel.disabled = true;
    }

    await loadOrgOptionsForModal();
    document.getElementById('dept-modal').classList.add('open');
}

async function openEditModal(deptId, dept) {
    editingDeptId = deptId;
    document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
    document.getElementById('dept-modal-title').textContent = 'Edit Department';
    document.getElementById('dept-modal-subtitle').textContent = 'Update department information';
    document.getElementById('dept-submit-label').textContent = 'Update Department';
    document.getElementById('dept-edit-id').value = deptId;
    document.getElementById('dept-name-input').value = dept.department_name || '';
    document.getElementById('dept-desc-input').value = dept.description || '';

    await loadOrgOptionsForModal(dept.organization_id);
    await loadBranchesForOrg(dept.organization_id, dept.branch_id);
    document.getElementById('dept-modal').classList.add('open');
}

function closeDeptModal() {
    document.getElementById('dept-modal').classList.remove('open');
    editingDeptId = null;
}

async function loadOrgOptionsForModal(selectedOrgId = '') {
    const sel = document.getElementById('dept-org-select');
    sel.innerHTML = '<option value="" disabled selected>Loading organizations...</option>';
    try {
        const data = await apiGet('/api/admin/organizations?limit=200');
        const orgs = data.organizations || data.data || [];
        sel.innerHTML = '<option value="" disabled ' + (selectedOrgId ? '' : 'selected') + '>Select Organization</option>';
        orgs.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.org_id || o.organization_id || o.id;
            opt.textContent = o.organization_name || o.company_name || 'Unknown';
            if (opt.value === selectedOrgId) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch (err) {
        sel.innerHTML = '<option value="" disabled selected>Failed to load organizations</option>';
    }
}

async function loadBranchesForOrg(orgId, selectedBranchId = '') {
    const sel = document.getElementById('dept-branch-select');
    if (!sel) return;

    if (!orgId) {
        sel.innerHTML = '<option value="" disabled selected>Select Organization First</option>';
        sel.disabled = true;
        return;
    }

    sel.innerHTML = '<option value="" disabled selected>Loading branches...</option>';
    sel.disabled = true;

    try {
        const data = await apiGet(`/api/admin/branches?organization_id=${orgId}&limit=200`);
        const branches = data.branches || data.data || [];

        if (branches.length === 0) {
            sel.innerHTML = '<option value="" disabled selected>No branches available for this organization</option>';
            sel.disabled = true;
            return;
        }

        sel.innerHTML = '<option value="" disabled ' + (selectedBranchId ? '' : 'selected') + '>Select Branch</option>';
        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.branch_id || b.id;
            opt.textContent = b.branch_name || 'Unknown';
            if (opt.value === selectedBranchId) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.disabled = false;
    } catch (err) {
        sel.innerHTML = '<option value="" disabled selected>Failed to load branches</option>';
        sel.disabled = true;
    }
}

// ── Save (Create/Edit) ────────────────────────────────────────────────────────

async function handleSaveDept(e) {
    e.preventDefault();
    const btn = document.getElementById('dept-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const orgId = document.getElementById('dept-org-select').value;
    const branchId = document.getElementById('dept-branch-select').value;
    const name = document.getElementById('dept-name-input').value.trim();
    const desc = document.getElementById('dept-desc-input').value.trim();

    if (!orgId || !branchId || !name) {
        showToast('Please fill in all required fields.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span id="dept-submit-label">Save Department</span>';
        return;
    }

    try {
        if (editingDeptId) {
            await apiPut(`/api/admin/departments/${editingDeptId}`, { department_name: name, description: desc || null });
            showToast('Department updated successfully!', 'success');
        } else {
            await apiPost('/api/admin/departments', { organization_id: orgId, branch_id: branchId, department_name: name, description: desc || null });
            showToast('Department created successfully!', 'success');
        }
        closeDeptModal();
        await loadDepartments(editingDeptId ? currentPage : 1);
    } catch (err) {
        showToast(err.message || 'Failed to save department.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span id="dept-submit-label">${editingDeptId ? 'Update Department' : 'Save Department'}</span>`;
    }
}

// ── Delete ────────────────────────────────────────────────────────────────────

function openDeleteModal(deptId, name) {
    deletingDeptId = deptId;
    document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
    document.getElementById('delete-dept-msg').textContent = `Are you sure you want to delete the "${name}" department? This action cannot be undone.`;
    document.getElementById('delete-dept-modal').classList.add('open');
}

function closeDeleteModal() {
    document.getElementById('delete-dept-modal').classList.remove('open');
    deletingDeptId = null;
}

async function confirmDeleteDept() {
    if (!deletingDeptId) return;
    const btn = document.getElementById('confirm-delete-dept-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    try {
        await apiDelete(`/api/admin/departments/${deletingDeptId}`);
        showToast('Department deleted successfully!', 'success');
        closeDeleteModal();
        await loadDepartments(currentPage > 1 && document.querySelectorAll('#dept-tbody tr').length === 1 ? currentPage - 1 : currentPage);
    } catch (err) {
        showToast(err.message || 'Failed to delete department.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'success') {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        window.showToast(msg, type); return;
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type === 'error' ? 'error' : 'success'}`;
    el.textContent = msg;
    document.getElementById('toast-container')?.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}
