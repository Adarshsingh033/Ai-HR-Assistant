/* ========================================================
   admin/organization.js – Organization Module (CRUD, Pagination, Search & Filters)
   ======================================================== */

let orgLogoBase64 = null;
let deletingOrgId = null;
let orgFilterTimeout = null;

let currentOrgPage = 1;
let orgPageSize = 10;
let totalOrgPages = 1;

const INDUSTRY_LABELS = {
    'information_technology': 'Information Technology',
    'financial_services': 'Financial Services',
    'healthcare': 'Healthcare',
    'education': 'Education',
    'manufacturing': 'Manufacturing'
};

const COMPANY_SIZE_LABELS = {
    '1-10': '1-10 employees',
    '11-50': '11-50 employees',
    '51-200': '51-200 employees',
    '201-500': '201-500 employees',
    '501-1000': '501-1000 employees',
    '1000+': '1000+ employees'
};

window.loadOrganizations = loadOrganizations;

window.addEventListener('DOMContentLoaded', async () => {
    // Initial load of organizations
    await loadOrganizations();
});

function onOrgFilterChange() {
    clearTimeout(orgFilterTimeout);
    orgFilterTimeout = setTimeout(() => {
        currentOrgPage = 1; // Reset to page 1 on search/filter change
        loadOrganizations();
    }, 250);
}

/* Fetch and Render Organizations with Search, Filters & Server-Side Pagination */
async function loadOrganizations(page = currentOrgPage) {
    const tbody = document.getElementById('org-table-body');
    const tableWrap = document.getElementById('org-table-wrap');
    const emptyState = document.getElementById('org-empty');
    
    if (tableWrap) tableWrap.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px;">
                    <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Loading organizations...
                </td>
            </tr>
        `;
    }
    
    if (!tbody) return;

    currentOrgPage = page;

    const search = document.getElementById('org-search-input')?.value.trim() || '';
    const industry = document.getElementById('org-filter-industry')?.value || '';
    const companySize = document.getElementById('org-filter-size')?.value || '';
    const status = document.getElementById('org-filter-status')?.value || '';

    const params = new URLSearchParams();
    params.append('page', currentOrgPage);
    params.append('limit', orgPageSize);
    if (search) params.append('search', search);
    if (industry) params.append('industry', industry);
    if (companySize) params.append('company_size', companySize);
    if (status) params.append('status', status);

    try {
        const data = await apiRequest('GET', `/api/admin/organizations?${params.toString()}`);
        const orgs = data.organizations || [];
        totalOrgPages = data.total_pages || 1;

        renderOrganizationsTable(orgs);
        renderOrgPagination(data);
    } catch (err) {
        console.error('Failed to load organizations:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--danger); padding: 24px;">
                    Failed to load organizations: ${escapeHtml(err.message || 'Request failed')}
                </td>
            </tr>
        `;
    }
}

