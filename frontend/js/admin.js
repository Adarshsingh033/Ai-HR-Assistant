/* ========================================================
   admin.js – Admin Dashboard Logic – Decoupled Version
   ======================================================== */

let allOrgs = [];
let allHrs = [];

// Check session
window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (!session || session.role !== 'admin') {
        location.href = '../index.html';
        return;
    }

    // Populate user info
    document.getElementById('sidebar-name').textContent = session.username;
    document.getElementById('sidebar-avatar').textContent = session.username.charAt(0).toUpperCase();

    // Initial load
    refreshData();

    // Load admin accounts (structured rows)
    loadAdmins();
});

async function refreshData() {
    await Promise.all([
        fetchOrganizations(),
        fetchHRs()
    ]);
    renderOrganizations();
    renderHRs();
}

/* Tab Logic */
function switchTab(tab) {
    const sections = {
        'orgs': document.getElementById('section-orgs'),
        'hrs': document.getElementById('section-hrs')
    };
    const navs = {
        'orgs': document.getElementById('nav-orgs'),
        'hrs': document.getElementById('nav-hrs')
    };
    const titles = {
        'orgs': 'Organizations',
        'hrs': 'HR Managers'
    };
    const buttons = {
        'orgs': '<i class="fa-solid fa-plus"></i> New Organization',
        'hrs': '<i class="fa-solid fa-plus"></i> New HR Manager'
    };

    Object.keys(sections).forEach(k => {
        if (k === tab) {
            sections[k].classList.remove('hidden');
            navs[k].classList.add('active');
        } else {
            sections[k].classList.add('hidden');
            navs[k].classList.remove('active');
        }
    });

    document.getElementById('page-title').textContent = titles[tab];
    document.getElementById('btn-new-item').innerHTML = buttons[tab];
}

function handleNewItem() {
    const activeNav = document.querySelector('.nav-item.active').id;
    if (activeNav === 'nav-orgs') openCreateOrgModal();
    else openCreateHRModal();
}

/* Modal Helpers */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openCreateOrgModal() {
    document.getElementById('create-org-form').reset();
    openModal('create-org-modal');
}

function openCreateHRModal() {
    document.getElementById('create-hr-form').reset();
    openModal('create-hr-modal');
}

async function openAssignModal() {
    const hrSelect = document.getElementById('assign-hr-id');
    const orgSelect = document.getElementById('assign-org-id');

    hrSelect.innerHTML = '<option value="">-- Choose HR --</option>';
    orgSelect.innerHTML = '<option value="">-- Choose Organization --</option>';

    allHrs.forEach(hr => {
        const orgName = allOrgs.find(o => o.org_id === hr.org_id)?.company_name || 'None';
        hrSelect.innerHTML += `<option value="${hr.hr_id}">${hr.full_name} (@${hr.username}) [Assigned: ${orgName}]</option>`;
    });

    allOrgs.forEach(org => {
        orgSelect.innerHTML += `<option value="${org.org_id}">${org.company_name}</option>`;
    });

    openModal('assign-modal');
}

/* Fetching Logic */
async function fetchOrganizations() {
    try {
        const data = await apiRequest('GET', '/api/admin/organizations');
        allOrgs = data.organizations || [];
        document.getElementById('stat-orgs').textContent = allOrgs.length;
    } catch (err) {
        console.error('Failed to fetch orgs:', err);
    }
}

async function fetchHRs() {
    try {
        const data = await apiRequest('GET', '/api/admin/hrs');
        allHrs = data.hrs || [];
        document.getElementById('stat-hr').textContent = allHrs.length;
    } catch (err) {
        console.error('Failed to fetch HRs:', err);
    }
}

