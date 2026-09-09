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
                <td colspan="7" style="text-align: center; color: #ef4444; padding: 24px;">
                    Failed to load organizations: ${escapeHtml(err.message || 'Request failed')}
                </td>
            </tr>
        `;
    }
}

/* Render Organizations Table */
function renderOrganizationsTable(orgs) {
    const tbody = document.getElementById('org-table-body');
    if (!tbody) return;

    if (!orgs || orgs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px; font-weight: 500;">
                    No organizations created yet
                </td>
            </tr>
        `;
        return;
    }

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
            ? `<button type="button" onclick="toggleOrgStatus('${org.org_id}', 'active')" data-tooltip="Click to set Active" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.12)'"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> Inactive</button>`
            : `<button type="button" onclick="toggleOrgStatus('${org.org_id}', 'inactive')" data-tooltip="Click to set Inactive" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(16, 185, 129, 0.25)'" onmouseout="this.style.background='rgba(16, 185, 129, 0.12)'"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> Active</button>`;

        return `
            <tr style="position: relative;">
                <!-- 1. Logo Column -->
                <td style="width: 65px; padding-left: 16px;">
                    <div style="display: flex; align-items: center;">
                        ${logoContent}
                    </div>
                </td>

                <!-- 2. Organization Column -->
                <td>
                    <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${escapeHtml(org.organization_name)}</div>
                </td>

                <!-- 3. Industry Column -->
                <td>
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 99px; background: rgba(59, 130, 246, 0.12); color: #60a5fa; font-size: 0.78rem; font-weight: 600; text-transform: capitalize;">
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
                    <button type="button" onclick="toggleOrgActionMenu(event, '${org.org_id}')" data-tooltip="Actions" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; transition: all 0.2s ease;">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    <!-- Popover Dropdown Menu (View, Edit, Delete Only) -->
                    <div id="org-action-menu-${org.org_id}" class="org-action-dropdown hidden" style="position: absolute; right: 8px; top: 44px; width: 140px; background: #0f172a; border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 1000; overflow: hidden;">
                        <button type="button" onclick="openViewOrgModal('${org.org_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: #fff; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='none'">
                            <i class="fa-regular fa-eye" style="color: #60a5fa; width: 14px;"></i> View
                        </button>
                        <button type="button" onclick="openEditOrgModal('${org.org_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: #fff; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='none'">
                            <i class="fa-solid fa-pen-to-square" style="color: #a5b4fc; width: 14px;"></i> Edit
                        </button>
                        <button type="button" onclick="openDeleteOrgModal('${org.org_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: #ef4444; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(239,68,68,0.12)'" onmouseout="this.style.background='none'">
                            <i class="fa-solid fa-trash-can" style="color: #ef4444; width: 14px;"></i> Delete
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

    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);

    let pageButtons = '';
    const maxVisiblePages = 7;
    let startPage = 1;
    let endPage = totalPages;

    if (totalPages > maxVisiblePages) {
        if (page <= 4) {
            startPage = 1;
            endPage = 5;
        } else if (page >= totalPages - 3) {
            startPage = totalPages - 4;
            endPage = totalPages;
        } else {
            startPage = page - 2;
            endPage = page + 2;
        }
    }

    if (startPage > 1) {
        pageButtons += `<button onclick="loadOrganizations(1)" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">1</button>`;
        if (startPage > 2) {
            pageButtons += `<span style="color:rgba(255,255,255,0.4);font-size:0.8rem;padding:0 2px;">…</span>`;
        }
    }

    for (let p = startPage; p <= endPage; p++) {
        if (p === page) {
            pageButtons += `<button style="width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,0.18);color:#fff;font-size:0.82rem;font-weight:700;cursor:default;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${p}</button>`;
        } else {
            pageButtons += `<button onclick="loadOrganizations(${p})" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.82rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">${p}</button>`;
        }
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageButtons += `<span style="color:rgba(255,255,255,0.4);font-size:0.8rem;padding:0 2px;">…</span>`;
        }
        pageButtons += `<button onclick="loadOrganizations(${totalPages})" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">${totalPages}</button>`;
    }

    const isPrevDisabled = page <= 1;
    const isNextDisabled = page >= totalPages;

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px; padding: 12px 20px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; flex-wrap: wrap; gap: 16px; backdrop-filter: blur(10px); font-family: 'Inter', sans-serif;">
            <div style="display: flex; align-items: center; gap: 16px; font-size: 0.82rem; color: rgba(255,255,255,0.6); font-weight: 500;">
                <span>${startItem}–${endItem} of ${total} <span style="margin:0 4px;opacity:0.4;">·</span> Page ${page} of ${totalPages}</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>Rows per page:</span>
                    <select id="org-page-size-select" onchange="onOrgPageSizeChange(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: #fff; border-radius: 8px; padding: 3px 8px; font-size: 0.8rem; font-weight: 600; outline: none; cursor: pointer;">
                        <option value="10" ${limit === 10 ? 'selected' : ''}>10</option>
                        <option value="25" ${limit === 25 ? 'selected' : ''}>25</option>
                        <option value="35" ${limit === 35 ? 'selected' : ''}>35</option>
                        <option value="50" ${limit === 50 ? 'selected' : ''}>50</option>
                    </select>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 2px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 4px 6px;">
                <button onclick="loadOrganizations(1)" ${isPrevDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isPrevDisabled ? '0.3' : '1'};transition:all 0.15s;" title="First page">
                    <i class="fa-solid fa-angles-left"></i>
                </button>
                <button onclick="loadOrganizations(${page - 1})" ${isPrevDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isPrevDisabled ? '0.3' : '1'};transition:all 0.15s;" title="Previous page">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                ${pageButtons}
                <button onclick="loadOrganizations(${page + 1})" ${isNextDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isNextDisabled ? '0.3' : '1'};transition:all 0.15s;" title="Next page">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                <button onclick="loadOrganizations(${totalPages})" ${isNextDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isNextDisabled ? '0.3' : '1'};transition:all 0.15s;" title="Last page">
                    <i class="fa-solid fa-angles-right"></i>
                </button>
            </div>
        </div>
    `;
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
