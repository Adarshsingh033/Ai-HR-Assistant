const API_URL = '/api';

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const session = Session.require('super_admin');
    if (!session) return;
    
    const usernameDisplay = document.getElementById('sidebar-username');
    if (usernameDisplay) {
        usernameDisplay.textContent = session.username || 'Super Admin';
    }
});