/* Rendering Logic */
function renderOrganizations() {
    const grid = document.getElementById('orgs-grid');
    const empty = document.getElementById('orgs-empty');
    grid.innerHTML = '';

    if (allOrgs.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    allOrgs.forEach(org => {
        const assignedHRs = allHrs.filter(hr => hr.org_id === org.org_id);
        const hrText = assignedHRs.length > 0
            ? assignedHRs.map(h => `<strong>${h.full_name}</strong>`).join(', ')
            : '<span class="text-muted">No HR Assigned</span>';

        const card = document.createElement('div');
        card.className = 'card org-card';
        card.innerHTML = `
            <div class="org-actions">
                <button class="btn btn-secondary btn-sm" onclick="delOrg('${org.org_id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="card-title mb-2">${org.company_name}</div>
            <span class="badge badge-accent">ID: ${org.org_id.substring(0, 8)}</span>
            <div class="org-meta">
                <div class="org-meta-item">
                    <span class="org-meta-icon"><i class="fa-solid fa-users"></i></span> 
                    <span>Assigned: ${hrText}</span>
                </div>
                <div class="org-meta-item">
                    <span class="org-meta-icon"><i class="fa-solid fa-calendar"></i></span> 
                    <span>Added: ${formatDate(org.created_at)}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderHRs() {
    const grid = document.getElementById('hrs-grid');
    const empty = document.getElementById('hrs-empty');
    grid.innerHTML = '';

    if (allHrs.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    allHrs.forEach(hr => {
        const orgName = allOrgs.find(o => o.org_id === hr.org_id)?.company_name || '<em>Not Assigned</em>';

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-title mb-2">${hr.full_name}</div>
            <div class="text-xs text-accent mb-3">@${hr.username}</div>
            <div class="org-meta">
                <div class="org-meta-item">
                    <span class="org-meta-icon">✉️</span> 
                    <span>${hr.email}</span>
                </div>
                <div class="org-meta-item">
                    <span class="org-meta-icon"><i class="fa-solid fa-building"></i></span> 
                    <span>Org: ${orgName}</span>
                </div>
                <div class="org-meta-item">
                    <span class="org-meta-icon"><i class="fa-solid fa-calendar"></i></span> 
                    <span>Joined: ${formatDate(hr.created_at)}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

/* Form Handlers */
async function handleCreateOrg(e) {
    e.preventDefault();
    const name = document.getElementById('org-name').value.trim();
    const btn = document.getElementById('btn-submit-org');

    setLoading(btn, true);
    try {
        await apiRequest('POST', '/api/admin/organizations', { company_name: name });
        showToast('Organization created!', 'success');
        closeModal('create-org-modal');
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function handleCreateHR(e) {
    e.preventDefault();
    const payload = {
        full_name: document.getElementById('hr-fullname').value.trim(),
        username: document.getElementById('hr-username').value.trim(),
        email: document.getElementById('hr-email').value.trim(),
        password: document.getElementById('hr-password').value.trim()
    };
    const btn = document.getElementById('btn-submit-hr');

    setLoading(btn, true);
    try {
        await apiRequest('POST', '/api/admin/hrs', payload);
        showToast('HR account created!', 'success');
        closeModal('create-hr-modal');
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function handleAssignHR(e) {
    e.preventDefault();
    const payload = {
        hr_id: document.getElementById('assign-hr-id').value,
        org_id: document.getElementById('assign-org-id').value
    };
    const btn = document.getElementById('btn-submit-assign');

    setLoading(btn, true);
    try {
        await apiRequest('POST', '/api/admin/assign-hr', payload);
        showToast('HR assigned successfully!', 'success');
        closeModal('assign-modal');
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function delOrg(id) {
    if (!confirm('Are you sure you want to delete this organization? HRs will be unassigned but not deleted.')) return;
    try {
        await apiRequest('DELETE', `/api/admin/organizations/${id}`);
        showToast('Organization deleted', 'success');
        refreshData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdmins() {
    const tbody = document.getElementById('admins-tbody');
    const wrap = document.getElementById('admins-table-wrap');
    if (!tbody) return;

    try {
        const data = await apiRequest('GET', '/api/auth/admins');
        const admins = data.admins || [];
        if (admins.length > 0) wrap.classList.remove('hidden');
        tbody.innerHTML = admins.map(a => `
            <tr>
                <td>${a.full_name}</td>
                <td class="text-accent">@${a.username}</td>
                <td>${a.email}</td>
                <td>${formatDate(a.created_at)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.warn('Admins load failed', err);
    }
}
