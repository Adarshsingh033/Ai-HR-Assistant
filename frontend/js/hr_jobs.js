/* ========================================================
   hr_jobs.js – HR Job Vacancies Module Logic
   ======================================================== */

let currentOrgId = null;
let currentBranchId = null;
let allJobs = [];
let branchesList = [];
let jobSkillsTags = [];

/* ── Default field weights ──────────────────────────────────────── */
const DEFAULT_WEIGHTS = { location: 20, experience: 30, qualification: 25, skills: 25 };
let fieldWeights = { ...DEFAULT_WEIGHTS };

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
        <div class="vacancy-card" style="display:flex;flex-direction:column;box-sizing:border-box;padding:22px;">

            <!-- ── Top Row: Status pill + action icons ── -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px;">
                <span
                    class="status-pill ${sm.cls} clickable"
                    title="Click to change to ${nextLabel}"
                    onclick="changeJobStatus('${jobId}', '${nextStatus}')"
                >
                    <i class="fa-solid ${sm.icon}" style="font-size:0.55rem;"></i>
                    ${sm.label}
                </span>
                <div style="display:flex;gap:8px;">
                    <button onclick="viewJobDetails('${jobId}')" title="View JD" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.14)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                        <i class="fa-solid fa-eye" style="font-size:0.82rem;"></i>
                    </button>
                    <button onclick="openEditJobModal('${jobId}')" title="Edit" style="background:rgba(99,102,241,0.14);border:1px solid rgba(99,102,241,0.3);color:#818cf8;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.28)'" onmouseout="this.style.background='rgba(99,102,241,0.14)'">
                        <i class="fa-solid fa-pen-to-square" style="font-size:0.82rem;"></i>
                    </button>
                    <button onclick="deleteJobVacancy('${jobId}')" title="Delete" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#ef4444;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.12)'">
                        <i class="fa-solid fa-trash-can" style="font-size:0.82rem;"></i>
                    </button>
                </div>
            </div>

            <!-- ── Title & Department ── -->
            <div style="margin-bottom:14px;">
                <h3 style="font-size:1.18rem;font-weight:900;color:#fff;margin:0 0 4px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${title}">${title}</h3>
                <div style="font-size:0.82rem;color:rgba(255,255,255,0.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${dept}
                </div>
            </div>

            <!-- ── Type Badges ── -->
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
                <span style="font-size:0.75rem;font-weight:700;padding:5px 12px;border-radius:8px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);display:inline-flex;align-items:center;justify-content:center;line-height:1;">${workMode}</span>
                <span style="font-size:0.75rem;font-weight:700;padding:5px 12px;border-radius:8px;background:rgba(56,189,248,0.12);color:#38bdf8;border:1px solid rgba(56,189,248,0.25);display:inline-flex;align-items:center;justify-content:center;line-height:1;">${empType}</span>
                <span style="font-size:0.75rem;font-weight:700;padding:5px 12px;border-radius:8px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);display:inline-flex;align-items:center;justify-content:center;line-height:1;">${openings} Opening${openings > 1 ? 's' : ''}</span>
            </div>

            <!-- ── Info Rows (Location & Experience only) ── -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:0;">
                <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:9px 12px;overflow:hidden;">
                    <i class="fa-solid fa-location-dot" style="color:#6366f1;font-size:0.82rem;flex-shrink:0;"></i>
                    <div style="min-width:0;">
                        <div style="font-size:0.64rem;color:rgba(255,255,255,0.45);text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">Location</div>
                        <div style="font-size:0.82rem;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${location}">${location}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:9px 12px;overflow:hidden;">
                    <i class="fa-solid fa-hourglass-half" style="color:#fbbf24;font-size:0.82rem;flex-shrink:0;"></i>
                    <div style="min-width:0;">
                        <div style="font-size:0.64rem;color:rgba(255,255,255,0.45);text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">Experience</div>
                        <div style="font-size:0.82rem;font-weight:700;color:#fbbf24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${exp}">${exp}</div>
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

/* ── Wizard Step Navigation ──────────────────────────────────── */
function goToStep(step) {
    const step1 = document.getElementById('step1-content');
    const step2 = document.getElementById('step2-content');
    const tab1  = document.getElementById('tab-step1');
    const tab2  = document.getElementById('tab-step2');
    const nextBtn  = document.getElementById('modal-next-btn');
    const saveBtn  = document.getElementById('save-job-btn');
    const backBtn  = document.getElementById('modal-back-btn');

    if (step === 2) {
        // Validate step 1 first
        const title = document.getElementById('job-title')?.value.trim();
        const desc  = document.getElementById('job-desc')?.value.trim();
        if (!title) {
            showToast('Please enter a Job Title before proceeding.', 'warning');
            return;
        }
        if (!desc) {
            showToast('Please enter a Job Description before proceeding.', 'warning');
            return;
        }

        step1.classList.add('hidden-step');
        step2.classList.add('active');
        tab1.classList.remove('active');
        tab1.classList.add('done');
        document.getElementById('tab-num-1').innerHTML = '<i class="fa-solid fa-check" style="font-size:0.7rem;"></i>';
        tab2.classList.add('active');

        nextBtn.style.display = 'none';
        saveBtn.style.display = 'flex';
        backBtn.style.display = 'flex';

        updateTotalWeightUI();
    } else {
        step1.classList.remove('hidden-step');
        step2.classList.remove('active');
        tab2.classList.remove('active');
        tab1.classList.add('active');
        tab1.classList.remove('done');
        document.getElementById('tab-num-1').textContent = '1';

        nextBtn.style.display = 'flex';
        saveBtn.style.display = 'none';
        backBtn.style.display = 'none';
    }
}

