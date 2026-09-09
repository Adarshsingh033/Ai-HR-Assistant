/* ========================================================
   admin.js – Dynamic Admin Portal Logic with Profile & Organization CRUD
   ======================================================== */

let currentAdminProfile = null;
let updatedProfileImageBase64 = null;
let orgLogoBase64 = null;
let deletingOrgId = null;

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

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'admin') {
        location.href = '../index.html';
        return;
    }

    // Load admin profile dynamically from DB via API
    await loadAdminProfile();

    // Initial load of organizations
    await loadOrganizations();
});

/* Fetch Admin Profile from Database */
async function loadAdminProfile() {
    try {
        const data = await apiRequest('GET', '/api/admin/profile');
        if (data) {
            currentAdminProfile = data;
            renderAdminProfile(data);
        }
    } catch (err) {
        console.warn('Failed to load profile from API, fallback to session data:', err);
        const session = Session.get();
        if (session) {
            renderAdminProfile({
                full_name: session.username || 'Admin',
                username: session.username || 'admin',
                email: `${(session.username || 'admin').toLowerCase().replace(/\s+/g, '')}@example.com`,
                phone: session.phone || '',
                profile_image: session.profile_image || ''
            });
        }
    }
}

/* Render Admin Profile Data onto UI */
function renderAdminProfile(data) {
    const fullName = data.full_name || data.username || 'Admin';
    const username = data.username || 'admin';
    const email = data.email || '';
    const phone = data.phone || '';
    const profileImg = data.profile_image || '';
    const initials = fullName.substring(0, 2).toUpperCase();

    // Sidebar User Chip
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarRole = document.getElementById('sidebar-role');
    const sidebarAvatar = document.getElementById('sidebar-avatar');

    if (sidebarName) sidebarName.textContent = fullName;
    if (sidebarRole) sidebarRole.textContent = 'Admin';
    if (sidebarAvatar) {
        if (profileImg) {
            sidebarAvatar.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            sidebarAvatar.textContent = initials;
        }
    }

    // Profile Left Card
    const cardName = document.getElementById('profile-card-name');
    const cardEmail = document.getElementById('profile-card-email');
    const avatarLarge = document.getElementById('profile-avatar-large');

    if (cardName) cardName.textContent = fullName;
    if (cardEmail) cardEmail.textContent = email;
    if (avatarLarge) {
        if (profileImg) {
            avatarLarge.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            avatarLarge.textContent = initials;
        }
    }

    // Profile Form Inputs
    const fullNameInput = document.getElementById('profile-full-name');
    const usernameInput = document.getElementById('profile-username');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');

    if (fullNameInput) fullNameInput.value = fullName;
    if (usernameInput) usernameInput.value = username;
    if (emailInput) emailInput.value = email;
    if (phoneInput) phoneInput.value = phone;

    // Profile Image Circle Preview
    const circlePreview = document.getElementById('profile-circle-preview');
    if (circlePreview) {
        if (profileImg) {
            circlePreview.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            circlePreview.innerHTML = initials;
        }
    }
}

/* Handle Image File Selection in Profile */
function onProfileImageFileChange(event) {
    const file = event.target.files[0];
    const circlePreview = document.getElementById('profile-circle-preview');
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image size exceeds 2MB limit.', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            updatedProfileImageBase64 = e.target.result;
            if (circlePreview) {
                circlePreview.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
            }
        };
        reader.readAsDataURL(file);
    }
}

