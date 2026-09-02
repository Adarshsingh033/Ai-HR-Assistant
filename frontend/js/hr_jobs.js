/* ========================================================
   hr_jobs.js – HR Job Vacancies Module Logic
   ======================================================== */

let currentOrgId = null;
let currentBranchId = null;
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
        if (profile) {
            currentOrgId = profile.org_id || session.org_id || '';
            currentBranchId = profile.branch_id || session.branch_id || '';
        } else {
            currentOrgId = session.org_id || '';
            currentBranchId = session.branch_id || '';
        }
    } catch (err) {
        currentOrgId = session.org_id || '';
        currentBranchId = session.branch_id || '';
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
        let endpoint = `/api/jobs?organization_id=${currentOrgId}`;
        if (currentBranchId) {
            endpoint += `&branch_id=${currentBranchId}`;
        }

        const data = await apiRequest('GET', endpoint);
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
    const statusVal = document.getElementById('job-filter-status')?.value || '';

    const filtered = allJobs.filter(job => {
        const matchesStatus = !statusVal || (job.status || 'draft').toLowerCase() === statusVal;
        return matchesStatus;
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
        const status      = (job.status || 'draft').toLowerCase();
        const jobId       = job.job_id || job.id;
        const title       = escapeHtml(job.job_title || job.title || 'Untitled Vacancy');
        const dept        = escapeHtml(job.department || 'General');
        const workMode    = escapeHtml(job.work_mode || 'On-site');
        const empType     = escapeHtml(job.employment_type || 'Full-time');
        const location    = escapeHtml(job.location || 'Not specified');
        const openings    = job.openings || 1;
        const exp         = escapeHtml(job.experience_required || 'Not specified');
        const createdDate = formatDate(job.created_at);

        const statusMeta = {
            active: { cls: 'active', label: 'Active',  icon: 'fa-circle-check',     next: 'closed' },
            draft:  { cls: 'draft',  label: 'Draft',   icon: 'fa-circle-half-stroke', next: 'active' },
            closed: { cls: 'closed', label: 'Closed',  icon: 'fa-circle-xmark',     next: 'draft' },
        };
        const sm = statusMeta[status] || statusMeta.draft;
        const nextStatus = sm.next;
        const nextLabel  = statusMeta[nextStatus]?.label || 'Draft';

        return `
        <div class="vacancy-card" style="display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;">

            <!-- ── Top Row: Status pill + action icons ── -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px;">
                <span
                    class="status-pill ${sm.cls} clickable"
                    title="Click to change to ${nextLabel}"
                    onclick="changeJobStatus('${jobId}', '${nextStatus}')"
                >
                    <i class="fa-solid ${sm.icon}" style="font-size:0.55rem;"></i>
                    ${sm.label}
                </span>
                <div style="display:flex;gap:7px;">
                    <button onclick="viewJobDetails('${jobId}')" title="View JD" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                        <i class="fa-solid fa-eye" style="font-size:0.8rem;"></i>
                    </button>
                    <button onclick="openEditJobModal('${jobId}')" title="Edit" style="background:rgba(99,102,241,0.14);border:1px solid rgba(99,102,241,0.3);color:#818cf8;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.28)'" onmouseout="this.style.background='rgba(99,102,241,0.14)'">
                        <i class="fa-solid fa-pen-to-square" style="font-size:0.8rem;"></i>
                    </button>
                    <button onclick="deleteJobVacancy('${jobId}')" title="Delete" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#ef4444;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.12)'">
                        <i class="fa-solid fa-trash-can" style="font-size:0.8rem;"></i>
                    </button>
                </div>
            </div>

            <!-- ── Title & Department ── -->
            <div style="margin-bottom:14px;">
                <h3 style="font-size:1.15rem;font-weight:900;color:#fff;margin:0 0 4px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${title}">${title}</h3>
                <div style="font-size:0.8rem;color:rgba(255,255,255,0.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${dept}
                </div>
            </div>

            <!-- ── Type Badges ── -->
            <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px;">
                <span style="font-size:0.72rem;font-weight:700;padding:4px 10px;border-radius:7px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);line-height:1.2;">${workMode}</span>
                <span style="font-size:0.72rem;font-weight:700;padding:4px 10px;border-radius:7px;background:rgba(56,189,248,0.12);color:#38bdf8;border:1px solid rgba(56,189,248,0.25);line-height:1.2;">${empType}</span>
                <span style="font-size:0.72rem;font-weight:700;padding:4px 10px;border-radius:7px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);line-height:1.2;">${openings} Opening${openings > 1 ? 's' : ''}</span>
            </div>

            <!-- ── Info Rows (Location & Experience only) ── -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:0;">
                <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:8px 11px;overflow:hidden;">
                    <i class="fa-solid fa-location-dot" style="color:#6366f1;font-size:0.78rem;flex-shrink:0;"></i>
                    <div style="min-width:0;">
                        <div style="font-size:0.62rem;color:rgba(255,255,255,0.4);text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">Location</div>
                        <div style="font-size:0.8rem;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${location}">${location}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:8px 11px;overflow:hidden;">
                    <i class="fa-solid fa-hourglass-half" style="color:#fbbf24;font-size:0.78rem;flex-shrink:0;"></i>
                    <div style="min-width:0;">
                        <div style="font-size:0.62rem;color:rgba(255,255,255,0.4);text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">Experience</div>
                        <div style="font-size:0.8rem;font-weight:700;color:#fbbf24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${exp}">${exp}</div>
                    </div>
                </div>
            </div>

        </div>`;
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
    document.getElementById('job-qualification').value = '';
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
    document.getElementById('job-qualification').value = job.qualification || '';
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
    const qualification = document.getElementById('job-qualification')?.value.trim() || 'Not specified';
    const salary = document.getElementById('job-salary')?.value.trim() || 'Competitive';

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
            qualification: qualification,
            salary: salary,
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
    const qualification = document.getElementById('job-qualification')?.value.trim() || '';
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
            branch_id: currentBranchId || null,
            job_title: title,
            department: dept,
            employment_type: empType,
            work_mode: workMode,
            location: location,
            openings: openings,
            experience_required: exp,
            qualification: qualification,
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
let _viewingJobId = null;

function viewJobDetails(jobId) {
    const job = allJobs.find(j => (j.job_id || j.id) === jobId);
    if (!job) return;
    _viewingJobId = jobId;

    const status = (job.status || 'draft').toLowerCase();
    const statusMeta = {
        active: { cls: 'active', label: 'Active',   icon: 'fa-circle-check' },
        draft:  { cls: 'draft',  label: 'Draft',    icon: 'fa-circle-half-stroke' },
        closed: { cls: 'closed', label: 'Closed',   icon: 'fa-circle-xmark' },
    };
    const sm = statusMeta[status] || statusMeta.draft;
    const nextStatus = { active: 'closed', draft: 'active', closed: 'draft' }[status] || 'draft';
    const nextLabel  = statusMeta[nextStatus]?.label || 'Draft';

    // Status pill
    const statusEl = document.getElementById('vj-status');
    if (statusEl) {
        statusEl.className = `status-pill ${sm.cls} clickable`;
        statusEl.title = `Click to change to ${nextLabel}`;
        statusEl.innerHTML = `<i class="fa-solid ${sm.icon}" style="font-size:0.55rem;"></i> ${sm.label}`;
    }

    // Badges
    const openings = job.openings || 1;
    document.getElementById('vj-work-mode-badge').textContent  = job.work_mode || 'On-site';
    document.getElementById('vj-emp-badge').textContent        = job.employment_type || 'Full-time';
    document.getElementById('vj-openings-badge').textContent   = `${openings} Opening${openings > 1 ? 's' : ''}`;

    // Header
    document.getElementById('vj-title').textContent = job.job_title || job.title || 'Job Title';
    document.getElementById('vj-sub').textContent   = `${job.department || 'General'} • ${job.branch_name || 'Main Branch'}`;

    // Info grid
    document.getElementById('vj-location').textContent      = job.location || 'Not specified';
    document.getElementById('vj-exp').textContent           = job.experience_required || 'Not specified';
    document.getElementById('vj-qualification').textContent = job.qualification || 'Not specified';
    const salaryRaw = job.salary;
    document.getElementById('vj-salary').textContent =
        salaryRaw ? `₹${Number(salaryRaw).toLocaleString('en-IN')}` : 'Competitive';

    // Skills
    const skillsWrap = document.getElementById('vj-skills');
    if (skillsWrap) {
        skillsWrap.innerHTML = (job.skills_required || []).length
            ? (job.skills_required).map(s => `<span class="skill-badge">${escapeHtml(s)}</span>`).join('')
            : '<span style="color:rgba(255,255,255,0.4);font-size:0.83rem;">No skills specified</span>';
    }

    // Job Description — render as Markdown
    const descEl = document.getElementById('vj-desc');
    if (descEl) {
        const raw = job.job_description || job.description || '';
        if (typeof marked !== 'undefined' && raw.trim()) {
            marked.setOptions({ breaks: true, gfm: true });
            descEl.innerHTML = marked.parse(raw);
        } else {
            descEl.textContent = raw || 'No description available.';
        }
    }

    openModal('view-job-modal');
}

/* Cycle status from the view modal */
async function cycleJobStatus() {
    if (!_viewingJobId) return;
    const job = allJobs.find(j => (j.job_id || j.id) === _viewingJobId);
    if (!job) return;
    const nextStatus = { active: 'closed', draft: 'active', closed: 'draft' }[(job.status || 'draft')] || 'draft';
    await changeJobStatus(_viewingJobId, nextStatus);
    // Re-open with updated data
    viewJobDetails(_viewingJobId);
}

/* Close view modal when clicking the dark overlay (outside the card) */
function handleViewModalOverlayClick(event) {
    const card = document.getElementById('view-job-modal-card');
    if (card && !card.contains(event.target)) {
        closeViewJobModal();
    }
}

function closeViewJobModal() {
    closeModal('view-job-modal');
    _viewingJobId = null;
}
