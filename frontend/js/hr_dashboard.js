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
        document.getElementById('stat-active-jobs').textContent = data.active_jobs || 0;
        document.getElementById('stat-candidates').textContent = data.total_candidates || 0;
        document.getElementById('stat-shortlisted').textContent = data.shortlisted_candidates || 0;

        // Update Org name in sidebar & welcome
        if (data.company_name) {
            document.getElementById('sidebar-org').textContent = data.company_name;
            const dashOrg = document.getElementById('dash-org-name');
            if (dashOrg) dashOrg.textContent = data.company_name;
        }

        // Initialize Candidate Status Chart
        initStatusChart(data.status_distribution || {});
        
        // Initialize Top Jobs Chart
        initTopJobsChart(data.recent_jobs || []);

        // Populate Recent Jobs
        populateRecentJobs(data.recent_jobs || []);

    } catch (err) {
        showToast('Failed to load dashboard data', 'error');
        console.error(err);
    }
}

let statusChartInstance = null;

function initStatusChart(statusData) {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    const labels = Object.keys(statusData).length > 0 ? Object.keys(statusData) : ['No Candidates'];
    const dataValues = Object.keys(statusData).length > 0 ? Object.values(statusData) : [1];
    
    // Assign colors based on status (fallback to random if new status appears)
    const colorMap = {
        'Pending': '#6366f1',
        'Contacted': '#10b981'
    };

    const bgColors = labels.map(label => colorMap[label] || '#9ca3af');

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        usePointStyle: true,
                        padding: 20,
                        font: { family: "'Inter', sans-serif", size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8
                }
            }
        }
    });
}

let topJobsChartInstance = null;

function initTopJobsChart(jobs) {
    const ctx = document.getElementById('topJobsChart');
    if (!ctx) return;

    if (topJobsChartInstance) {
        topJobsChartInstance.destroy();
    }

    // Sort jobs by candidate count descending and take top 5
    const sortedJobs = [...jobs].sort((a, b) => (b.candidate_count || 0) - (a.candidate_count || 0)).slice(0, 5);
    
    const labels = sortedJobs.length > 0 ? sortedJobs.map(j => j.title) : ['No Jobs'];
    const dataValues = sortedJobs.length > 0 ? sortedJobs.map(j => j.candidate_count || 0) : [0];

    topJobsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Candidates',
                data: dataValues,
                backgroundColor: 'rgba(249, 115, 22, 0.8)', // Primary Orange
                borderColor: '#ea580c',
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 'flex',
                maxBarThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8',
                        font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
                        callback: function(value) {
                            // Truncate long labels
                            let label = this.getLabelForValue(value);
                            return label.length > 12 ? label.substr(0, 10) + '...' : label;
                        }
                    },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#94a3b8',
                        font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
                        precision: 0
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.15)'
                    }
                }
            }
        }
    });
}

function populateRecentJobs(jobs) {
    const container = document.getElementById('recent-jobs-list');
    if (!container) return;
    
    container.innerHTML = '';

    if (jobs.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); padding: 16px; text-align: center;">No jobs posted yet.</div>';
        return;
    }

    jobs.forEach(job => {
        const item = document.createElement('div');
        item.className = 'job-item';
        
        const statusBadge = job.status === 'active' 
            ? '<span class="badge-active">Active</span>' 
            : '<span class="badge-closed">Closed</span>';

        item.innerHTML = `
            <div class="job-info">
                <div class="job-title">${job.title}</div>
                <div class="job-meta">
                    ${statusBadge}
                </div>
            </div>
            <div class="job-candidates" title="${job.candidate_count} Candidates">
                <i class="fa-solid fa-users" style="margin-right: 6px;"></i> ${job.candidate_count}
            </div>
        `;
        container.appendChild(item);
    });
}
