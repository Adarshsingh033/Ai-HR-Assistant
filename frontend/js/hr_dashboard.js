/* ========================================================
   hr_dashboard.js – HR Dashboard Logic
   ======================================================== */

window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (!session || session.role !== 'hr') {
        location.href = '../index.html';
        return;
    }

    // Populate user info
    document.getElementById('sidebar-name').textContent = session.username;
    document.getElementById('welcome-name').textContent = session.username;
    document.getElementById('sidebar-avatar').textContent = session.username.charAt(0).toUpperCase();

    // Load HR Dashboard Data
    if (session.org_id) {
        loadDashboardData(session.org_id);
    } else {
        showToast('You are not assigned to any organization yet. Please contact an admin.', 'warning');
        document.getElementById('welcome-name').textContent += ' (Unassigned)';
    }
});

async function loadDashboardData(orgId) {
    try {
        const data = await apiRequest('GET', `/api/hr/dashboard?org_id=${orgId}`);

        // Update Stats
        document.getElementById('stat-jobs').textContent = data.total_jobs || 0;
        document.getElementById('stat-candidates').textContent = data.total_candidates || 0;

        // Shortlisted is not tracked by the backend yet, keep mock 0 for now
        document.getElementById('stat-shortlisted').textContent = 0;

        // Update Org name in sidebar
        if (data.company_name) {
            document.getElementById('sidebar-org').textContent = data.company_name;
        }

    } catch (err) {
        showToast('Failed to load dashboard data', 'error');
        console.error(err);
    }
}
