function updateSidebarUserChip(name, profileImg, roleText = 'HR Manager') {
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarOrg = document.getElementById('sidebar-org');
    const sidebarAvatar = document.getElementById('sidebar-avatar');

    if (sidebarName) sidebarName.textContent = name || 'HR User';
    if (sidebarOrg) sidebarOrg.textContent = roleText;
    if (sidebarAvatar) {
        if (profileImg) {
            sidebarAvatar.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            const initials = (name || 'H').substring(0, 2).toUpperCase();
            sidebarAvatar.textContent = initials;
        }
    }
}

// Immediate synchronous render from local Session storage (0ms delay, no flash!)
function syncHRSidebarFromSession() {
    try {
        if (typeof Session !== 'undefined') {
            const session = Session.get();
            if (session) {
                const org = session.organization_name || session.org_name || session.branch_name;
                updateSidebarUserChip(session.full_name || session.username || 'HR User', session.profile_image || '', org || 'HR Manager');
            }
        }
    } catch (e) {}
}

// Execute sync right away if script executes after DOM elements
syncHRSidebarFromSession();

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || (session.role !== 'hr' && session.role !== 'admin')) {
        location.href = '../index.html';
        return;
    }

    // Render immediately from session cache
    syncHRSidebarFromSession();

    // Background sync from backend profile API
    await loadHRProfileForSidebar();
});

/* Fetch Profile Data for Sidebar Chip */
async function loadHRProfileForSidebar() {
    try {
        const data = await apiRequest('GET', '/api/hr/profile');
        if (data) {
            const orgName = data.organization_name || data.branch_name || 'HR Manager';
            updateSidebarUserChip(data.full_name || data.username, data.profile_image, orgName);
            const session = Session.get();
            if (session) {
                session.full_name = data.full_name || session.full_name;
                session.profile_image = data.profile_image || session.profile_image;
                session.organization_name = orgName;
                Session.set(session);
            }
        }
    } catch (err) {
        syncHRSidebarFromSession();
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

/* Logout Modals */
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
        window.location.href = '../index.html';
    }, 800);
}