/* Render Organizations Table */
function renderOrganizationsTable(orgs) {
    const tbody = document.getElementById('org-table-body');
    const emptyState = document.getElementById('org-empty');
    const tableWrap = document.getElementById('org-table-wrap');
    if (!tbody) return;

    if (!orgs || orgs.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (tableWrap) tableWrap.style.display = 'none';
        tbody.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (tableWrap) tableWrap.style.display = 'block';

    tbody.innerHTML = orgs.map(org => {
        const indLabel = INDUSTRY_LABELS[org.industry] || org.industry;
        const sizeLabel = COMPANY_SIZE_LABELS[org.company_size] || org.company_size;
        const formattedDate = org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const isInactive = org.status === 'inactive';
        
        // Logo Column (Dedicated Column)
        const logoContent = org.image
            ? `<img src="${org.image}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.15);" />`
            : `<div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(99, 102, 241, 0.15); border: 1.5px solid rgba(99, 102, 241, 0.3); color: #818cf8; display: flex; align-items: center; justify-content: center; font-size: 0.95rem;"><i class="fa-solid fa-building"></i></div>`;

        // Status Badge Column (Clickable Toggle Pill with Custom Tooltip)
        const statusBadge = isInactive
            ? `<button type="button" onclick="toggleOrgStatus('${org.org_id}', 'active')" data-tooltip="Click to set Active" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: var(--danger); font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.12)'"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> Inactive</button>`
            : `<button type="button" onclick="toggleOrgStatus('${org.org_id}', 'inactive')" data-tooltip="Click to set Inactive" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(16, 185, 129, 0.25)'" onmouseout="this.style.background='rgba(16, 185, 129, 0.12)'"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> Active</button>`;

        return `
            <tr style="position: relative;">
                <!-- 1. Logo Column -->
                <td>
                    <div style="display: flex; align-items: center;">
                        ${logoContent}
                    </div>
                </td>

                <!-- 2. Organization Column -->
                <td>
                    <div style="font-weight: 700; color: var(--text-bright); font-size: 0.95rem;">${escapeHtml(org.organization_name)}</div>
                </td>

                <!-- 3. Industry Column -->
                <td>
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 99px; background: rgba(59, 130, 246, 0.12); color: var(--info); font-size: 0.78rem; font-weight: 600; text-transform: capitalize;">
                        ${escapeHtml(indLabel)}
                    </span>
                </td>

                <!-- 4. Company Size Column -->
                <td>
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 99px; background: rgba(16, 185, 129, 0.12); color: #34d399; font-size: 0.78rem; font-weight: 600;">
                        ${escapeHtml(sizeLabel)}
                    </span>
                </td>

                <!-- 5. Status Column -->
                <td>
                    ${statusBadge}
                </td>

                <!-- 6. Created At Column -->
                <td style="color: var(--text-muted); font-size: 0.85rem;">${formattedDate}</td>

                <!-- 7. Actions Column (Horizontal 3-Dot Menu) -->
                <td style="text-align: right; position: relative;">
                    <button type="button" onclick="toggleOrgActionMenu(event, '${org.org_id}')" data-tooltip="Actions" style="background: var(--bg-subtle); border: 1px solid var(--border); color: var(--text-primary); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; transition: all 0.2s ease;">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    <!-- Popover Dropdown Menu (View, Edit, Delete Only) -->
                    <div id="org-action-menu-${org.org_id}" class="org-action-dropdown hidden" style="position: absolute; right: 8px; top: 44px; min-width: 140px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 1000; overflow: hidden;">
                        <button type="button" onclick="openViewOrgModal('${org.org_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: var(--text-bright); font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='var(--bg-subtle)'" onmouseout="this.style.background='none'">
                            <i class="fa-regular fa-eye" style="color: var(--info); width: 14px;"></i> View
                        </button>
                        <button type="button" onclick="openEditOrgModal('${org.org_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: var(--text-bright); font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='var(--bg-subtle)'" onmouseout="this.style.background='none'">
                            <i class="fa-solid fa-pen" style="color: var(--accent); width: 14px;"></i> Edit
                        </button>
                        <button type="button" onclick="openDeleteOrgModal('${org.org_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: var(--danger); font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(239,68,68,0.12)'" onmouseout="this.style.background='none'">
                            <i class="fa-solid fa-trash-can" style="color: var(--danger); width: 14px;"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* Quick Toggle Active / Inactive Status */
async function toggleOrgStatus(orgId, newStatus) {
    const menu = document.getElementById(`org-action-menu-${orgId}`);
    if (menu) menu.classList.add('hidden');

    try {
        await apiRequest('PUT', `/api/admin/organizations/${orgId}`, { status: newStatus });
        showToast(`Organization status updated to ${newStatus}!`, 'success');
        await loadOrganizations();
    } catch (err) {
        showToast(err.message || 'Failed to update status', 'error');
    }
}
window.toggleOrgStatus = toggleOrgStatus;

/* Helper to sync status toggle UI in Create / Edit Modal */
function updateOrgStatusToggleUI(isActive) {
    const toggle = document.getElementById('org-status-toggle');
    const text = document.getElementById('org-status-text');
    if (toggle) toggle.checked = isActive;
    if (text) {
        text.textContent = isActive ? 'Active' : 'Inactive';
        text.style.color = isActive ? '#10b981' : '#ef4444';
    }
}
window.updateOrgStatusToggleUI = updateOrgStatusToggleUI;

function onOrgPageSizeChange(newSize) {
    orgPageSize = parseInt(newSize, 10) || 10;
    currentOrgPage = 1;
    loadOrganizations(1);
}

/* Render Server-Side Pagination Bar */
function renderOrgPagination(data) {
    const container = document.getElementById('org-pagination-container');
    if (!container) return;

    const total = data.total || 0;
    const page = data.page || 1;
    const totalPages = data.total_pages || 1;
    const limit = data.limit || orgPageSize;

    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = paginationBarHTML({
        page: page,
        totalPages: totalPages,
        total: total,
        limit: limit,
        onPage: 'loadOrganizations',
        onPageSize: 'onOrgPageSizeChange',
        pageSizes: [10, 25, 35, 50]
    });
}

/* Toggle Popover Dropdown Menu for Organization Action */
function toggleOrgActionMenu(e, orgId) {
    if (e) e.stopPropagation();
    const targetMenu = document.getElementById(`org-action-menu-${orgId}`);
    const isCurrentlyHidden = !targetMenu || targetMenu.classList.contains('hidden');

    document.querySelectorAll('.org-action-dropdown').forEach(el => el.classList.add('hidden'));

    if (targetMenu && isCurrentlyHidden) {
        targetMenu.classList.remove('hidden');
        if (e && e.currentTarget) {
            const btn = e.currentTarget;
            const rect = btn.getBoundingClientRect();
            const menuHeight = targetMenu.offsetHeight || 130;
            const menuWidth = targetMenu.offsetWidth || 140;
            const spaceBelow = window.innerHeight - rect.bottom;

            targetMenu.style.position = 'fixed';
            targetMenu.style.right = 'auto';
            targetMenu.style.left = `${Math.min(window.innerWidth - menuWidth - 16, Math.max(10, rect.right - menuWidth))}px`;
            targetMenu.style.zIndex = '99999';

            if (spaceBelow < menuHeight + 15 && rect.top > menuHeight + 15) {
                targetMenu.style.top = `${rect.top - menuHeight - 4}px`;
                targetMenu.style.bottom = 'auto';
            } else {
                targetMenu.style.top = `${rect.bottom + 4}px`;
                targetMenu.style.bottom = 'auto';
            }
        }
    }
}

/* Close action menus on outside click */
document.addEventListener('click', (e) => {
    document.querySelectorAll('.org-action-dropdown').forEach(el => {
        if (!el.contains(e.target)) {
            el.classList.add('hidden');
        }
    });
});
window.addEventListener('scroll', () => {
    document.querySelectorAll('.org-action-dropdown').forEach(el => el.classList.add('hidden'));
}, true);

/* Open View Organization Details Modal */
async function openViewOrgModal(orgId) {
    const menu = document.getElementById(`org-action-menu-${orgId}`);
    if (menu) menu.classList.add('hidden');

    try {
        const org = await apiRequest('GET', `/api/admin/organizations/${orgId}`);
        if (!org) return;

        const indLabel = INDUSTRY_LABELS[org.industry] || org.industry;
        const sizeLabel = COMPANY_SIZE_LABELS[org.company_size] || org.company_size;
        const formattedDate = org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

        document.getElementById('view-org-name').textContent = org.organization_name;
        document.getElementById('view-org-industry').textContent = indLabel;
        document.getElementById('view-org-size').textContent = sizeLabel;
        document.getElementById('view-org-date').textContent = formattedDate;

        const logoBox = document.getElementById('view-org-logo');
        if (logoBox) {
            if (org.image) {
                logoBox.innerHTML = `<img src="${org.image}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
            } else {
                logoBox.innerHTML = '<i class="fa-solid fa-building"></i>';
            }
        }

        const modal = document.getElementById('view-org-modal');
        if (modal) modal.classList.add('open');
    } catch (err) {
        showToast(err.message || 'Failed to fetch organization details.', 'error');
    }
}

