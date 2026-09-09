/* ========================================================
   admin/hr.js – HR / Organization Members Module (Full Profile CRUD, Cascading Filters & Tooltips)
   ======================================================== */

const memberState = {
    page: 1,
    limit: 10,
    search: '',
    organization_id: '',
    branch_id: '',
    status: '',
    total: 0,
    total_pages: 1,
    members: [],
    deleteTargetId: null
};

let cachedOrgsForMember = [];
let cachedBranchesForMember = [];
let memberSearchDebounce = null;
let memberPhotoBase64 = null;

window.loadMembers = loadMembers;
window.onMemberFilterChange = onMemberFilterChange;
window.handleSaveMember = handleSaveMember;
window.closeMemberModal = closeMemberModal;
window.closeViewMemberModal = closeViewMemberModal;
window.closeDeleteMemberModal = closeDeleteMemberModal;
window.confirmDeleteMemberAction = confirmDeleteMemberAction;
window.triggerMemberView = triggerMemberView;
window.triggerMemberEdit = triggerMemberEdit;
window.triggerMemberDelete = triggerMemberDelete;
window.toggleMemberStatus = toggleMemberStatus;
window.onModalOrgChange = onModalOrgChange;
window.onMemberPhotoChange = onMemberPhotoChange;

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'admin') return;

    await loadOrgAndBranchFilters();
    await loadMembers();
});

/* ── Load Organizations & Branches for Filter Bars ────────────────────── */
async function loadOrgAndBranchFilters() {
    try {
        const resOrgs = await apiRequest('GET', '/api/admin/organizations?status=active&limit=100');
        if (resOrgs && Array.isArray(resOrgs.organizations)) {
            cachedOrgsForMember = resOrgs.organizations;
            populateMemberOrgDropdowns();
        }

        const resBranches = await apiRequest('GET', '/api/admin/branches?limit=100');
        if (resBranches && Array.isArray(resBranches.branches)) {
            cachedBranchesForMember = resBranches.branches;
            populateMemberBranchFilterDropdown();
        }
    } catch (err) {
        console.error('Error fetching orgs/branches for member filter:', err);
    }
}

function populateMemberOrgDropdowns() {
    const filterSelect = document.getElementById('member-filter-org');
    if (filterSelect) {
        let opts = `<option value="" style="background: #0f172a; color: #fff;">All Organizations</option>`;
        cachedOrgsForMember.forEach(o => {
            opts += `<option value="${o.org_id}" style="background: #0f172a; color: #fff;">${escapeHtml(o.organization_name)}</option>`;
        });
        filterSelect.innerHTML = opts;
    }

    const formSelect = document.getElementById('member-org-select');
    if (formSelect) {
        let opts = `<option value="" disabled selected>Select Organization</option>`;
        cachedOrgsForMember.forEach(o => {
            opts += `<option value="${o.org_id}">${escapeHtml(o.organization_name)}</option>`;
        });
        formSelect.innerHTML = opts;
    }
}

function populateMemberBranchFilterDropdown() {
    const filterSelect = document.getElementById('member-filter-branch');
    if (!filterSelect) return;

    let opts = `<option value="" style="background: #0f172a; color: #fff;">All Branches</option>`;
    cachedBranchesForMember.forEach(b => {
        opts += `<option value="${b.branch_id}" style="background: #0f172a; color: #fff;">${escapeHtml(b.branch_name)}</option>`;
    });
    filterSelect.innerHTML = opts;
}

/* Cascading Branch Loader in Modal */
async function onModalOrgChange(selectedOrgId) {
    const branchSelect = document.getElementById('member-branch-select');
    if (!branchSelect) return;

    if (!selectedOrgId) {
        branchSelect.innerHTML = `<option value="" disabled selected>Select Branch</option>`;
        branchSelect.disabled = true;
        return;
    }

    branchSelect.disabled = false;
    branchSelect.innerHTML = `<option value="" disabled selected>Loading branches...</option>`;

    try {
        const res = await apiRequest('GET', `/api/admin/branches?organization_id=${selectedOrgId}&limit=100`);
        if (res && Array.isArray(res.branches) && res.branches.length > 0) {
            let opts = `<option value="" disabled selected>Select Branch</option>`;
            res.branches.forEach(b => {
                opts += `<option value="${b.branch_id}">${escapeHtml(b.branch_name)}</option>`;
            });
            branchSelect.innerHTML = opts;
        } else {
            branchSelect.innerHTML = `<option value="" disabled selected>No branches available for this organization</option>`;
        }
    } catch (err) {
        console.error('Error fetching branches for org:', err);
        branchSelect.innerHTML = `<option value="" disabled selected>Failed to load branches</option>`;
    }
}

