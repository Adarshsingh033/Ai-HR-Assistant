/* ========================================================
   interviewer_dashboard.js – Interviewer Dashboard
   ======================================================== */

window.addEventListener('DOMContentLoaded', async () => {
    // Auth check happens in interviewer_common.js
    await loadDashboardStats();
    await loadRecentAssignments();
});

async function loadDashboardStats() {
    try {
        const data = await apiRequest('GET', '/api/interviewer/dashboard');
        if (data && data.stats) {
            document.getElementById('stat-pending').textContent = data.stats.active || 0;
            document.getElementById('stat-completed').textContent = data.stats.completed || 0;
        }
    } catch (e) {
        console.warn('Failed to load dashboard stats:', e);
    }
}

async function loadRecentAssignments() {
    const tbody = document.getElementById('pending-tbody');
    const empty = document.getElementById('pending-empty');
    const table = document.getElementById('pending-table');
    const skel = document.getElementById('pending-skeleton');

    if (!tbody && !empty && !table && !skel) return;

    try {
        const data = await apiRequest('GET', '/api/interviewer/my-interviewees?limit=5');
        const assignments = data.assignments || [];

        if (skel) skel.style.display = 'none';

        if (assignments.length === 0) {
            if (empty) empty.classList.remove('hidden');
            if (table) table.classList.add('hidden');
            return;
        }

        if (empty) empty.classList.add('hidden');
        if (table) table.classList.remove('hidden');

        if (tbody) {
            tbody.innerHTML = assignments.map(a => {
                const badgeStyle = 'background:rgba(99,102,241,0.15); color:#a5b4fc; border:1px solid rgba(99,102,241,0.3); padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700;';
                
                return `
                <tr>
                    <td>
                        <div style="font-weight:700; color:#fff;">${escapeHtml(a.candidate_name)}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(a.candidate_email)}</div>
                    </td>
                    <td>${escapeHtml(a.job_title)}</td>
                    <td>
                        <span style="${badgeStyle}">${escapeHtml(a.round_step)}</span>
                    </td>
                    <td>
                        <a href="interview.html?id=${a.assignment_id}" class="btn-sm btn-primary-sm">
                            <i class="fa-solid fa-play" style="font-size:0.75rem;"></i> Start
                        </a>
                    </td>
                </tr>`;
            }).join('');
        }
    } catch (e) {
        if (skel) skel.style.display = 'none';
        showToast('Failed to load recent assignments', 'error');
        console.error(e);
    }
}
