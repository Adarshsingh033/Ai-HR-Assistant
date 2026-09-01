/* ========================================================
   admin/dashboard.js – Executive Admin Dashboard Overview & Graphs
   ======================================================== */

let chartBranchesInstance = null;
let chartHrsInstance = null;

window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'admin') return;

    await loadDashboardOverview();
});

async function loadDashboardOverview() {
    try {
        const stats = await apiRequest('GET', '/api/admin/dashboard/stats');
        if (!stats) return;

        // 1. Populate Metrics Cards
        const m = stats.metrics || {};
        const orgsEl = document.getElementById('dash-stat-orgs');
        const activeOrgsEl = document.getElementById('dash-stat-active-orgs');
        const inactiveOrgsEl = document.getElementById('dash-stat-inactive-orgs');
        const branchesEl = document.getElementById('dash-stat-branches');
        const hrsEl = document.getElementById('dash-stat-hrs');
        const activeHrsEl = document.getElementById('dash-stat-active-hrs');
        const inactiveHrsEl = document.getElementById('dash-stat-inactive-hrs');

        if (orgsEl) orgsEl.textContent = m.total_organizations || 0;
        if (activeOrgsEl) activeOrgsEl.textContent = m.active_organizations || 0;
        if (inactiveOrgsEl) inactiveOrgsEl.textContent = m.inactive_organizations || 0;
        if (branchesEl) branchesEl.textContent = m.total_branches || 0;
        if (hrsEl) hrsEl.textContent = m.total_hr_managers || 0;
        if (activeHrsEl) activeHrsEl.textContent = m.active_hr_managers || 0;
        if (inactiveHrsEl) inactiveHrsEl.textContent = m.inactive_hr_managers || 0;

        // 2. Render Interactive Graphs
        renderBranchesPerOrgChart(stats.branches_per_org || []);
        renderHrsPerBranchChart(stats.hrs_per_branch || []);

        // 3. Render Recent Organizations & HR Lists
        renderRecentOrganizations(stats.recent_organizations || []);
        renderRecentHRManagers(stats.recent_hr_managers || []);

    } catch (err) {
        console.error('loadDashboardOverview error:', err);
    }
}

/* Graph 1: Branches per Organization */
function renderBranchesPerOrgChart(data) {
    const ctx = document.getElementById('chart-branches-per-org');
    if (!ctx) return;

    if (chartBranchesInstance) {
        chartBranchesInstance.destroy();
    }

    const labels = data.map(item => item.organization || 'Unnamed');
    const counts = data.map(item => item.count || 0);

    if (labels.length === 0) {
        labels.push('No Organizations');
        counts.push(0);
    }

    // Create Gradient
    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.85)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.15)');

    chartBranchesInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Branches Count',
                data: counts,
                backgroundColor: gradient,
                borderColor: '#6366f1',
                borderWidth: 1.5,
                borderRadius: 8,
                maxBarThickness: 38,
                barPercentage: 0.45,
                hoverBackgroundColor: 'rgba(99, 102, 241, 0.95)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#fff',
                    bodyColor: '#a5b4fc',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Branches: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11, weight: '600' } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: 'rgba(255,255,255,0.6)', precision: 0 },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    beginAtZero: true
                }
            }
        }
    });
}