/* Password Toggle Visibility Helper */
function toggleMemberPasswordVisibility() {
    const input = document.getElementById('member-password-input');
    const icon = document.getElementById('member-password-toggle-icon');
    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye';
    }
}
window.toggleMemberPasswordVisibility = toggleMemberPasswordVisibility;

/* Photo File Change Handler */
function onMemberPhotoChange(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('member-circle-preview');
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image size exceeds 2MB limit.', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            memberPhotoBase64 = e.target.result;
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
            }
        };
        reader.readAsDataURL(file);
    }
}

/* Filter Bar Handler */
function onMemberFilterChange() {
    clearTimeout(memberSearchDebounce);
    memberSearchDebounce = setTimeout(() => {
        memberState.page = 1;
        memberState.search = document.getElementById('member-search-input')?.value.trim() || '';
        memberState.organization_id = document.getElementById('member-filter-org')?.value || '';
        memberState.branch_id = document.getElementById('member-filter-branch')?.value || '';
        memberState.status = document.getElementById('member-filter-status')?.value || '';
        loadMembers();
    }, 250);
}

/* ── Fetch & Render Members ─────────────────────────────────────────────── */
async function loadMembers(page = memberState.page) {
    memberState.page = page;
    const tbody = document.getElementById('member-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 36px;">
                    <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Loading HR members...
                </td>
            </tr>
        `;
    }

    try {
        let query = `/api/admin/members?page=${memberState.page}&limit=${memberState.limit}`;
        if (memberState.search) query += `&search=${encodeURIComponent(memberState.search)}`;
        if (memberState.organization_id) query += `&organization_id=${encodeURIComponent(memberState.organization_id)}`;
        if (memberState.branch_id) query += `&branch_id=${encodeURIComponent(memberState.branch_id)}`;
        if (memberState.status) query += `&status=${encodeURIComponent(memberState.status)}`;

        const res = await apiRequest('GET', query);

        if (res && Array.isArray(res.members)) {
            memberState.members = res.members;
            memberState.total = res.total || 0;
            memberState.total_pages = res.total_pages || 1;

            renderMemberTable();
            renderMemberPagination();
        } else {
            showMemberError('Failed to load HR members.');
        }
    } catch (err) {
        console.error('loadMembers error:', err);
        showMemberError(err.message || 'Error connecting to server.');
    }
}

function showMemberError(msg) {
    const tbody = document.getElementById('member-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #ef4444; padding: 32px;">
                    ${escapeHtml(msg)}
                </td>
            </tr>
        `;
    }
}

