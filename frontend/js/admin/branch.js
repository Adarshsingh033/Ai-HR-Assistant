/* ========================================================
   admin/branch.js – Branch Module Logic (CRUD, Listing, Pagination, Filters)
   ======================================================== */

let branchState = {
    page: 1,
    limit: 10,
    search: '',
    organization_id: '',
    total: 0,
    total_pages: 1,
    branches: [],
    deleteTargetId: null
};

let cachedOrganizations = [];

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'admin') return;

    await loadOrganizationsForBranchFilter();
    await loadBranches();
});

/* Fetch Organizations for Filter and Modal selects */
async function loadOrganizationsForBranchFilter() {
    try {
        const session = Session.get();
        if (!session) return;

        const res = await apiRequest('GET', '/api/admin/organizations?limit=100');

        if (res && res.organizations) {
            cachedOrganizations = res.organizations;
            populateOrgDropdowns();
        }
    } catch (err) {
        console.error('Error fetching organizations for branch select:', err);
    }
}

function populateOrgDropdowns() {
    // 1. Filter dropdown (all orgs)
    const filterSelect = document.getElementById('branch-filter-org');
    if (filterSelect) {
        let options = `<option value="" style="background: #0f172a; color: #fff;">All Organizations</option>`;
        cachedOrganizations.forEach(org => {
            options += `<option value="${org.org_id}" style="background: #0f172a; color: #fff;">${escapeHtml(org.organization_name)}</option>`;
        });
        filterSelect.innerHTML = options;
    }

    // 2. Form select (only ACTIVE organizations)
    const formSelect = document.getElementById('branch-org-select');
    if (formSelect) {
        let options = `<option value="" disabled selected>Select Organization</option>`;
        const activeOrgs = cachedOrganizations.filter(org => !org.status || org.status === 'active');
        activeOrgs.forEach(org => {
            options += `<option value="${org.org_id}">${escapeHtml(org.organization_name)}</option>`;
        });
        formSelect.innerHTML = options;
    }
}

/* Load Branches from API */
async function loadBranches() {
    const tbody = document.getElementById('branch-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 36px;">
                    <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Loading branches...
                </td>
            </tr>
        `;
    }

    try {
        const session = Session.get();
        if (!session || !session.user_id) return;

        let query = `/api/admin/branches?page=${branchState.page}&limit=${branchState.limit}`;
        if (branchState.search.trim()) {
            query += `&search=${encodeURIComponent(branchState.search.trim())}`;
        }
        if (branchState.organization_id) {
            query += `&organization_id=${encodeURIComponent(branchState.organization_id)}`;
        }

        const res = await apiRequest('GET', query);

        if (res && Array.isArray(res.branches)) {
            branchState.branches = res.branches;
            branchState.total = res.total || 0;
            branchState.total_pages = res.total_pages || 1;

            renderBranchTable();
            renderBranchPagination();
        } else {
            showBranchError('Failed to load branches.');
        }
    } catch (err) {
        console.error('loadBranches error:', err);
        showBranchError('Error connecting to server. Please try again.');
    }
}

function showBranchError(msg) {
    const tbody = document.getElementById('branch-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: #ef4444; padding: 36px; font-weight: 600;">
                    ${escapeHtml(msg)}
                </td>
            </tr>
        `;
    }
}

