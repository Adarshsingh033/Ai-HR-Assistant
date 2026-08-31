/* ========================================================
   hr_jobs.js – Job Management Logic
   ======================================================== */

let currentSkills = [];

window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (!session || session.role !== 'hr') {
        location.href = '../index.html';
        return;
    }

    // Populate user info
    document.getElementById('sidebar-name').textContent = session.username;
    document.getElementById('sidebar-avatar').textContent = session.username.charAt(0).toUpperCase();

    // Initialize Tag Input for skills
    initTagInput('skills-wrap', 'skill-input', currentSkills);

    // Load Jobs
    if (session.org_id) {
        loadJobs(session.org_id);
    } else {
        const grid = document.getElementById('jobs-grid');
        const empty = document.getElementById('jobs-empty');
        if (grid) grid.innerHTML = '';
        if (empty) {
            empty.classList.remove('hidden');
            empty.querySelector('.empty-title').textContent = 'No Organization Assigned';
            empty.querySelector('.empty-desc').textContent = 'You need to be assigned to an organization by an admin before you can manage jobs.';
            const btn = empty.querySelector('button');
            if (btn) btn.classList.add('hidden');
        }
        const createBtn = document.querySelector('header .btn-primary');
        if (createBtn) createBtn.disabled = true;
        showToast('You must be assigned to an organization to manage jobs.', 'warning');
    }
});

// Override utils removeTag for local state tracking
window.removeTag = function (index, wrapperId, inputId) {
    currentSkills.splice(index, 1);
    renderTags(wrapperId, inputId, currentSkills);
};

/* ── Load Jobs ───────────────────────────────────────── */
async function loadJobs(orgId) {
    const grid = document.getElementById('jobs-grid');
    const empty = document.getElementById('jobs-empty');
    const loader = document.getElementById('jobs-loader');

    grid.innerHTML = '';
    empty.classList.add('hidden');
    loader.classList.remove('hidden');

    try {
        const data = await apiRequest('GET', `/api/jobs?org_id=${orgId}`);
        const jobs = data.jobs || [];

        loader.classList.add('hidden');

        if (jobs.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'card job-card';

            const dateStr = job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Unknown';
            const shortDesc = job.description.length > 100
                ? job.description.substring(0, 100) + '...'
                : job.description;

            const skillsHtml = (job.skills_required || []).slice(0, 4).map(s =>
                `<span class="skill-badge">${s}</span>`
            ).join('');

            const extraSkills = job.skills_required.length > 4
                ? `<span class="skill-badge" style="background:transparent; border:1px solid var(--border);">+${job.skills_required.length - 4}</span>`
                : '';

            card.innerHTML = `
                <div class="job-actions">
                    <button class="btn btn-secondary btn-sm" onclick="location.href='all_candidates.html?job_id=${job.job_id}'" title="Manage Candidates">
                        <i class="fa-solid fa-users"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="viewJob('${job.job_id}')" title="View Details">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="delJob('${job.job_id}')" title="Delete Job">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="card-title mb-1" style="padding-right: 70px;">${job.title}</div>
                <div class="text-xs text-muted mb-3">${job.department} • ${job.location}</div>
                
                <div class="text-sm text-secondary" style="flex:1;">
                    ${shortDesc}
                </div>

                <div class="job-details" style="margin: 12px 0;">
                    <div class="job-detail-item" title="Job Type">
                        <span><i class="fa-solid fa-briefcase"></i></span> ${job.job_type}
                    </div>
                    <div class="job-detail-item" title="Experience">
                        <span><i class="fa-solid fa-hourglass-half"></i></span> ${job.experience_required}
                    </div>
                </div>

                <div class="job-skills">
                    ${skillsHtml} ${extraSkills}
                </div>
            `;
            grid.appendChild(card);
        });

    } catch (err) {
        loader.classList.add('hidden');
        showToast('Failed to load jobs', 'error');
        console.error(err);
    }
}

