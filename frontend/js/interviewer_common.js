/* ========================================================
   interviewer_common.js – Global utils for Interviewer Portal
   ======================================================== */

let interviewerProfile = null;

window.addEventListener('DOMContentLoaded', () => {
    checkInterviewerAuth();
});

function checkInterviewerAuth() {
    const session = Session.get();
    if (!session || session.role !== 'interviewer') {
        location.href = '../index.html';
        return;
    }
    syncInterviewerSidebarFromSession();
    fetchInterviewerProfile();
}

function syncInterviewerSidebarFromSession() {
    const session = Session.get();
    if (!session) return;
    
    const nameEl = document.getElementById('sidebar-name');
    const avatarEl = document.getElementById('sidebar-avatar');
    
    if (nameEl) nameEl.textContent = session.name || session.username;
    if (avatarEl) {
        avatarEl.textContent = (session.name || session.username || 'I').charAt(0).toUpperCase();
    }
}

async function fetchInterviewerProfile() {
    try {
        const data = await apiRequest('GET', '/api/interviewer/me');
        if (data && data.interviewer_id) {
            interviewerProfile = data;
            const nameEl = document.getElementById('sidebar-name');
            const avatarEl = document.getElementById('sidebar-avatar');
            const roleEl = document.getElementById('sidebar-role');
            
            if (nameEl) nameEl.textContent = data.full_name;
            if (avatarEl) avatarEl.textContent = data.full_name.charAt(0).toUpperCase();
            if (roleEl) roleEl.textContent = data.department_name || 'Interviewer';
        }
    } catch (e) {
        console.warn('Failed to fetch interviewer profile:', e);
    }
}

function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const popover = document.getElementById('user-menu-popover');
    if (popover) {
        popover.classList.toggle('hidden');
    }
}

document.addEventListener('click', (e) => {
    const popover = document.getElementById('user-menu-popover');
    const chip = document.getElementById('user-chip');
    if (popover && !popover.classList.contains('hidden')) {
        if (chip && !chip.contains(e.target) && !popover.contains(e.target)) {
            popover.classList.add('hidden');
        }
    }
});

function logout() {
    const m = document.getElementById('logout-confirm-modal');
    if (m) {
        m.classList.add('open');
    } else {
        confirmLogoutAction();
    }
}

function closeLogoutModal() {
    const m = document.getElementById('logout-confirm-modal');
    if (m) m.classList.remove('open');
}

function confirmLogoutAction() {
    Session.clear();
    location.href = '../index.html';
}