/* Render Members Table */
function renderMemberTable() {
    const tbody = document.getElementById('member-table-body');
    if (!tbody) return;

    if (memberState.members.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px; font-weight: 500;">
                    No HR members found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = memberState.members.map(m => {
        const isInactive = m.status === 'inactive';

        // Avatar Image or Fallback Letter Box
        const avatarHtml = m.image
            ? `<img src="${m.image}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.15);" />`
            : `<div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(99, 102, 241, 0.15); border: 1.5px solid rgba(99, 102, 241, 0.3); color: #818cf8; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; font-weight: 700;">${m.full_name ? m.full_name.charAt(0).toUpperCase() : 'H'}</div>`;

        // Clickable status toggle pill with custom data-tooltip
        const statusBadge = isInactive
            ? `<button type="button" onclick="toggleMemberStatus('${m.member_id}', 'active')" data-tooltip="Click to set Active" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.12)'"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> Inactive</button>`
            : `<button type="button" onclick="toggleMemberStatus('${m.member_id}', 'inactive')" data-tooltip="Click to set Inactive" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(16, 185, 129, 0.25)'" onmouseout="this.style.background='rgba(16, 185, 129, 0.12)'"><i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> Active</button>`;

        return `
            <tr style="position: relative;">
                <!-- 1. Photo -->
                <td style="width: 55px; padding-left: 16px;">
                    ${avatarHtml}
                </td>

                <!-- 2. HR Member (Name & Username) -->
                <td>
                    <div style="font-weight: 700; color: #fff; font-size: 0.94rem;">${escapeHtml(m.full_name)}</div>
                    <div style="font-size: 0.78rem; color: #818cf8; font-weight: 600;">@${escapeHtml(m.username)}</div>
                </td>

                <!-- 3. Email & Phone -->
                <td>
                    <div style="font-size: 0.86rem; color: rgba(255,255,255,0.9); font-weight: 500;">${escapeHtml(m.email)}</div>
                    <div style="font-size: 0.78rem; color: rgba(255,255,255,0.5);">${escapeHtml(m.phone || '—')}</div>
                </td>

                <!-- 4. Organization -->
                <td>
                    <div style="font-weight: 600; color: #a5b4fc; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-building" style="font-size: 0.78rem;"></i> ${escapeHtml(m.organization_name || '—')}
                    </div>
                </td>

                <!-- 5. Branch -->
                <td>
                    <div style="font-weight: 600; color: #38bdf8; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-code-branch" style="font-size: 0.75rem;"></i> ${escapeHtml(m.branch_name || '—')}
                    </div>
                </td>

                <!-- 6. Status -->
                <td>
                    ${statusBadge}
                </td>

                <!-- 6. Actions (3-Dot Menu) -->
                <td style="text-align: right; position: relative;">
                    <button type="button" onclick="toggleMemberActionMenu(event, '${m.member_id}')" data-tooltip="Actions" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; transition: all 0.2s ease;">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    <!-- Dropdown Menu -->
                    <div id="member-action-menu-${m.member_id}" class="member-action-dropdown hidden" style="position: absolute; right: 8px; top: 44px; width: 140px; background: #0f172a; border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 1000; overflow: hidden;">
                        <button type="button" onclick="triggerMemberView('${m.member_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: #fff; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='none'">
                            <i class="fa-regular fa-eye" style="color: #60a5fa; width: 14px;"></i> View
                        </button>
                        <button type="button" onclick="triggerMemberEdit('${m.member_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: #fff; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='none'">
                            <i class="fa-solid fa-pen-to-square" style="color: #a5b4fc; width: 14px;"></i> Edit
                        </button>
                        <button type="button" onclick="triggerMemberDelete('${m.member_id}')" style="width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; color: #ef4444; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(239,68,68,0.12)'" onmouseout="this.style.background='none'">
                            <i class="fa-solid fa-trash-can" style="color: #ef4444; width: 14px;"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* Action Menu Toggle */
function toggleMemberActionMenu(e, id) {
    e.stopPropagation();
    const targetMenu = document.getElementById(`member-action-menu-${id}`);
    const isCurrentlyHidden = !targetMenu || targetMenu.classList.contains('hidden');

    document.querySelectorAll('.member-action-dropdown').forEach(m => m.classList.add('hidden'));

    if (targetMenu && isCurrentlyHidden) {
        targetMenu.classList.remove('hidden');
        if (e && e.currentTarget) {
            const btn = e.currentTarget;
            const rect = btn.getBoundingClientRect();
            const menuHeight = targetMenu.offsetHeight || 150;
            const menuWidth = targetMenu.offsetWidth || 140;
            const spaceBelow = window.innerHeight - rect.bottom;

            targetMenu.style.position = 'fixed';
            targetMenu.style.left = `${Math.max(10, rect.right - menuWidth)}px`;
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

document.addEventListener('click', () => {
    document.querySelectorAll('.member-action-dropdown').forEach(m => m.classList.add('hidden'));
});
window.addEventListener('scroll', () => {
    document.querySelectorAll('.member-action-dropdown').forEach(m => m.classList.add('hidden'));
}, true);

function changeMemberLimit(newLimit) {
    memberState.limit = parseInt(newLimit, 10) || 10;
    memberState.page = 1;
    loadMembers(1);
}

function renderMemberPagination() {
    const container = document.getElementById('member-pagination-container');
    if (!container) return;

    if (memberState.total === 0) {
        container.innerHTML = '';
        return;
    }

    const startItem = (memberState.page - 1) * memberState.limit + 1;
    const endItem = Math.min(memberState.page * memberState.limit, memberState.total);
    const currentPage = memberState.page;
    const totalPages = memberState.total_pages || 1;

    let pageBtns = '';
    const maxVisiblePages = 7;
    let startPage = 1;
    let endPage = totalPages;

    if (totalPages > maxVisiblePages) {
        if (currentPage <= 4) {
            startPage = 1;
            endPage = 5;
        } else if (currentPage >= totalPages - 3) {
            startPage = totalPages - 4;
            endPage = totalPages;
        } else {
            startPage = currentPage - 2;
            endPage = currentPage + 2;
        }
    }

    if (startPage > 1) {
        pageBtns += `<button onclick="loadMembers(1)" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">1</button>`;
        if (startPage > 2) {
            pageBtns += `<span style="color:rgba(255,255,255,0.4);font-size:0.8rem;padding:0 2px;">…</span>`;
        }
    }

    for (let p = startPage; p <= endPage; p++) {
        if (p === currentPage) {
            pageBtns += `<button style="width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,0.18);color:#fff;font-size:0.82rem;font-weight:700;cursor:default;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${p}</button>`;
        } else {
            pageBtns += `<button onclick="loadMembers(${p})" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.82rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">${p}</button>`;
        }
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageBtns += `<span style="color:rgba(255,255,255,0.4);font-size:0.8rem;padding:0 2px;">…</span>`;
        }
        pageBtns += `<button onclick="loadMembers(${totalPages})" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">${totalPages}</button>`;
    }

    const isPrevDisabled = currentPage <= 1;
    const isNextDisabled = currentPage >= totalPages;

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px; padding: 12px 20px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; flex-wrap: wrap; gap: 16px; backdrop-filter: blur(10px); font-family: 'Inter', sans-serif;">
            <div style="display: flex; align-items: center; gap: 16px; font-size: 0.82rem; color: rgba(255,255,255,0.6); font-weight: 500;">
                <span>${startItem}–${endItem} of ${memberState.total} <span style="margin:0 4px;opacity:0.4;">·</span> Page ${currentPage} of ${totalPages}</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>Rows per page:</span>
                    <select onchange="changeMemberLimit(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: #fff; border-radius: 8px; padding: 3px 8px; font-size: 0.8rem; font-weight: 600; outline: none; cursor: pointer;">
                        <option value="10" ${memberState.limit === 10 ? 'selected' : ''}>10</option>
                        <option value="25" ${memberState.limit === 25 ? 'selected' : ''}>25</option>
                        <option value="50" ${memberState.limit === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${memberState.limit === 100 ? 'selected' : ''}>100</option>
                    </select>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 2px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 4px 6px;">
                <button onclick="loadMembers(1)" ${isPrevDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isPrevDisabled ? '0.3' : '1'};transition:all 0.15s;" title="First page">
                    <i class="fa-solid fa-angles-left"></i>
                </button>
                <button onclick="loadMembers(${currentPage - 1})" ${isPrevDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isPrevDisabled ? '0.3' : '1'};transition:all 0.15s;" title="Previous page">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                ${pageBtns}
                <button onclick="loadMembers(${currentPage + 1})" ${isNextDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isNextDisabled ? '0.3' : '1'};transition:all 0.15s;" title="Next page">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                <button onclick="loadMembers(${totalPages})" ${isNextDisabled ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${isNextDisabled ? '0.3' : '1'};transition:all 0.15s;" title="Last page">
                    <i class="fa-solid fa-angles-right"></i>
                </button>
            </div>
        </div>
    `;
}

/* Quick Toggle Active / Inactive Status */
async function toggleMemberStatus(memberId, newStatus) {
    try {
        await apiRequest('PUT', `/api/admin/members/${memberId}`, { status: newStatus });
        showToast(`Member status set to ${newStatus}!`, 'success');
        await loadMembers();
    } catch (err) {
        showToast(err.message || 'Failed to update member status', 'error');
    }
}

/* Toggle Switch Handler */
function updateMemberStatusToggleUI(isActive) {
    const toggle = document.getElementById('member-status-toggle');
    const text = document.getElementById('member-status-text');
    if (toggle) toggle.checked = isActive;
    if (text) {
        text.textContent = isActive ? 'Active' : 'Inactive';
        text.style.color = isActive ? '#10b981' : '#ef4444';
    }
}
window.updateMemberStatusToggleUI = updateMemberStatusToggleUI;

/* ── Modal Triggers ─────────────────────────────────────────────────────── */
function openCreateMemberModal() {
    populateMemberOrgDropdowns();

    document.getElementById('member-modal-title').textContent = 'Create HR Member';
    document.getElementById('member-id-hidden').value = '';
    document.getElementById('member-org-select').value = '';
    
    const branchSelect = document.getElementById('member-branch-select');
    if (branchSelect) {
        branchSelect.innerHTML = `<option value="" disabled selected>Select Organization First</option>`;
        branchSelect.disabled = true;
    }

    document.getElementById('member-fullname-input').value = '';
    document.getElementById('member-username-input').value = '';
    document.getElementById('member-email-input').value = '';
    document.getElementById('member-phone-input').value = '';
    
    const passInput = document.getElementById('member-password-input');
    const passIcon = document.getElementById('member-password-toggle-icon');
    if (passInput) {
        passInput.type = 'password';
        passInput.value = '';
        passInput.required = true;
        passInput.placeholder = 'Set password';
    }
    if (passIcon) {
        passIcon.className = 'fa-regular fa-eye';
    }
    const passReq = document.getElementById('member-password-req');
    if (passReq) passReq.style.display = 'inline';

    memberPhotoBase64 = null;
    const preview = document.getElementById('member-circle-preview');
    if (preview) preview.innerHTML = '<i class="fa-solid fa-user"></i>';

    updateMemberStatusToggleUI(true);

    const modal = document.getElementById('member-modal');
    if (modal) modal.classList.add('open');
}
window.openCreateMemberModal = openCreateMemberModal;

function closeMemberModal() {
    const modal = document.getElementById('member-modal');
    if (modal) modal.classList.remove('open');
}

async function triggerMemberEdit(memberId) {
    const m = memberState.members.find(item => item.member_id === memberId);
    if (!m) return;

    populateMemberOrgDropdowns();

    document.getElementById('member-modal-title').textContent = 'Edit HR Member';
    document.getElementById('member-id-hidden').value = m.member_id;
    document.getElementById('member-org-select').value = m.organization_id;

    await onModalOrgChange(m.organization_id);
    document.getElementById('member-branch-select').value = m.branch_id;

    document.getElementById('member-fullname-input').value = m.full_name || '';
    document.getElementById('member-username-input').value = m.username || '';
    document.getElementById('member-email-input').value = m.email || '';
    document.getElementById('member-phone-input').value = m.phone || '';

    const passInput = document.getElementById('member-password-input');
    if (passInput) {
        passInput.value = '';
        passInput.required = false;
        passInput.placeholder = '(Leave blank to keep existing)';
    }
    const passReq = document.getElementById('member-password-req');
    if (passReq) passReq.style.display = 'none';

    memberPhotoBase64 = m.image || null;
    const preview = document.getElementById('member-circle-preview');
    if (preview) {
        if (m.image) {
            preview.innerHTML = `<img src="${m.image}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
        } else {
            preview.innerHTML = '<i class="fa-solid fa-user"></i>';
        }
    }

    updateMemberStatusToggleUI(m.status !== 'inactive');

    const modal = document.getElementById('member-modal');
    if (modal) modal.classList.add('open');
}

