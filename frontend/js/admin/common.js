/* ========================================================
   admin/common.js – Admin Common Session, Navigation & Modals
   ======================================================== */

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'admin') {
        location.href = '../index.html';
        return;
    }

    // Populate sidebar user chip dynamically across all admin pages
    await loadAdminProfileForSidebar();
});

function updateSidebarUserChip(name, profileImg) {
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarRole = document.getElementById('sidebar-role');
    const sidebarAvatar = document.getElementById('sidebar-avatar');

    if (sidebarName) sidebarName.textContent = name || 'Admin';
    if (sidebarRole) sidebarRole.textContent = 'System Admin';
    if (sidebarAvatar) {
        if (profileImg) {
            sidebarAvatar.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            const initials = (name || 'A').substring(0, 2).toUpperCase();
            sidebarAvatar.textContent = initials;
        }
    }
}

// Immediate synchronous render from local Session storage (0ms delay, no flash!)
function syncAdminSidebarFromSession() {
    try {
        if (typeof Session !== 'undefined') {
            const session = Session.get();
            if (session) {
                updateSidebarUserChip(session.full_name || session.username || 'Admin', session.profile_image || '');
            }
        }
    } catch (e) {}
}

// Execute sync right away if script executes after DOM elements
syncAdminSidebarFromSession();

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'admin') {
        location.href = '../index.html';
        return;
    }

    // Render immediately from session cache
    syncAdminSidebarFromSession();

    // Background sync from backend profile API
    await loadAdminProfileForSidebar();
});

/* Fetch Profile Data for Sidebar Chip */
async function loadAdminProfileForSidebar() {
    try {
        const data = await apiRequest('GET', '/api/admin/profile');
        if (data) {
            updateSidebarUserChip(data.full_name || data.username, data.profile_image);
            const session = Session.get();
            if (session) {
                session.full_name = data.full_name || session.full_name;
                session.profile_image = data.profile_image || session.profile_image;
                Session.set(session);
            }
        }
    } catch (err) {
        syncAdminSidebarFromSession();
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
    if (modal) modal.classList.add('open');
}

function closeLogoutModal() {
    const modal = document.getElementById('logout-confirm-modal');
    if (modal) modal.classList.remove('open');
}

function confirmLogoutAction() {
    Session.clear();
    location.href = '../index.html';
}
