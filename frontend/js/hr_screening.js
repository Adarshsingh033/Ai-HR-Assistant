/* ========================================================
   hr_screening.js – Screening Module Logic
   ======================================================== */

let allJobs = [];
let allRounds = [];
let screeningCandidates = [];
let currentOrgId = null;
let currentHrId  = null;
let currentSubTab = 'rounds';

/* ── Init ──────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'hr') {
        location.href = '../index.html';
        return;
    }
    currentOrgId = session.org_id;
    currentHrId  = session.user_id;

    document.getElementById('sidebar-name').textContent   = session.username || 'HR User';
    document.getElementById('sidebar-avatar').textContent = (session.username || 'H').charAt(0).toUpperCase();

    await loadJobs();

    // Check URL tab parameter or default to 'rounds'
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'candidates') switchSubTab('candidates');
    else switchSubTab('rounds');
});

/* ── Load Job list ─────────────────────────────────────── */
async function loadJobs() {
    try {
        const data = await apiRequest('GET', `/api/jobs?organization_id=${currentOrgId}`);
        allJobs = (data && data.jobs) ? data.jobs : [];

        populateJobSelects();
    } catch (e) {
        console.warn('Failed to load jobs:', e);
    }
}

function populateJobSelects() {
    const roundSel  = document.getElementById('round-job-select');
    const modalSel  = document.getElementById('round-modal-job');
    const screenSel = document.getElementById('screen-filter-job');

    const options = allJobs.map(j => {
        const jid   = j.job_id || j.id;
        const title = escapeHtml(j.job_title || j.title || 'Untitled');
        return `<option value="${jid}">${title}</option>`;
    }).join('');

    if (roundSel)  roundSel.innerHTML  = '<option value="">Select Job Vacancy…</option>' + options;
    if (modalSel)  modalSel.innerHTML  = '<option value="">Select Job Vacancy…</option>' + options;
    if (screenSel) screenSel.innerHTML = '<option value="">All Job Vacancies</option>' + options;

    // Auto-select first job if available for rounds tab
    if (allJobs.length > 0 && roundSel && !roundSel.value) {
        roundSel.value = allJobs[0].job_id || allJobs[0].id;
        loadRoundsForJob();
    }
}

/* ── Subtab Switch ─────────────────────────────────────── */
function switchSubTab(tabName) {
    currentSubTab = tabName;

    const bRounds     = document.getElementById('subtab-rounds');
    const bCandidates = document.getElementById('subtab-candidates');
    const vRounds     = document.getElementById('subtab-view-rounds');
    const vCandidates = document.getElementById('subtab-view-candidates');

    if (tabName === 'rounds') {
        bRounds.classList.add('active');
        bCandidates.classList.remove('active');
        vRounds.style.display     = 'block';
        vCandidates.style.display = 'none';
        loadRoundsForJob();
    } else {
        bCandidates.classList.add('active');
        bRounds.classList.remove('active');
        vCandidates.style.display = 'block';
        vRounds.style.display     = 'none';
        loadScreeningCandidates();
    }
}

/* ========================================================
   SUB-MODULE 1: ADD ROUND LOGIC
   ======================================================== */