/* ── Create Modal ─────────────────────────────────────── */
function openCreateJobModal() {
    document.getElementById('create-job-form').reset();
    currentSkills.length = 0;
    renderTags('skills-wrap', 'skill-input', currentSkills);
    document.getElementById('create-modal').classList.add('open');
}

function closeCreateJobModal() {
    document.getElementById('create-modal').classList.remove('open');
}

/* ── View Modal ───────────────────────────────────────── */
async function viewJob(jobId) {
    try {
        const job = await apiRequest('GET', `/api/jobs/${jobId}`);

        document.getElementById('view-title').textContent = job.title;
        document.getElementById('view-subtitle').textContent = `${job.department} • ${job.location}`;
        document.getElementById('view-type').textContent = job.job_type;
        document.getElementById('view-exp').textContent = job.experience_required;
        document.getElementById('view-date').textContent = formatDate(job.created_at);

        const skillsHtml = (job.skills_required || []).map(s =>
            `<span class="skill-badge" style="font-size: 0.85rem; padding: 4px 10px;">${s}</span>`
        ).join('');
        document.getElementById('view-skills').innerHTML = skillsHtml;

        document.getElementById('view-desc').textContent = job.description;

        document.getElementById('view-modal').classList.add('open');
    } catch (err) {
        showToast('Failed to load job details', 'error');
    }
}

function closeViewModal() {
    document.getElementById('view-modal').classList.remove('open');
}

/* ── Generate JD via AI ───────────────────────────────── */
async function generateJD() {
    const title = document.getElementById('job-title').value.trim();
    const dept = document.getElementById('job-dept').value.trim();
    const location = document.getElementById('job-location').value.trim();
    const type = document.getElementById('job-type').value.trim();
    const exp = document.getElementById('job-exp').value.trim();

    if (!title || !dept || !location || !type || !exp || currentSkills.length === 0) {
        showToast('Please fill all previous fields and add at least one skill to generate a JD.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-generate-jd');
    setLoading(btn, true);

    const descArea = document.getElementById('job-desc');
    descArea.value = 'Generating Job Description with AI... Please wait...';

    try {
        const payload = {
            title,
            department: dept,
            location,
            job_type: type,
            experience_required: exp,
            skills_required: currentSkills
        };

        const res = await apiRequest('POST', '/api/jobs/generate-jd', payload);
        descArea.value = res.description;
        showToast('Job Description generated successfully!', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to generate JD', 'error');
        descArea.value = '';
    } finally {
        setLoading(btn, false);
    }
}

/* ── Create Job ───────────────────────────────────────── */
async function handleCreateJob(e) {
    e.preventDefault();

    if (currentSkills.length === 0) {
        showToast('Please add at least one required skill.', 'warning');
        return;
    }

    const session = Session.get();
    const btn = document.getElementById('btn-submit-job');

    const payload = {
        title: document.getElementById('job-title').value.trim(),
        department: document.getElementById('job-dept').value.trim(),
        location: document.getElementById('job-location').value.trim(),
        job_type: document.getElementById('job-type').value.trim(),
        experience_required: document.getElementById('job-exp').value.trim(),
        skills_required: currentSkills,
        description: document.getElementById('job-desc').value.trim(),
        org_id: session.org_id,
        hr_id: session.user_id
    };

    setLoading(btn, true);

    try {
        await apiRequest('POST', '/api/jobs', payload);
        showToast('Job posting created successfully!', 'success');
        closeCreateJobModal();
        loadJobs(session.org_id);
    } catch (err) {
        showToast(err.message || 'Failed to create job', 'error');
    } finally {
        setLoading(btn, false);
    }
}

/* ── Delete Job ───────────────────────────────────────── */
async function delJob(jobId) {
    if (!confirm('Are you sure you want to delete this job posting? This will also remove associated candidate data.')) {
        return;
    }

    const session = Session.get();
    try {
        await apiRequest('DELETE', `/api/jobs/${jobId}`);
        showToast('Job deleted successfully', 'success');
        loadJobs(session.org_id);
    } catch (err) {
        showToast(err.message || 'Failed to delete job', 'error');
    }
}
