/* ========================================================
   hr_jobs.js – HR Job Vacancies Module Logic
   ======================================================== */

let currentOrgId = null;
let allJobs = [];
let branchesList = [];
let jobSkillsTags = [];

window.addEventListener('DOMContentLoaded', async () => {
    initSkillTagInput();
    await initJobVacancyModule();
});

/* Initialize Module */
async function initJobVacancyModule() {
    const session = Session.get();
    if (!session) return;

    try {
        const profile = await apiRequest('GET', '/api/hr/profile');
        if (profile && profile.org_id) {
            currentOrgId = profile.org_id;
        } else {
            currentOrgId = session.org_id || '';
        }
    } catch (err) {
        currentOrgId = session.org_id || '';
    }

    if (currentOrgId) {
        await loadBranchesList(currentOrgId);
        await loadJobVacancies();
    }
}

/* Load Branches for Dropdowns */
async function loadBranchesList(orgId) {
    try {
        const data = await apiRequest('GET', `/api/admin/branches?organization_id=${orgId}&limit=100`);
        if (data && data.branches) {
            branchesList = data.branches;
            populateBranchDropdowns(branchesList);
        }
    } catch (err) {
        console.warn('Could not load branches for dropdown:', err);
    }
}

function populateBranchDropdowns(branches) {
    const filterSelect = document.getElementById('job-filter-branch');
    const modalSelect = document.getElementById('job-branch-id');

    if (filterSelect) {
        let options = '<option value="">All Branches</option>';
        branches.forEach(b => {
            options += `<option value="${b.branch_id}">${escapeHtml(b.branch_name)}</option>`;
        });
        filterSelect.innerHTML = options;
    }

    if (modalSelect) {
        let options = '<option value="">Select Branch</option>';
        branches.forEach(b => {
            options += `<option value="${b.branch_id}">${escapeHtml(b.branch_name)}</option>`;
        });
        modalSelect.innerHTML = options;
    }
}

/* Fetch Job Vacancies from Backend API */
async function loadJobVacancies() {
    const grid = document.getElementById('jobs-grid');
    const emptyState = document.getElementById('jobs-empty');

    try {
        const data = await apiRequest('GET', `/api/jobs?organization_id=${currentOrgId}`);
        if (data && data.jobs) {
            allJobs = data.jobs;
            onJobFilterChange();
        }
    } catch (err) {
        showToast(err.message || 'Failed to load job vacancies.', 'error');
        if (grid) grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ef4444; padding: 40px;">Failed to load job vacancies. Please refresh.</div>`;
    }
}

/* Filter and Render Job Vacancies Grid */
function onJobFilterChange() {
    const searchVal = document.getElementById('job-search-input')?.value.toLowerCase().trim() || '';
    const branchVal = document.getElementById('job-filter-branch')?.value || '';
    const statusVal = document.getElementById('job-filter-status')?.value || '';

    const filtered = allJobs.filter(job => {
        const title = (job.job_title || job.title || '').toLowerCase();
        const dept = (job.department || '').toLowerCase();
        const loc = (job.location || '').toLowerCase();
        const skills = (job.skills_required || []).join(' ').toLowerCase();

        const matchesSearch = !searchVal || title.includes(searchVal) || dept.includes(searchVal) || loc.includes(searchVal) || skills.includes(searchVal);
        const matchesBranch = !branchVal || job.branch_id === branchVal;
        const matchesStatus = !statusVal || (job.status || 'draft').toLowerCase() === statusVal;

        return matchesSearch && matchesBranch && matchesStatus;
    });

    renderJobsGrid(filtered);
}