async function loadRoundsForJob() {
    const jobId = document.getElementById('round-job-select')?.value;
    const grid  = document.getElementById('rounds-grid');
    const empty = document.getElementById('rounds-empty');
    const countInfo = document.getElementById('round-count-info');

    if (!jobId) {
        grid.innerHTML = '';
        if (empty) empty.style.display = 'block';
        if (countInfo) countInfo.textContent = '0 rounds added';
        return;
    }

    try {
        const data = await apiRequest('GET', `/api/screening/rounds?job_id=${jobId}`);
        allRounds = (data && data.rounds) ? data.rounds : [];

        if (countInfo) countInfo.textContent = `${allRounds.length} round${allRounds.length !== 1 ? 's' : ''} created`;

        if (allRounds.length === 0) {
            grid.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }

        if (empty) empty.style.display = 'none';

        grid.innerHTML = allRounds.map((r, i) => {
            const rid   = r.round_id;
            const title = escapeHtml(r.round_title);
            const desc  = escapeHtml(r.round_description || 'No description provided.');

            return `
            <div class="round-card">
                <div class="round-badge">Round ${r.round_order || (i + 1)}</div>
                <div class="round-title">${title}</div>
                <div class="round-desc">${desc}</div>
                <div class="round-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openViewRoundModal('${rid}')" style="flex:1;">
                        <i class="fa-solid fa-eye" style="color:#818cf8;"></i> View
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openEditRoundModal('${rid}')" style="flex:1;">
                        <i class="fa-solid fa-pen-to-square" style="color:#fbbf24;"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openDeleteRoundModal('${rid}')" style="padding:6px 12px;color:#f87171;" title="Delete Round">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        showToast('Failed to load screening rounds: ' + e.message, 'error');
    }
}

function openAddRoundModal() {
    document.getElementById('round-modal-title').textContent = 'Add Screening Round';
    document.getElementById('round-id-input').value          = '';
    document.getElementById('round-title-input').value       = '';
    document.getElementById('round-desc-input').value        = '';

    const sel = document.getElementById('round-job-select')?.value;
    if (sel) document.getElementById('round-modal-job').value = sel;

    openModal('round-modal');
}

function openEditRoundModal(roundId) {
    const r = allRounds.find(x => x.round_id === roundId);
    if (!r) return;

    document.getElementById('round-modal-title').textContent = 'Edit Screening Round';
    document.getElementById('round-id-input').value          = r.round_id;
    document.getElementById('round-modal-job').value         = r.job_id;
    document.getElementById('round-title-input').value       = r.round_title || '';
    document.getElementById('round-desc-input').value        = r.round_description || '';

    openModal('round-modal');
}

async function saveScreeningRound(e) {
    e.preventDefault();
    const rid   = document.getElementById('round-id-input').value;
    const jobId = document.getElementById('round-modal-job').value;
    const title = document.getElementById('round-title-input').value.trim();
    const desc  = document.getElementById('round-desc-input').value.trim();

    if (!jobId || !title) {
        showToast('Please select a job vacancy and enter a round title.', 'warning');
        return;
    }

    const btn = document.getElementById('round-save-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    try {
        if (rid) {
            // Edit existing
            await apiRequest('PUT', `/api/screening/rounds/${rid}`, {
                round_title: title,
                round_description: desc,
            });
            showToast('✅ Screening round updated!', 'success');
        } else {
            // Create new
            await apiRequest('POST', '/api/screening/rounds', {
                job_id: jobId,
                org_id: currentOrgId,
                round_title: title,
                round_description: desc,
            });
            showToast('✅ Screening round created successfully!', 'success');
        }

        closeModal('round-modal');

        // Sync dropdown & reload
        document.getElementById('round-job-select').value = jobId;
        await loadRoundsForJob();
    } catch (err) {
        showToast('Failed to save round: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Round';
    }
}

function openViewRoundModal(roundId) {
    const r = allRounds.find(x => x.round_id === roundId);
    if (!r) return;

    document.getElementById('vr-badge').textContent = `Round ${r.round_order || 1}`;
    document.getElementById('vr-title').textContent = r.round_title || '';
    document.getElementById('vr-job').textContent   = r.job_title || 'Applied Job Vacancy';
    document.getElementById('vr-desc').textContent  = r.round_description || 'No description provided.';

    openModal('view-round-modal');
}

function openDeleteRoundModal(roundId) {
    document.getElementById('del-round-id').value = roundId;
    openModal('del-round-modal');
}

async function confirmDeleteRound() {
    const rid = document.getElementById('del-round-id').value;
    try {
        await apiRequest('DELETE', `/api/screening/rounds/${rid}`);
        showToast('✅ Screening round deleted.', 'success');
        closeModal('del-round-modal');
        await loadRoundsForJob();
    } catch (err) {
        showToast('Failed to delete round: ' + err.message, 'error');
    }
}

/* ========================================================
   SUB-MODULE 2: CANDIDATES SCREENING LIST LOGIC
   ======================================================== */

async function loadScreeningCandidates() {
    showScreeningSkeleton(true);

    try {
        const jobId    = document.getElementById('screen-filter-job')?.value || '';
        const schedule = document.getElementById('screen-filter-schedule')?.value || '';
        const search   = document.getElementById('screen-filter-search')?.value?.trim() || '';

        let url = `/api/screening/candidates?org_id=${currentOrgId}`;
        if (jobId)    url += `&job_id=${encodeURIComponent(jobId)}`;
        if (schedule) url += `&interview_schedule=${encodeURIComponent(schedule)}`;
        if (search)   url += `&search=${encodeURIComponent(search)}`;

        const data = await apiRequest('GET', url);
        screeningCandidates = (data && data.candidates) ? data.candidates : [];

        renderScreeningTable();
    } catch (e) {
        showToast('Failed to load screening candidates: ' + e.message, 'error');
    } finally {
        showScreeningSkeleton(false);
    }
}

function applyScreeningFilters() {
    clearTimeout(applyScreeningFilters._t);
    applyScreeningFilters._t = setTimeout(() => loadScreeningCandidates(), 350);
}

function renderScreeningTable() {
    const tbody = document.getElementById('screen-tbody');
    const empty = document.getElementById('screen-empty');
    const wrap  = document.getElementById('screen-table-wrap');
    const count = document.getElementById('screen-count');

    if (!tbody) return;

    if (screeningCandidates.length === 0) {
        if (empty) empty.style.display = 'block';
        if (wrap)  wrap.style.display  = 'none';
        if (count) count.textContent   = '0 candidates';
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap)  wrap.style.display  = 'block';
    if (count) count.textContent   = `${screeningCandidates.length} contacted candidate${screeningCandidates.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = screeningCandidates.map(c => {
        const cid        = c.candidate_id;
        const initial    = (c.name || 'U').charAt(0).toUpperCase();
        const matchPct   = c.match_percentage || 0;
        const matchCls   = matchPct >= 70 ? 'match-high' : matchPct >= 40 ? 'match-medium' : 'match-low';
        const isPending  = (c.interview_schedule || 'Pending') === 'Pending';
        const schedCls   = isPending ? 'schedule-pending' : 'schedule-active';
        const stageCls   = (c.screening_stage || 'Screening') === 'Interview' ? 'stage-interview' : 'stage-screening';

        return `
        <tr>
            <td>
                <div class="cand-name-cell">
                    <div class="cand-avatar">${initial}</div>
                    <div>
                        <div class="cand-name">${escapeHtml(c.name || 'Unknown')}</div>
                        <div class="cand-email">${escapeHtml(c.email || '—')}</div>
                    </div>
                </div>
            </td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(c.job_title)}">
                ${escapeHtml(c.job_title || 'General Vacancy')}
            </td>
            <td style="white-space:nowrap;">${escapeHtml(c.phone || '—')}</td>
            <td style="white-space:nowrap;">
                <span class="match-badge ${matchCls}">${matchPct}% Match</span>
            </td>
            <td style="text-align:center;">
                <span class="schedule-badge ${schedCls}" onclick="toggleInterviewSchedule('${cid}', '${c.interview_schedule || 'Pending'}')" title="Click to toggle Pending / Active">
                    <i class="fa-solid ${isPending ? 'fa-clock' : 'fa-circle-check'}"></i> ${c.interview_schedule || 'Pending'}
                </span>
            </td>
            <td style="text-align:center;">
                <span class="stage-badge ${stageCls}">
                    <i class="fa-solid ${c.screening_stage === 'Interview' ? 'fa-user-tie' : 'fa-clipboard-check'}"></i> ${c.screening_stage || 'Screening'}
                </span>
            </td>
            <td style="text-align:right;position:relative;">
                <button class="action-dots-btn" onclick="toggleActionMenu(event, '${cid}')" title="Actions">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="action-dropdown" id="amenu-${cid}">
                    <div class="action-dropdown-item" onclick="handleScreenAction('move-interview', '${cid}')">
                        <i class="fa-solid fa-person-arrow-right" style="color:#c084fc;"></i> Move for Interview
                    </div>
                    <div class="action-dropdown-item" onclick="handleScreenAction('progress', '${cid}')">
                        <i class="fa-solid fa-comments" style="color:#38bdf8;"></i> See Progress & Add Comment
                    </div>
                    <div class="action-dropdown-divider"></div>
                    <div class="action-dropdown-item danger" onclick="handleScreenAction('delete', '${cid}', '${escapeHtml(c.name || '')}')">
                        <i class="fa-solid fa-user-minus" style="color:#f87171;"></i> Delete
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/* ── Toggle Interview Schedule Status (Pending / Active) ── */
async function toggleInterviewSchedule(candidateId, currentStatus) {
    const newStatus = currentStatus === 'Pending' ? 'Active' : 'Pending';
    try {
        await apiRequest('PUT', `/api/screening/candidates/${candidateId}/schedule`, {
            interview_schedule: newStatus,
        });
        showToast(`✅ Interview schedule set to ${newStatus}`, 'success');
        await loadScreeningCandidates();
    } catch (err) {
        showToast('Failed to toggle interview schedule: ' + err.message, 'error');
    }
}

/* ── Move for Interview ── */
async function moveCandidateToInterview(candidateId) {
    try {
        await apiRequest('PUT', `/api/screening/candidates/${candidateId}/move-interview`);
        showToast('🚀 Candidate advanced to Interview stage!', 'success');
        await loadScreeningCandidates();
    } catch (err) {
        showToast('Failed to move candidate for interview: ' + err.message, 'error');
    }
}

/* ── Remove Candidate from Screening ── */
function openRemoveScreeningModal(candidateId, name) {
    document.getElementById('del-screen-cid').value = candidateId;
    document.getElementById('del-screen-name').textContent = name || 'this candidate';
    openModal('del-screen-cand-modal');
}

async function confirmRemoveScreeningCandidate() {
    const cid = document.getElementById('del-screen-cid').value;
    try {
        await apiRequest('DELETE', `/api/screening/candidates/${cid}`);
        showToast('Candidate removed from screening list.', 'success');
        closeModal('del-screen-cand-modal');
        await loadScreeningCandidates();
    } catch (err) {
        showToast('Failed to remove candidate: ' + err.message, 'error');
    }
}

/* ── See Progress & Add Comment Modal ── */
async function openProgressModal(candidateId) {
    try {
        const data = await apiRequest('GET', `/api/screening/candidates/${candidateId}/progress`);
        const c = data.candidate;
        const rounds = data.rounds || [];

        document.getElementById('pm-avatar').textContent = (c.name || 'U').charAt(0).toUpperCase();
        document.getElementById('pm-name').textContent   = c.name || 'Unknown Candidate';
        document.getElementById('pm-sub').textContent    = `${c.job_title} • ${c.match_percentage}% Match • Schedule: ${c.interview_schedule}`;

        const container = document.getElementById('pm-rounds-container');

        if (rounds.length === 0) {
            container.innerHTML = `
            <div class="table-empty" style="padding:40px 20px;">
                <i class="fa-solid fa-layer-group" style="font-size:2rem;color:rgba(99,102,241,0.4);margin-bottom:10px;"></i>
                No screening rounds created for ${escapeHtml(c.job_title)} yet.<br>
                <span style="font-size:0.78rem;opacity:0.6;">Go to the <strong>Add Round</strong> sub-module to create screening rounds for this job.</span>
            </div>`;
            openModal('progress-modal');
            return;
        }

        container.innerHTML = rounds.map((r, idx) => {
            const rid = r.round_id;
            return `
            <div class="progress-round-box" id="pbox-${rid}">
                <div class="progress-round-top">
                    <div>
                        <span class="round-badge">Round ${r.round_order || (idx + 1)}</span>
                        <span class="progress-round-title" style="margin-left:8px;">${escapeHtml(r.round_title)}</span>
                    </div>
                    <select class="filter-select" id="pstat-${rid}" style="width:150px;height:34px;font-size:0.78rem;">
                        <option value="Pending"     ${r.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="In Progress" ${r.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Passed"      ${r.status === 'Passed' ? 'selected' : ''}>Passed</option>
                        <option value="Failed"      ${r.status === 'Failed' ? 'selected' : ''}>Failed</option>
                    </select>
                </div>
                <div style="font-size:0.8rem;color:rgba(255,255,255,0.55);margin-bottom:12px;">${escapeHtml(r.round_description || 'No description.')}</div>

                <div class="form-group" style="margin-bottom:10px;">
                    <label class="form-label" style="font-size:0.68rem;">HR Evaluation Comment & Notes</label>
                    <textarea class="form-control" id="pcomm-${rid}" rows="2" placeholder="Enter candidate performance feedback, strengths, weak points, or interviewer notes…">${escapeHtml(r.comment || '')}</textarea>
                </div>

                <div style="display:flex;justify-content:flex-end;">
                    <button class="btn btn-primary btn-sm" onclick="saveRoundComment('${cid}', '${rid}')" id="pbtn-${rid}" style="padding:6px 16px;font-size:0.78rem;">
                        <i class="fa-solid fa-floppy-disk"></i> Save Evaluation
                    </button>
                </div>
            </div>`;
        }).join('');

        openModal('progress-modal');
    } catch (err) {
        showToast('Failed to load candidate progress: ' + err.message, 'error');
    }
}

async function saveRoundComment(candidateId, roundId) {
    const status  = document.getElementById(`pstat-${roundId}`)?.value || 'Pending';
    const comment = document.getElementById(`pcomm-${roundId}`)?.value?.trim() || '';

    const btn = document.getElementById(`pbtn-${roundId}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    }

    try {
        await apiRequest('POST', `/api/screening/candidates/${candidateId}/comments`, {
            round_id: roundId,
            status: status,
            comment: comment,
        });
        showToast('✅ Evaluation comment saved!', 'success');
    } catch (err) {
        showToast('Failed to save evaluation: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Evaluation';
        }
    }
}

/* ── Action Dropdown Handlers ────────────────────────────── */
function toggleActionMenu(event, cid) {
    event.stopPropagation();
    document.querySelectorAll('.action-dropdown.open').forEach(el => {
        if (el.id !== `amenu-${cid}`) el.classList.remove('open');
    });
    const menu = document.getElementById(`amenu-${cid}`);
    if (menu) menu.classList.toggle('open');
}

function handleScreenAction(action, cid, name = '') {
    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
    if (action === 'move-interview') moveCandidateToInterview(cid);
    if (action === 'progress')       openProgressModal(cid);
    if (action === 'delete')         openRemoveScreeningModal(cid, name);
}

document.addEventListener('click', () => {
    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
});

/* ── Helpers ─────────────────────────────────────────────── */
function showScreeningSkeleton(show) {
    const sk   = document.getElementById('screen-skeleton');
    const wrap = document.getElementById('screen-table-wrap');
    const emp  = document.getElementById('screen-empty');
    if (show) {
        if (sk)   sk.style.display   = 'block';
        if (wrap) wrap.style.display = 'none';
        if (emp)  emp.style.display  = 'none';
    } else {
        if (sk) sk.style.display = 'none';
    }
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
    });
});