function closeViewOrgModal() {
    const modal = document.getElementById('view-org-modal');
    if (modal) modal.classList.remove('open');
}

/* Open Create Organization Modal */
function openCreateOrgModal() {
    document.getElementById('org-modal-title').textContent = 'Create Organization';
    document.getElementById('org-id-hidden').value = '';
    document.getElementById('org-name-input').value = '';
    document.getElementById('org-industry-select').value = '';
    document.getElementById('org-size-select').value = '';
    updateOrgStatusToggleUI(true);
    document.getElementById('org-logo-file').value = '';
    orgLogoBase64 = null;

    const circlePreview = document.getElementById('org-circle-preview');
    if (circlePreview) {
        circlePreview.innerHTML = '<i class="fa-solid fa-building"></i>';
    }

    const modal = document.getElementById('org-modal');
    if (modal) modal.classList.add('open');
}

/* Open Edit Organization Modal */
async function openEditOrgModal(orgId) {
    const menu = document.getElementById(`org-action-menu-${orgId}`);
    if (menu) menu.classList.add('hidden');

    try {
        const org = await apiRequest('GET', `/api/admin/organizations/${orgId}`);
        if (!org) return;

        document.getElementById('org-modal-title').textContent = 'Edit Organization';
        document.getElementById('org-id-hidden').value = org.org_id;
        document.getElementById('org-name-input').value = org.organization_name;
        document.getElementById('org-industry-select').value = org.industry;
        document.getElementById('org-size-select').value = org.company_size;
        updateOrgStatusToggleUI(org.status !== 'inactive');
        orgLogoBase64 = org.image || null;

        const circlePreview = document.getElementById('org-circle-preview');
        if (circlePreview) {
            if (org.image) {
                circlePreview.innerHTML = `<img src="${org.image}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
            } else {
                circlePreview.innerHTML = '<i class="fa-solid fa-building"></i>';
            }
        }

        const modal = document.getElementById('org-modal');
        if (modal) modal.classList.add('open');
    } catch (err) {
        showToast(err.message || 'Failed to fetch organization details.', 'error');
    }
}

/* Close Organization Modal */
function closeOrgModal() {
    const modal = document.getElementById('org-modal');
    if (modal) modal.classList.remove('open');
}

/* Handle Organization Logo File Change */
function onOrgLogoFileChange(event) {
    const file = event.target.files[0];
    const circlePreview = document.getElementById('org-circle-preview');
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image size exceeds 2MB limit.', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            orgLogoBase64 = e.target.result;
            if (circlePreview) {
                circlePreview.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
            }
        };
        reader.readAsDataURL(file);
    }
}

/* Save Organization Form Handler (Create or Update) */
async function handleSaveOrganization(e) {
    e.preventDefault();

    const orgId = document.getElementById('org-id-hidden').value;
    const name = document.getElementById('org-name-input').value.trim();
    const industry = document.getElementById('org-industry-select').value;
    const companySize = document.getElementById('org-size-select').value;
    const status = document.getElementById('org-status-toggle')?.checked ? 'active' : 'inactive';

    if (!name || !industry || !companySize) {
        showToast('Please fill in all required fields (Organization Name, Industry, Company Size).', 'error');
        return;
    }

    const btn = document.getElementById('org-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    try {
        const payload = {
            organization_name: name,
            industry: industry,
            company_size: companySize,
            status: status,
            image: orgLogoBase64
        };

        if (orgId) {
            // Update existing
            await apiRequest('PUT', `/api/admin/organizations/${orgId}`, payload);
            showToast('Organization updated successfully!', 'success');
        } else {
            // Create new
            await apiRequest('POST', '/api/admin/organizations', payload);
            showToast('Organization created successfully!', 'success');
        }

        closeOrgModal();
        await loadOrganizations();
    } catch (err) {
        showToast(err.message || 'Failed to save organization.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Organization';
        }
    }
}

/* Delete Organization Modals */
function openDeleteOrgModal(orgId) {
    const menu = document.getElementById(`org-action-menu-${orgId}`);
    if (menu) menu.classList.add('hidden');

    deletingOrgId = orgId;
    const modal = document.getElementById('delete-org-modal');
    if (modal) modal.classList.add('open');
}

function closeDeleteOrgModal() {
    deletingOrgId = null;
    const modal = document.getElementById('delete-org-modal');
    if (modal) modal.classList.remove('open');
}

async function confirmDeleteOrgAction() {
    if (!deletingOrgId) return;

    const btn = document.getElementById('confirm-delete-org-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Deleting...';
    }

    try {
        await apiRequest('DELETE', `/api/admin/organizations/${deletingOrgId}`);
        showToast('Organization deleted successfully!', 'success');
        closeDeleteOrgModal();
        await loadOrganizations();
    } catch (err) {
        showToast(err.message || 'Failed to delete organization.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Delete';
        }
    }
}