async function handleSaveMember(e) {
    e.preventDefault();

    const memberId = document.getElementById('member-id-hidden').value;
    const orgId = document.getElementById('member-org-select').value;
    const branchId = document.getElementById('member-branch-select').value;
    const fullName = document.getElementById('member-fullname-input').value.trim();
    const username = document.getElementById('member-username-input').value.trim();
    const email = document.getElementById('member-email-input').value.trim();
    const phone = document.getElementById('member-phone-input').value.trim();
    const password = document.getElementById('member-password-input').value;
    const status = document.getElementById('member-status-toggle')?.checked ? 'active' : 'inactive';

    if (!orgId || !branchId || !fullName || !username || !email) {
        showToast('Please fill in all required fields.', 'error');
        return;
    }

    if (!memberId && !password) {
        showToast('Password is required for new HR member.', 'error');
        return;
    }

    if (phone && !/^\d+$/.test(phone)) {
        showToast('Phone number must contain only digits (no letters, spaces, or "+" allowed).', 'error');
        return;
    }

    const btn = document.getElementById('member-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    try {
        const payload = {
            organization_id: orgId,
            branch_id: branchId,
            full_name: fullName,
            username: username,
            email: email,
            phone: phone,
            image: memberPhotoBase64,
            status: status
        };
        if (password) payload.password = password;

        if (memberId) {
            await apiRequest('PUT', `/api/admin/members/${memberId}`, payload);
            showToast('HR Member updated successfully!', 'success');
        } else {
            await apiRequest('POST', '/api/admin/members', payload);
            showToast('HR Member created successfully!', 'success');
        }

        closeMemberModal();
        await loadMembers();
    } catch (err) {
        console.error('handleSaveMember error:', err);
        showToast(err.message || 'Error saving HR member', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save HR';
        }
    }
}