/* Render Branch Table Rows */
function renderBranchTable() {
    const tbody = document.getElementById('branch-table-body');
    if (!tbody) return;

    if (branchState.branches.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px;">
                    No branches found matching your search.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = branchState.branches.map(branch => {
        const locationParts = [branch.city, branch.state, branch.country].filter(Boolean);
        const locationStr = locationParts.length > 0 ? locationParts.join(', ') : '—';
        const formattedDate = formatDate(branch.created_at);

        return `
            <tr style="position: relative;">
                <!-- 1. Branch Name Column -->
                <td style="padding-left: 16px;">
                    <div style="font-weight: 700; color: #fff; font-size: 0.93rem;">${escapeHtml(branch.branch_name)}</div>
                </td>

                <!-- 2. Organization Column -->
                <td>
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 99px; background: rgba(59, 130, 246, 0.12); color: #60a5fa; font-size: 0.78rem; font-weight: 600;">
                        ${escapeHtml(branch.organization_name || '—')}
                    </span>
                </td>

                <!-- 3. Location Column -->
                <td>
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.85);">
                        <i class="fa-solid fa-location-dot" style="color: rgba(255,255,255,0.4); margin-right: 6px;"></i>${escapeHtml(locationStr)}
                    </div>
                </td>

                <!-- 4. Created Date Column -->
                <td style="color: var(--text-muted); font-size: 0.85rem;">
                    ${formattedDate}
                </td>

                <!-- 5. Action Dropdown Menu Column -->
                <td style="text-align: right; position: relative;">
                    <button type="button" class="btn-action-trigger" onclick="toggleBranchActionMenu(event, '${branch.branch_id}')" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--text-primary); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Actions">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    <div id="branch-action-menu-${branch.branch_id}" class="branch-action-dropdown hidden" style="position: absolute; right: 0; top: 42px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 100; min-width: 140px; padding: 6px 0; text-align: left;">
                        <div onclick="triggerBranchView('${branch.branch_id}')" style="padding: 8px 16px; color: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
                            <i class="fa-solid fa-eye" style="color: #60a5fa;"></i> View
                        </div>
                        <div onclick="triggerBranchEdit('${branch.branch_id}')" style="padding: 8px 16px; color: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
                            <i class="fa-solid fa-pen-to-square" style="color: #f59e0b;"></i> Edit
                        </div>
                        <div style="height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;"></div>
                        <div onclick="triggerBranchDelete('${branch.branch_id}')" style="padding: 8px 16px; color: #ef4444; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(239, 68, 68, 0.12)'" onmouseout="this.style.background='transparent'">
                            <i class="fa-solid fa-trash-can"></i> Delete
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* Toggle Branch Action Menu */
function toggleBranchActionMenu(e, branchId) {
    if (e) e.stopPropagation();
    document.querySelectorAll('.branch-action-dropdown').forEach(el => {
        if (el.id !== `branch-action-menu-${branchId}`) {
            el.classList.add('hidden');
        }
    });
    const menu = document.getElementById(`branch-action-menu-${branchId}`);
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

document.addEventListener('click', () => {
    document.querySelectorAll('.branch-action-dropdown').forEach(el => el.classList.add('hidden'));
});

/* Render Branch Pagination Controls */
function renderBranchPagination() {
    const container = document.getElementById('branch-pagination-container');
    if (!container) return;

    const startItem = branchState.total === 0 ? 0 : (branchState.page - 1) * branchState.limit + 1;
    const endItem = Math.min(branchState.page * branchState.limit, branchState.total);

    let pagesHtml = '';
    const totalP = branchState.total_pages;
    const currentP = branchState.page;

    for (let i = 1; i <= totalP; i++) {
        if (i === 1 || i === totalP || (i >= currentP - 1 && i <= currentP + 1)) {
            const isActive = i === currentP;
            pagesHtml += `
                <button type="button" onclick="goToBranchPage(${i})" 
                    style="width: 34px; height: 34px; border-radius: 8px; border: ${isActive ? 'none' : '1px solid rgba(255,255,255,0.12)'}; background: ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.04)'}; color: #fff; font-weight: ${isActive ? '700' : '500'}; font-size: 0.85rem; cursor: pointer; transition: all 0.2s ease; box-shadow: ${isActive ? '0 4px 12px rgba(99,102,241,0.4)' : 'none'};">
                    ${i}
                </button>
            `;
        } else if (i === currentP - 2 || i === currentP + 2) {
            pagesHtml += `<span style="color: rgba(255,255,255,0.4); font-size: 0.85rem; padding: 0 2px;">...</span>`;
        }
    }

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; flex-wrap: wrap; gap: 16px; background: rgba(255,255,255,0.02); padding: 14px 20px; border-radius: 14px; border: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 16px;">
                <span style="font-size: 0.84rem; color: rgba(255,255,255,0.65);">
                    Showing <strong style="color: #fff;">${startItem}-${endItem}</strong> of <strong style="color: #fff;">${branchState.total}</strong> branches
                </span>
                
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.82rem; color: rgba(255,255,255,0.5);">Rows per page:</span>
                    <select onchange="onBranchLimitChange(event)" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 0.82rem; border-radius: 8px; padding: 4px 8px; cursor: pointer; outline: none;">
                        <option value="10" ${branchState.limit === 10 ? 'selected' : ''} style="background: #0f172a; color: #fff;">10</option>
                        <option value="25" ${branchState.limit === 25 ? 'selected' : ''} style="background: #0f172a; color: #fff;">25</option>
                        <option value="35" ${branchState.limit === 35 ? 'selected' : ''} style="background: #0f172a; color: #fff;">35</option>
                        <option value="50" ${branchState.limit === 50 ? 'selected' : ''} style="background: #0f172a; color: #fff;">50</option>
                    </select>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
                <button type="button" onclick="goToBranchPage(${currentP - 1})" ${currentP <= 1 ? 'disabled' : ''} 
                    style="padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: ${currentP <= 1 ? 'rgba(255,255,255,0.25)' : '#fff'}; font-size: 0.85rem; font-weight: 600; cursor: ${currentP <= 1 ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-chevron-left" style="font-size: 0.75rem;"></i> Previous
                </button>

                <div style="display: flex; align-items: center; gap: 4px; margin: 0 4px;">
                    ${pagesHtml}
                </div>

                <button type="button" onclick="goToBranchPage(${currentP + 1})" ${currentP >= totalP ? 'disabled' : ''} 
                    style="padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: ${currentP >= totalP ? 'rgba(255,255,255,0.25)' : '#fff'}; font-size: 0.85rem; font-weight: 600; cursor: ${currentP >= totalP ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; gap: 6px;">
                    Next <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem;"></i>
                </button>
            </div>
        </div>
    `;
}

function goToBranchPage(page) {
    if (page < 1 || page > branchState.total_pages || page === branchState.page) return;
    branchState.page = page;
    loadBranches();
}

function onBranchLimitChange(e) {
    branchState.limit = parseInt(e.target.value, 10);
    branchState.page = 1;
    loadBranches();
}

function onBranchFilterChange() {
    const searchInput = document.getElementById('branch-search-input');
    const orgSelect = document.getElementById('branch-filter-org');

    branchState.search = searchInput ? searchInput.value : '';
    branchState.organization_id = orgSelect ? orgSelect.value : '';
    branchState.page = 1;

    loadBranches();
}

/* Branch Modal Handlers */
function openCreateBranchModal() {
    document.getElementById('branch-modal-title').textContent = 'Create Branch';
    document.getElementById('branch-id-hidden').value = '';
    document.getElementById('branch-form').reset();

    populateOrgDropdowns();

    const modal = document.getElementById('branch-modal');
    if (modal) modal.classList.add('open');
}

function closeBranchModal() {
    const modal = document.getElementById('branch-modal');
    if (modal) modal.classList.remove('open');
}

async function handleSaveBranch(e) {
    e.preventDefault();
    const session = Session.get();
    if (!session || !session.user_id) return;

    const branchId = document.getElementById('branch-id-hidden').value;
    const orgId = document.getElementById('branch-org-select').value;
    const branchName = document.getElementById('branch-name-input').value.trim();
    const city = document.getElementById('branch-city-input').value.trim();
    const state = document.getElementById('branch-state-input').value.trim();
    const country = document.getElementById('branch-country-input').value.trim();

    if (!orgId || !branchName) {
        showToast('Please fill in required fields.', 'error');
        return;
    }

    const payload = {
        organization_id: orgId,
        branch_name: branchName,
        city: city || null,
        state: state || null,
        country: country || null
    };

    const submitBtn = document.getElementById('branch-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        let res;
        if (branchId) {
            res = await apiRequest('PUT', `/api/admin/branches/${branchId}`, payload);
        } else {
            res = await apiRequest('POST', '/api/admin/branches', payload);
        }

        if (res && res.branch_id) {
            showToast(`Branch ${branchId ? 'updated' : 'created'} successfully!`, 'success');
            closeBranchModal();
            loadBranches();
        } else {
            showToast('Failed to save branch.', 'error');
        }
    } catch (err) {
        console.error('handleSaveBranch error:', err);
        showToast(err.message || 'Error saving branch', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Branch';
        }
    }
}

/* Action Triggers: View, Edit, Delete */
function triggerBranchView(branchId) {
    const branch = branchState.branches.find(b => b.branch_id === branchId);
    if (!branch) return;

    document.getElementById('view-branch-name').textContent = branch.branch_name || '—';
    document.getElementById('view-branch-org').textContent = branch.organization_name || '—';

    const locParts = [branch.city, branch.state, branch.country].filter(Boolean);
    document.getElementById('view-branch-location').textContent = locParts.length > 0 ? locParts.join(', ') : '—';
    document.getElementById('view-branch-date').textContent = formatDate(branch.created_at);

    const modal = document.getElementById('view-branch-modal');
    if (modal) modal.classList.add('open');
}

function closeViewBranchModal() {
    const modal = document.getElementById('view-branch-modal');
    if (modal) modal.classList.remove('open');
}

function triggerBranchEdit(branchId) {
    const branch = branchState.branches.find(b => b.branch_id === branchId);
    if (!branch) return;

    populateOrgDropdowns();

    document.getElementById('branch-modal-title').textContent = 'Edit Branch';
    document.getElementById('branch-id-hidden').value = branch.branch_id;
    document.getElementById('branch-org-select').value = branch.organization_id;
    document.getElementById('branch-name-input').value = branch.branch_name || '';
    document.getElementById('branch-city-input').value = branch.city || '';
    document.getElementById('branch-state-input').value = branch.state || '';
    document.getElementById('branch-country-input').value = branch.country || '';

    const modal = document.getElementById('branch-modal');
    if (modal) modal.classList.add('open');
}

function triggerBranchDelete(branchId) {
    branchState.deleteTargetId = branchId;
    const modal = document.getElementById('delete-branch-modal');
    if (modal) modal.classList.add('open');
}

function closeDeleteBranchModal() {
    branchState.deleteTargetId = null;
    const modal = document.getElementById('delete-branch-modal');
    if (modal) modal.classList.remove('open');
}

async function confirmDeleteBranchAction() {
    if (!branchState.deleteTargetId) return;
    const session = Session.get();
    if (!session || !session.user_id) return;

    const btn = document.getElementById('confirm-delete-branch-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Deleting...';
    }

    try {
        await apiRequest('DELETE', `/api/admin/branches/${branchState.deleteTargetId}`);

        showToast('Branch deleted successfully!', 'success');
        closeDeleteBranchModal();
        loadBranches();
    } catch (err) {
        console.error('Delete branch error:', err);
        showToast(err.message || 'Failed to delete branch', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Delete';
        }
    }
}
