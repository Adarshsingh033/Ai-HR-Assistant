/* ========================================================
   hr_common.js – HR Common Session, Navigation & Modals
   ======================================================== */

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || (session.role !== 'hr' && session.role !== 'admin')) {
        location.href = '../index.html';
        return;
    }

    // Populate sidebar user chip dynamically across all HR pages
    await loadHRProfileForSidebar();
});

/* Fetch Profile Data for Sidebar Chip */
async function loadHRProfileForSidebar() {
    try {
        const data = await apiRequest('GET', '/api/hr/profile');
        if (data) {
            updateSidebarUserChip(data.full_name || data.username, data.profile_image, data.organization_name || data.branch_name || 'HR Manager');
        }
    } catch (err) {
        const session = Session.get();
        if (session) {
            updateSidebarUserChip(session.full_name || session.username || 'HR User', session.profile_image || '', 'HR Manager');
        }
    }
}

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