/* View Member Profile */
function triggerMemberView(memberId) {
    const m = memberState.members.find(item => item.member_id === memberId);
    if (!m) return;

    document.getElementById('view-member-fullname').textContent = m.full_name || '—';
    document.getElementById('view-member-username').textContent = `@${m.username || '—'}`;
    document.getElementById('view-member-email').textContent = m.email || '—';
    document.getElementById('view-member-phone').textContent = m.phone || '—';
    document.getElementById('view-member-org').textContent = m.organization_name || '—';
    document.getElementById('view-member-branch').textContent = m.branch_name || '—';
    document.getElementById('view-member-date').textContent = formatDate(m.created_at);

    const avatarBox = document.getElementById('view-member-avatar-box');
    if (avatarBox) {
        if (m.image) {
            avatarBox.innerHTML = `<img src="${m.image}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
        } else {
            avatarBox.innerHTML = '<i class="fa-solid fa-user"></i>';
        }
    }

    const statusEl = document.getElementById('view-member-status');
    if (statusEl) {
        const isInactive = m.status === 'inactive';
        statusEl.textContent = isInactive ? 'Inactive' : 'Active';
        statusEl.style.color = isInactive ? '#ef4444' : '#10b981';
        statusEl.style.background = isInactive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)';
    }

    const modal = document.getElementById('view-member-modal');
    if (modal) modal.classList.add('open');
}

function closeViewMemberModal() {
    const modal = document.getElementById('view-member-modal');
    if (modal) modal.classList.remove('open');
}

/* Delete Member */
function triggerMemberDelete(memberId) {
    memberState.deleteTargetId = memberId;
    const modal = document.getElementById('delete-member-modal');
    if (modal) modal.classList.add('open');
}

function closeDeleteMemberModal() {
    memberState.deleteTargetId = null;
    const modal = document.getElementById('delete-member-modal');
    if (modal) modal.classList.remove('open');
}

async function confirmDeleteMemberAction() {
    if (!memberState.deleteTargetId) return;

    const btn = document.getElementById('confirm-delete-member-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Deleting...';
    }

    try {
        await apiRequest('DELETE', `/api/admin/members/${memberState.deleteTargetId}`);
        showToast('HR Member deleted successfully!', 'success');
        closeDeleteMemberModal();
        await loadMembers();
    } catch (err) {
        console.error('Delete member error:', err);
        showToast(err.message || 'Failed to delete HR member', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Delete';
        }
    }
}