/* ── Weight Slider Logic ────────────────────────────────────────── */
const SLIDER_COLORS = {
    location:      '#6366f1',
    experience:    '#fbbf24',
    qualification: '#a5b4fc',
    skills:        '#10b981',
};

function onWeightChange(field, value) {
    const v = parseInt(value, 10);
    fieldWeights[field] = v;

    // Update badge text
    const badge = document.getElementById(`badge-${field}`);
    if (badge) badge.textContent = `${v}%`;

    // Update slider gradient fill
    const slider = document.getElementById(`weight-${field}`);
    if (slider) {
        const color = SLIDER_COLORS[field] || '#6366f1';
        slider.style.background = `linear-gradient(to right, ${color} ${v}%, rgba(255,255,255,0.12) ${v}%)`;
    }

    updateTotalWeightUI();
}

function updateTotalWeightUI() {
    const total = Object.values(fieldWeights).reduce((s, v) => s + v, 0);
    const pctEl = document.getElementById('total-weight-pct');
    const barEl = document.getElementById('total-bar-fill');
    const hintEl = document.getElementById('total-weight-hint');

    if (pctEl) pctEl.textContent = `${total}%`;

    if (barEl) {
        const barPct = Math.min(total, 100);
        barEl.style.width = `${barPct}%`;
        if (total === 100) {
            barEl.style.background = 'linear-gradient(90deg, #6366f1, #10b981)';
            pctEl && (pctEl.style.color = '#10b981');
        } else if (total > 100) {
            barEl.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
            pctEl && (pctEl.style.color = '#fbbf24');
        } else {
            barEl.style.background = 'linear-gradient(90deg, #6366f1, #818cf8)';
            pctEl && (pctEl.style.color = 'rgba(255,255,255,0.6)');
        }
    }

    if (hintEl) {
        if (total === 100) {
            hintEl.textContent = '✔️ Perfect balance — total weight equals 100%.';
            hintEl.style.color = '#10b981';
        } else if (total > 100) {
            hintEl.textContent = `Total is ${total}% — weights will be normalized proportionally during AI matching.`;
            hintEl.style.color = '#fbbf24';
        } else {
            hintEl.textContent = `Total is ${total}% — remaining ${100 - total}% will be distributed equally.`;
            hintEl.style.color = 'rgba(255,255,255,0.45)';
        }
    }
}

function resetWeights() {
    fieldWeights = { ...DEFAULT_WEIGHTS };
    Object.entries(DEFAULT_WEIGHTS).forEach(([field, val]) => {
        const slider = document.getElementById(`weight-${field}`);
        if (slider) slider.value = val;
        onWeightChange(field, val);
    });
}

function applyWeightsToSliders(weights) {
    const w = weights || {};
    const keys = ['location', 'experience', 'qualification', 'skills'];
    keys.forEach(key => {
        const val = w[key] !== undefined ? w[key] : DEFAULT_WEIGHTS[key];
        fieldWeights[key] = val;
        const slider = document.getElementById(`weight-${key}`);
        if (slider) slider.value = val;
        onWeightChange(key, val);
    });
}

/* Open Create Job Vacancy Modal */
function openCreateJobModal() {
    document.getElementById('job-id-hidden').value = '';
    document.getElementById('job-modal-title').textContent = 'Create Job Vacancy';
    document.getElementById('job-form').reset();
    document.getElementById('job-qualification').value = '';
    jobSkillsTags = [];
    renderSkillTags();
    fieldWeights = { ...DEFAULT_WEIGHTS };
    applyWeightsToSliders();
    goToStep(1);

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

    // Load saved field weights or fall back to defaults
    applyWeightsToSliders(job.field_weights || {});
    goToStep(1);

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
            field_weights: { ...fieldWeights },
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

/* Delete Job Vacancy Modal Handlers */
let _deletingJobId = null;

function deleteJobVacancy(jobId) {
    _deletingJobId = jobId;
    openModal('delete-job-modal');
}

function closeDeleteJobModal() {
    closeModal('delete-job-modal');
    _deletingJobId = null;
}

async function confirmDeleteJobAction() {
    if (!_deletingJobId) return;

    const btn = document.getElementById('confirm-delete-job-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Deleting...';
    }

    try {
        await apiRequest('DELETE', `/api/jobs/${_deletingJobId}`);
        showToast('Job Vacancy deleted successfully.', 'success');
        closeDeleteJobModal();
        await loadJobVacancies();
    } catch (err) {
        showToast(err.message || 'Failed to delete job vacancy.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Delete Vacancy';
        }
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