/* Graph 2: HR Managers per Branch */
function renderHrsPerBranchChart(data) {
    const ctx = document.getElementById('chart-hrs-per-branch');
    if (!ctx) return;

    if (chartHrsInstance) {
        chartHrsInstance.destroy();
    }

    const labels = data.map(item => item.branch || 'Unnamed Branch');
    const counts = data.map(item => item.count || 0);

    if (labels.length === 0) {
        labels.push('No Branches');
        counts.push(0);
    }

    // Create Gradient
    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.85)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.15)');

    chartHrsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'HR Managers Count',
                data: counts,
                backgroundColor: gradient,
                borderColor: '#10b981',
                borderWidth: 1.5,
                borderRadius: 8,
                maxBarThickness: 38,
                barPercentage: 0.45,
                hoverBackgroundColor: 'rgba(16, 185, 129, 0.95)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#fff',
                    bodyColor: '#6ee7b7',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `HR Managers: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11, weight: '600' } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: 'rgba(255,255,255,0.6)', precision: 0 },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    beginAtZero: true
                }
            }
        }
    });
}

/* Render Recent Organizations Box */
function renderRecentOrganizations(orgs) {
    const container = document.getElementById('dash-recent-orgs-list');
    if (!container) return;

    if (orgs.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px; font-size: 0.88rem;">No organizations added yet.</div>`;
        return;
    }

    container.innerHTML = orgs.map(o => {
        const isInactive = o.status === 'inactive';
        const statusBadge = isInactive
            ? `<span style="padding: 2px 8px; border-radius: 99px; background: rgba(239, 68, 68, 0.12); color: #ef4444; font-size: 0.72rem; font-weight: 700;">Inactive</span>`
            : `<span style="padding: 2px 8px; border-radius: 99px; background: rgba(16, 185, 129, 0.12); color: #10b981; font-size: 0.72rem; font-weight: 700;">Active</span>`;

        const logoHtml = o.image
            ? `<img src="${o.image}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.15);" />`
            : `<div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(99, 102, 241, 0.15); border: 1.5px solid rgba(99, 102, 241, 0.3); color: #818cf8; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;"><i class="fa-solid fa-building"></i></div>`;

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${logoHtml}
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 0.9rem;">${escapeHtml(o.organization_name)}</div>
                        <div style="font-size: 0.78rem; color: rgba(255,255,255,0.5); display: flex; gap: 10px; margin-top: 2px;">
                            <span><i class="fa-solid fa-code-branch" style="color: #38bdf8;"></i> ${o.branch_count} Branches</span>
                            <span><i class="fa-solid fa-users" style="color: #10b981;"></i> ${o.hr_count} HR</span>
                        </div>
                    </div>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
        `;
    }).join('');
}

/* Render Recent HR Managers Box */
function renderRecentHRManagers(hrs) {
    const container = document.getElementById('dash-recent-hrs-list');
    if (!container) return;

    if (hrs.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px; font-size: 0.88rem;">No HR managers added yet.</div>`;
        return;
    }

    container.innerHTML = hrs.map(h => {
        const isInactive = h.status === 'inactive';
        const statusBadge = isInactive
            ? `<span style="padding: 2px 8px; border-radius: 99px; background: rgba(239, 68, 68, 0.12); color: #ef4444; font-size: 0.72rem; font-weight: 700;">Inactive</span>`
            : `<span style="padding: 2px 8px; border-radius: 99px; background: rgba(16, 185, 129, 0.12); color: #10b981; font-size: 0.72rem; font-weight: 700;">Active</span>`;

        const avatarHtml = h.image
            ? `<img src="${h.image}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.15);" />`
            : `<div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 1.5px solid rgba(16, 185, 129, 0.3); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 700;">${h.full_name ? h.full_name.charAt(0).toUpperCase() : 'H'}</div>`;

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${avatarHtml}
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 0.9rem;">${escapeHtml(h.full_name)} <span style="font-size: 0.78rem; color: #818cf8; font-weight: 600;">@${escapeHtml(h.username)}</span></div>
                        <div style="font-size: 0.78rem; color: rgba(255,255,255,0.5); display: flex; gap: 10px; margin-top: 2px;">
                            <span><i class="fa-solid fa-building" style="color: #a5b4fc;"></i> ${escapeHtml(h.organization_name || '—')}</span>
                            <span><i class="fa-solid fa-code-branch" style="color: #38bdf8;"></i> ${escapeHtml(h.branch_name || '—')}</span>
                        </div>
                    </div>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
        `;
    }).join('');
}