/* Render Vacancy Cards Grid */
function renderJobsGrid(jobs) {
    const grid = document.getElementById('jobs-grid');
    const emptyState = document.getElementById('jobs-empty');

    if (!grid) return;

    if (!jobs || jobs.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    grid.innerHTML = jobs.map(job => {
        const status = (job.status || 'draft').toLowerCase();
        const jobId = job.job_id || job.id;
        const title = escapeHtml(job.job_title || job.title || 'Untitled Vacancy');
        const dept = escapeHtml(job.department || 'General');
        const branchName = escapeHtml(job.branch_name || 'Main Branch');
        const workMode = escapeHtml(job.work_mode || 'On-site');
        const empType = escapeHtml(job.employment_type || 'Full-time');
        const location = escapeHtml(job.location || 'Location Not Specified');
        const openings = job.openings || 1;
        const exp = escapeHtml(job.experience_required || 'N/A');
        const salary = escapeHtml(job.salary || 'Competitive');
        const createdDate = formatDate(job.created_at);

        const skillsHtml = (job.skills_required || []).slice(0, 5).map(s => `<span class="skill-badge">${escapeHtml(s)}</span>`).join('');

        let statusClass = 'draft';
        let statusLabel = 'Draft';
        if (status === 'active') {
            statusClass = 'active';
            statusLabel = 'Active';
        } else if (status === 'closed') {
            statusClass = 'closed';
            statusLabel = 'Closed';
        }

        return `
            <div class="vacancy-card">
                <div>
                    <!-- Top Status & Actions Header -->
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                        <span class="status-pill ${statusClass}">
                            <i class="fa-solid fa-circle" style="font-size: 0.45rem;"></i> ${statusLabel}
                        </span>
                        
                        <!-- Status Toggle Selector -->
                        <select onchange="changeJobStatus('${jobId}', this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.8); font-size: 0.75rem; border-radius: 8px; padding: 3px 8px; cursor: pointer; outline: none;">
                            <option value="draft" ${status === 'draft' ? 'selected' : ''}>Draft</option>
                            <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="closed" ${status === 'closed' ? 'selected' : ''}>Closed</option>
                        </select>
                    </div>

                    <!-- Title & Department -->
                    <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-bottom: 4px; line-height: 1.3;">${title}</h3>
                    <div style="font-size: 0.82rem; color: rgba(255,255,255,0.6); margin-bottom: 12px;">
                        ${dept} • <span style="color: #818cf8; font-weight: 600;">${branchName}</span>
                    </div>

                    <!-- Work Mode & Employment Type Badges -->
                    <div style="display: flex; gap: 8px; margin-bottom: 14px;">
                        <span class="work-mode-pill">${workMode}</span>
                        <span class="emp-type-pill">${empType}</span>
                        <span style="font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 6px; background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.25);">${openings} Opening${openings > 1 ? 's' : ''}</span>
                    </div>

                    <!-- Vacancy Details Row -->
                    <div class="vacancy-meta-row">
                        <div class="vacancy-meta-item"><i class="fa-solid fa-location-dot" style="color: rgba(255,255,255,0.4);"></i> ${location}</div>
                        <div class="vacancy-meta-item"><i class="fa-solid fa-hourglass-half" style="color: rgba(255,255,255,0.4);"></i> ${exp}</div>
                        <div class="vacancy-meta-item"><i class="fa-solid fa-money-bill-wave" style="color: rgba(255,255,255,0.4);"></i> ${salary}</div>
                    </div>

                    <!-- Skills Badges -->
                    ${skillsHtml ? `<div class="vacancy-skills">${skillsHtml}</div>` : ''}
                </div>

                <!-- Footer Action Buttons -->
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border);">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${createdDate}</span>
                    
                    <div style="display: flex; gap: 8px;">
                        <button onclick="viewJobDetails('${jobId}')" title="View Details" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #fff; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-eye" style="font-size: 0.85rem;"></i>
                        </button>
                        <button onclick="openEditJobModal('${jobId}')" title="Edit Vacancy" style="background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-pen-to-square" style="font-size: 0.85rem;"></i>
                        </button>
                        <button onclick="deleteJobVacancy('${jobId}')" title="Delete Vacancy" style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-trash-can" style="font-size: 0.85rem;"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/* Skills Tag Input Manager */
function initSkillTagInput() {
    const input = document.getElementById('skill-input');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
        if (['Enter', ',', 'Tab'].includes(e.key)) {
            e.preventDefault();
            const val = input.value.trim().replace(/,/g, '');
            if (val && !jobSkillsTags.includes(val)) {
                jobSkillsTags.push(val);
                renderSkillTags();
            }
            input.value = '';
        }
    });
}

function renderSkillTags() {
    const wrap = document.getElementById('skills-wrap');
    const input = document.getElementById('skill-input');
    if (!wrap || !input) return;

    wrap.querySelectorAll('.tag-pill').forEach(t => t.remove());

    jobSkillsTags.forEach((tag, i) => {
        const el = document.createElement('span');
        el.className = 'tag-pill';
        el.style.cssText = 'background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.4); color: #a5b4fc; padding: 3px 10px; border-radius: 99px; font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;';
        el.innerHTML = `${escapeHtml(tag)} <span onclick="removeSkillTag(${i})" style="cursor:pointer; font-weight:800;">×</span>`;
        wrap.insertBefore(el, input);
    });
}

function removeSkillTag(index) {
    jobSkillsTags.splice(index, 1);
    renderSkillTags();
}

/* Open Create Job Vacancy Modal */
function openCreateJobModal() {
    document.getElementById('job-id-hidden').value = '';
    document.getElementById('job-modal-title').textContent = 'Create Job Vacancy';
    document.getElementById('job-form').reset();
    jobSkillsTags = [];
    renderSkillTags();

    openModal('job-modal');
}

/* Open Edit Job Vacancy Modal */
function openEditJobModal(jobId) {
    const job = allJobs.find(j => (j.job_id || j.id) === jobId);
    if (!job) return;

    document.getElementById('job-id-hidden').value = jobId;
    document.getElementById('job-modal-title').textContent = 'Edit Job Vacancy';

    document.getElementById('job-title').value = job.job_title || job.title || '';
    document.getElementById('job-dept').value = job.department || '';
    document.getElementById('job-employment-type').value = job.employment_type || 'Full-time';
    document.getElementById('job-work-mode').value = job.work_mode || 'On-site';
    document.getElementById('job-location').value = job.location || '';
    document.getElementById('job-openings').value = job.openings || 1;
    document.getElementById('job-exp').value = job.experience_required || '';
    document.getElementById('job-salary').value = job.salary || '';
    document.getElementById('job-desc').value = job.job_description || job.description || '';
    document.getElementById('job-status').value = (job.status || 'draft').toLowerCase();

    jobSkillsTags = [...(job.skills_required || [])];
    renderSkillTags();

    openModal('job-modal');
}

function closeJobModal() {
    closeModal('job-modal');
}

/* AI Job Description Generator */
async function generateAIJobDescription() {
    const title = document.getElementById('job-title')?.value.trim();
    const dept = document.getElementById('job-dept')?.value.trim() || 'Engineering';
    const empType = document.getElementById('job-employment-type')?.value || 'Full-time';
    const workMode = document.getElementById('job-work-mode')?.value || 'On-site';
    const location = document.getElementById('job-location')?.value.trim() || 'Office';
    const exp = document.getElementById('job-exp')?.value.trim() || 'Entry level';

    if (!title) {
        showToast('Please enter a Job Title before generating description.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-generate-jd');
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

    try {
        const payload = {
            job_title: title,
            department: dept,
            employment_type: empType,
            work_mode: workMode,
            location: location,
            experience_required: exp,
            skills_required: jobSkillsTags,
        };

        const res = await apiRequest('POST', '/api/jobs/generate-jd', payload);
        if (res && res.description) {
            document.getElementById('job-desc').value = res.description;
            showToast('AI Job Description generated successfully!', 'success');
        }
    } catch (err) {
        showToast(err.message || 'Failed to generate AI job description.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
    }
}

/* Live Input Restrictions (Openings Count & Salary) */
function blockNonIntegerKeys(e) {
    if (['e', 'E', '+', '-', '.', ','].includes(e.key)) {
        e.preventDefault();
    }
}

function validateOpeningsInput(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    if (input.value.length > 1 && input.value.startsWith('0')) {
        input.value = input.value.replace(/^0+/, '');
    }
    if (input.value === '0') {
        input.value = '1';
    }
}

function validateSalaryInput(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
}

/* Save Job Vacancy (Create or Edit) */
async function handleSaveJob(e) {
    e.preventDefault();

    const jobId = document.getElementById('job-id-hidden')?.value;
    const title = document.getElementById('job-title')?.value.trim();
    const dept = document.getElementById('job-dept')?.value.trim() || 'General';
    const empType = document.getElementById('job-employment-type')?.value;
    const workMode = document.getElementById('job-work-mode')?.value;
    const location = document.getElementById('job-location')?.value.trim() || '';
    const rawOpenings = document.getElementById('job-openings')?.value;
    const openings = parseInt(rawOpenings || '1', 10);
    const exp = document.getElementById('job-exp')?.value.trim() || '';
    const salary = document.getElementById('job-salary')?.value.trim() || '';
    const desc = document.getElementById('job-desc')?.value.trim();
    const status = document.getElementById('job-status')?.value || 'draft';

    if (!title || !desc) {
        showToast('Job Title and Description are required.', 'error');
        return;
    }

    if (isNaN(openings) || openings < 1) {
        showToast('Openings count must be a positive whole number greater than 0.', 'error');
        return;
    }

    if (salary && /[^0-9]/.test(salary)) {
        showToast('Salary must contain digits only (whole integers, no decimals or alphabets).', 'error');
        return;
    }

    const btn = document.getElementById('save-job-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    try {
        const payload = {
            organization_id: currentOrgId,
            job_title: title,
            department: dept,
            employment_type: empType,
            work_mode: workMode,
            location: location,
            openings: openings,
            experience_required: exp,
            salary: salary,
            skills_required: jobSkillsTags,
            job_description: desc,
            status: status,
        };

        if (jobId) {
            await apiRequest('PUT', `/api/jobs/${jobId}`, payload);
            showToast('Job Vacancy updated successfully!', 'success');
        } else {
            await apiRequest('POST', '/api/jobs', payload);
            showToast('Job Vacancy created successfully!', 'success');
        }

        closeJobModal();
        await loadJobVacancies();
    } catch (err) {
        showToast(err.message || 'Failed to save Job Vacancy.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Job Vacancy';
        }
    }
}

/* Quick Status Toggle */
async function changeJobStatus(jobId, newStatus) {
    try {
        await apiRequest('PUT', `/api/jobs/${jobId}`, { status: newStatus });
        showToast(`Vacancy status changed to '${newStatus}'.`, 'success');
        await loadJobVacancies();
    } catch (err) {
        showToast(err.message || 'Failed to update status.', 'error');
    }
}

/* Delete Job Vacancy */
async function deleteJobVacancy(jobId) {
    if (!confirm('Are you sure you want to delete this job vacancy? All linked records will be affected.')) return;

    try {
        await apiRequest('DELETE', `/api/jobs/${jobId}`);
        showToast('Job Vacancy deleted successfully.', 'success');
        await loadJobVacancies();
    } catch (err) {
        showToast(err.message || 'Failed to delete job vacancy.', 'error');
    }
}

/* View Details Modal */
function viewJobDetails(jobId) {
    const job = allJobs.find(j => (j.job_id || j.id) === jobId);
    if (!job) return;

    const status = (job.status || 'draft').toLowerCase();
    let statusClass = 'draft';
    let statusLabel = 'Draft';
    if (status === 'active') { statusClass = 'active'; statusLabel = 'Active'; }
    else if (status === 'closed') { statusClass = 'closed'; statusLabel = 'Closed'; }

    const statusEl = document.getElementById('vj-status');
    if (statusEl) {
        statusEl.className = `status-pill ${statusClass}`;
        statusEl.textContent = statusLabel;
    }

    document.getElementById('vj-title').textContent = job.job_title || job.title || 'Job Title';
    document.getElementById('vj-sub').textContent = `${job.department || 'General'} • ${job.branch_name || 'Main Branch'}`;
    document.getElementById('vj-work-mode').textContent = job.work_mode || 'On-site';
    document.getElementById('vj-emp-type').textContent = job.employment_type || 'Full-time';
    document.getElementById('vj-openings').textContent = job.openings || 1;
    document.getElementById('vj-salary').textContent = job.salary || 'Competitive';
    document.getElementById('vj-desc').textContent = job.job_description || job.description || '';

    const skillsWrap = document.getElementById('vj-skills');
    if (skillsWrap) {
        skillsWrap.innerHTML = (job.skills_required || []).map(s => `<span class="skill-badge">${escapeHtml(s)}</span>`).join('');
    }

    openModal('view-job-modal');
}

function closeViewJobModal() {
    closeModal('view-job-modal');
}