/* Save Changes button handler */
async function handleSaveProfile(e) {
    e.preventDefault();

    const fullName = document.getElementById('profile-full-name')?.value.trim();
    const username = document.getElementById('profile-username')?.value.trim();
    const email = document.getElementById('profile-email')?.value.trim();
    const phone = document.getElementById('profile-phone')?.value.trim() || '';

    if (!fullName || !username || !email) {
        showToast('Full Name, Username, and Email Address are required.', 'error');
        return;
    }

    if (phone && !/^\d{10}$/.test(phone)) {
        showToast('Phone number must be exactly 10 digits.', 'error');
        return;
    }

    const btn = document.getElementById('save-profile-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    try {
        const payload = {
            full_name: fullName,
            username: username,
            email: email,
            phone: phone,
        };

        if (updatedProfileImageBase64 !== null) {
            payload.profile_image = updatedProfileImageBase64;
        }

        const data = await apiRequest('PUT', '/api/admin/profile', payload);
        if (data) {
            currentAdminProfile = data;
            renderAdminProfile(data);

            // Update session data
            Session.set({
                user_id: data.user_id,
                username: data.username,
                role: data.role,
                phone: data.phone,
                profile_image: data.profile_image
            });

            showToast('Profile updated successfully!', 'success');
        }
    } catch (err) {
        showToast(err.message || 'Failed to update profile.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    }
}

/* ========================================================
   ORGANIZATION CRUD LOGIC WITH SEARCH & FILTERS
   ======================================================== */

let orgFilterTimeout = null;

function onOrgFilterChange() {
    clearTimeout(orgFilterTimeout);
    orgFilterTimeout = setTimeout(() => {
        loadOrganizations();
    }, 250);
}

/* Fetch and Render Organizations with Search & Filters */
async function loadOrganizations() {
    const tbody = document.getElementById('org-table-body');
    if (!tbody) return;

    const search = document.getElementById('org-search-input')?.value.trim() || '';
    const industry = document.getElementById('org-filter-industry')?.value || '';
    const companySize = document.getElementById('org-filter-size')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (industry) params.append('industry', industry);
    if (companySize) params.append('company_size', companySize);

    const queryString = params.toString() ? `?${params.toString()}` : '';

    try {
        const data = await apiRequest('GET', `/api/admin/organizations${queryString}`);
        const orgs = data.organizations || [];
        renderOrganizationsTable(orgs);
    } catch (err) {
        console.error('Failed to load organizations:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #ef4444; padding: 24px;">
                    Failed to load organizations. Please try again.
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
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px; font-weight: 500;">
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
        
        // Logo Column (Separate)
        const logoContent = org.image
            ? `<img src="${org.image}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.15);" />`
            : `<div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: #818cf8; display: flex; align-items: center; justify-content: center; font-size: 1.05rem;"><i class="fa-solid fa-building"></i></div>`;

        return `
            <tr>
                <!-- 1. Logo Column -->
                <td style="text-align: center; width: 70px;">
                    <div style="display: flex; justify-content: center;">
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

                <!-- 5. Created At Column -->
                <td style="color: var(--text-muted); font-size: 0.85rem;">${formattedDate}</td>

                <!-- 6. Actions Column (Horizontal 3-Dot Menu) -->
                <td style="text-align: right; position: relative;">
                    <button type="button" onclick="toggleOrgActionMenu(event, '${org.org_id}')" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; transition: all 0.2s ease;" title="Actions">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    <!-- Popover Dropdown Menu -->
                    <div id="org-action-menu-${org.org_id}" class="org-action-dropdown hidden" style="position: absolute; right: 16px; top: 46px; width: 140px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.6); z-index: 100; overflow: hidden;">
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

/* Toggle Popover Dropdown Menu for Organization Action */
function toggleOrgActionMenu(e, orgId) {
    if (e) e.stopPropagation();
    
    // Close any other open menus
    document.querySelectorAll('.org-action-dropdown').forEach(el => {
        if (el.id !== `org-action-menu-${orgId}`) {
            el.classList.add('hidden');
        }
    });

    const menu = document.getElementById(`org-action-menu-${orgId}`);
    if (menu) {
        menu.classList.toggle('hidden');
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

/* Open View Organization Details Modal */
async function openViewOrgModal(orgId) {
    // Close popover menu
    const menu = document.getElementById(`org-action-menu-${orgId}`);
    if (menu) menu.classList.add('hidden');

    try {
        const org = await apiRequest('GET', `/api/admin/organizations/${orgId}`);
        if (!org) return;

        const indLabel = INDUSTRY_LABELS[org.industry] || org.industry;
        const sizeLabel = COMPANY_SIZE_LABELS[org.company_size] || org.company_size;
        const formattedDate = org.created_at ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

        document.getElementById('view-org-name').textContent = org.organization_name;
        document.getElementById('view-org-id').textContent = `ID: ${org.org_id}`;
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

/* Helper to escape HTML characters */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

/* Open Create Organization Modal */
function openCreateOrgModal() {
    document.getElementById('org-modal-title').textContent = 'Create Organization';
    document.getElementById('org-id-hidden').value = '';
    document.getElementById('org-name-input').value = '';
    document.getElementById('org-industry-select').value = '';
    document.getElementById('org-size-select').value = '';
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
    // Close popover menu
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
    // Close popover menu
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

/* Toggle Sidebar User Menu Popover */
function toggleUserMenu(e) {
    if (e) e.stopPropagation();
    const popover = document.getElementById('user-menu-popover');
    if (popover) {
        popover.classList.toggle('hidden');
    }
}

/* Close User Popover Menu when clicking outside */
document.addEventListener('click', (e) => {
    const popover = document.getElementById('user-menu-popover');
    const chip = document.getElementById('user-chip');
    if (popover && !popover.classList.contains('hidden')) {
        if (!popover.contains(e.target) && !chip?.contains(e.target)) {
            popover.classList.add('hidden');
        }
    }
});

/* Open Profile View from Popover Menu */
function openProfileView(e) {
    if (e) e.preventDefault();
    const popover = document.getElementById('user-menu-popover');
    if (popover) popover.classList.add('hidden');
    switchTab('profile');
}

/* Tab Switching Logic: Dashboard, Organization, Branch, HR, Profile */
function switchTab(tab) {
    const sections = {
        'dashboard': document.getElementById('section-dashboard'),
        'org': document.getElementById('section-org'),
        'branch': document.getElementById('section-branch'),
        'hr': document.getElementById('section-hr'),
        'profile': document.getElementById('section-profile')
    };

    const navs = {
        'dashboard': document.getElementById('nav-dashboard'),
        'org': document.getElementById('nav-org'),
        'branch': document.getElementById('nav-branch'),
        'hr': document.getElementById('nav-hr')
    };

    const titles = {
        'dashboard': 'Dashboard',
        'org': 'Organization',
        'branch': 'Branch',
        'hr': 'HR',
        'profile': 'Profile'
    };

    Object.keys(sections).forEach(k => {
        if (k === tab) {
            sections[k]?.classList.remove('hidden');
        } else {
            sections[k]?.classList.add('hidden');
        }
    });

    Object.keys(navs).forEach(k => {
        if (k === tab) {
            navs[k]?.classList.add('active');
        } else {
            navs[k]?.classList.remove('active');
        }
    });

    const pageTitle = document.getElementById('page-title');
    if (pageTitle && titles[tab]) {
        pageTitle.textContent = titles[tab];
    }

    if (tab === 'org') {
        loadOrganizations();
    }
}
