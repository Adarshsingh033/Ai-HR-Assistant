/* ========================================================
   hr_screening.js – Screening Module Logic
   ======================================================== */

let allJobs = [];
let screeningCandidates = [];
let currentOrgId = null;
let currentHrId = null;
let activeCandidateId = null;
let activeCandidateProgressData = null;
let screeningState = { page: 1, limit: 10 };

/* ── Init ──────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'hr') {
        location.href = '../index.html';
        return;
    }
    currentOrgId = session.org_id;
    currentHrId = session.user_id;

    document.getElementById('sidebar-name').textContent = session.username || 'HR User';
    document.getElementById('sidebar-avatar').textContent = (session.username || 'H').charAt(0).toUpperCase();

    await loadJobs();
    await loadScreeningCandidates();
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
    const screenSel = document.getElementById('screen-filter-job');
    if (!screenSel) return;

    const options = allJobs.map(j => {
        const jid = j.job_id || j.id;
        const title = escapeHtml(j.job_title || j.title || 'Untitled');
        return `<option value="${jid}">${title}</option>`;
    }).join('');

    screenSel.innerHTML = '<option value="">All Job Vacancies</option>' + options;
}

/* ========================================================
   CANDIDATES SCREENING LIST LOGIC
   ======================================================== */

async function loadScreeningCandidates() {
    showScreeningSkeleton(true);

    try {
        const jobId = document.getElementById('screen-filter-job')?.value || '';
        const status = document.getElementById('screen-filter-status')?.value || '';
        const search = document.getElementById('screen-filter-search')?.value?.trim() || '';

        let url = `/api/screening/candidates?org_id=${currentOrgId}`;
        if (jobId) url += `&job_id=${encodeURIComponent(jobId)}`;
        if (status) url += `&interview_status=${encodeURIComponent(status)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const data = await apiRequest('GET', url);
        screeningCandidates = (data && data.candidates) ? data.candidates : [];
        screeningState.page = 1;

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
    const wrap = document.getElementById('screen-table-wrap');
    const count = document.getElementById('screen-count');

    if (!tbody) return;

    const total = screeningCandidates.length;

    if (total === 0) {
        if (empty) empty.style.display = 'flex';
        if (wrap) wrap.style.display = 'none';
        if (count) count.textContent = '0 candidates';
        renderScreeningPagination(0, 1, 0, 0);
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap) wrap.style.display = 'block';
    if (count) count.textContent = `${total} contacted candidate${total !== 1 ? 's' : ''}`;

    const totalPages = Math.ceil(total / screeningState.limit) || 1;
    if (screeningState.page > totalPages) screeningState.page = totalPages;
    if (screeningState.page < 1) screeningState.page = 1;

    const startIdx = (screeningState.page - 1) * screeningState.limit;
    const pagedCandidates = screeningCandidates.slice(startIdx, startIdx + screeningState.limit);

    tbody.innerHTML = pagedCandidates.map(c => {
        const cid = c.candidate_id;
        const initial = (c.name || 'U').charAt(0).toUpperCase();

        const contactedStatus = c.contacted_status || 'Contacted';
        const interviewStatus = c.interview_status || 'Ongoing';
        const roundStep = c.current_round_title || `Round ${c.current_round_order || 1}`;

        let statusPillClass = 'status-pill-ongoing';
        if (interviewStatus === 'Passed') statusPillClass = 'status-pill-passed';
        else if (interviewStatus === 'Rejected') statusPillClass = 'status-pill-rejected';
        else if (interviewStatus === 'On Hold') statusPillClass = 'status-pill-onhold';

        return `
        <tr>
            <td style="font-weight:600;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.name || 'Unknown')}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.email || '—')}</td>
            <td style="white-space:nowrap;">${escapeHtml(c.phone || '—')}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                <span class="round-step-badge">
                    <i class="fa-solid fa-diagram-next"></i> ${escapeHtml(roundStep)}
                </span>
            </td>
            <td style="white-space:nowrap;">
                <span class="status-pill ${statusPillClass}">
                    <i class="fa-solid ${getInterviewStatusIcon(interviewStatus)}"></i> ${escapeHtml(interviewStatus)}
                </span>
            </td>
            <td style="text-align:right;" class="action-cell">
                <button class="action-dots-btn" onclick="toggleActionMenu(event, '${cid}')" title="Actions">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="action-dropdown" id="amenu-${cid}">
                    <div class="action-dropdown-item" onclick="openViewProgressModal('${cid}')">
                        <i class="fa-regular fa-eye" style="color:#a5b4fc;"></i> View
                    </div>
                    <div class="action-dropdown-item" onclick="openUpdateProgressModal('${cid}')">
                        <i class="fa-solid fa-pen-to-square" style="color:#38bdf8;"></i> Update Status
                    </div>
                    <div class="action-dropdown-divider"></div>
                    <div class="action-dropdown-item disabled" onclick="event.stopPropagation()">
                        <i class="fa-solid fa-envelope" style="color:#94a3b8;"></i> Send Mail
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    renderScreeningPagination(total, totalPages, startIdx, pagedCandidates.length);
}

function changeScreeningLimit(newLimit) {
    screeningState.limit = parseInt(newLimit, 10) || 10;
    screeningState.page = 1;
    renderScreeningTable();
}

function changeScreeningPage(page) {
    screeningState.page = page;
    renderScreeningTable();
}

function renderScreeningPagination(total, totalPages, startIdx, pagedCount) {
    const container = document.getElementById('screening-pagination-container');
    if (!container) return;

    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    const startItem = total === 0 ? 0 : startIdx + 1;
    const endItem = startIdx + pagedCount;
    const currentPage = screeningState.page;

    let pageBtns = '';

    const maxVisiblePages = 7;
    let startPage = 1;
    let endPage = totalPages;

    if (totalPages > maxVisiblePages) {
        if (currentPage <= 4) {
            startPage = 1;
            endPage = 5;
        } else if (currentPage >= totalPages - 3) {
            startPage = totalPages - 4;
            endPage = totalPages;
        } else {
            startPage = currentPage - 2;
            endPage = currentPage + 2;
        }
    }

    if (startPage > 1) {
        pageBtns += `<button onclick="changeScreeningPage(1)" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">1</button>`;
        if (startPage > 2) {
            pageBtns += `<span style="color:rgba(255,255,255,0.4);font-size:0.8rem;padding:0 2px;">…</span>`;
        }
    }

    for (let p = startPage; p <= endPage; p++) {
        if (p === currentPage) {
            pageBtns += `<button style="width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,0.18);color:#fff;font-size:0.82rem;font-weight:700;cursor:default;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${p}</button>`;
        } else {
            pageBtns += `<button onclick="changeScreeningPage(${p})" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.82rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">${p}</button>`;
        }
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageBtns += `<span style="color:rgba(255,255,255,0.4);font-size:0.8rem;padding:0 2px;">…</span>`;
        }
        pageBtns += `<button onclick="changeScreeningPage(${totalPages})" style="width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:0.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">${totalPages}</button>`;
    }

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-top: 1px solid var(--border); background: var(--bg-card); border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; font-family: 'Inter', sans-serif;">
            <div style="display: flex; align-items: center; gap: 16px; font-size: 0.82rem; color: rgba(255,255,255,0.6); font-weight: 500;">
                <span>${startItem}–${endItem} of ${total} <span style="margin:0 4px;opacity:0.4;">·</span> Page ${currentPage} of ${totalPages}</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>Rows per page:</span>
                    <select onchange="changeScreeningLimit(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: #fff; border-radius: 8px; padding: 3px 8px; font-size: 0.8rem; font-weight: 600; outline: none; cursor: pointer;">
                        <option value="10" ${screeningState.limit === 10 ? 'selected' : ''}>10</option>
                        <option value="25" ${screeningState.limit === 25 ? 'selected' : ''}>25</option>
                        <option value="50" ${screeningState.limit === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${screeningState.limit === 100 ? 'selected' : ''}>100</option>
                    </select>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 2px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 4px 6px;">
                <button onclick="changeScreeningPage(1)" ${currentPage <= 1 ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${currentPage <= 1 ? '0.3' : '1'};transition:all 0.15s;" title="First page">
                    <i class="fa-solid fa-angles-left"></i>
                </button>
                <button onclick="changeScreeningPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${currentPage <= 1 ? '0.3' : '1'};transition:all 0.15s;" title="Previous page">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                ${pageBtns}
                <button onclick="changeScreeningPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${currentPage >= totalPages ? '0.3' : '1'};transition:all 0.15s;" title="Next page">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                <button onclick="changeScreeningPage(${totalPages})" ${currentPage >= totalPages ? 'disabled' : ''} style="width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.75rem;display:inline-flex;align-items:center;justify-content:center;opacity:${currentPage >= totalPages ? '0.3' : '1'};transition:all 0.15s;" title="Last page">
                    <i class="fa-solid fa-angles-right"></i>
                </button>
            </div>
        </div>
    `;
}

function getInterviewStatusIcon(status) {
    if (status === 'Passed') return 'fa-circle-check';
    if (status === 'Rejected') return 'fa-circle-xmark';
    if (status === 'On Hold') return 'fa-circle-pause';
    return 'fa-spinner';
}

function toggleActionMenu(event, cid) {
    event.stopPropagation();
    document.querySelectorAll('.action-dropdown.open').forEach(el => {
        if (el.id !== `amenu-${cid}`) el.classList.remove('open');
    });
    const menu = document.getElementById(`amenu-${cid}`);
    if (menu) menu.classList.toggle('open');
}

document.addEventListener('click', () => {
    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
});

/* ========================================================
   1. VIEW CANDIDATE PROGRESS MODAL
   ======================================================== */

async function openViewProgressModal(candidateId) {
    try {
        const data = await apiRequest('GET', `/api/screening/candidates/${candidateId}/progress`);
        const c = data.candidate;
        const rounds = data.rounds || [];
        activeCandidateProgressData = data;

        document.getElementById('vp-avatar').textContent = (c.name || 'U').charAt(0).toUpperCase();
        document.getElementById('vp-name').textContent = c.name || 'Unknown Candidate';
        document.getElementById('vp-sub').textContent = `${c.email || '—'} • ${c.job_title || 'General Vacancy'}`;

        const alertContainer = document.getElementById('vp-alert-banner');
        if (c.interview_status === 'Rejected' || c.interview_status === 'On Hold') {
            const currentRound = rounds.find(r => (r.round_order || 1) === c.current_round_order) || rounds[rounds.length - 1] || {};
            const isRejected = c.interview_status === 'Rejected';
            const bannerClass = isRejected ? 'alert-banner-rejected' : 'alert-banner-onhold';
            const iconColor = isRejected ? '#f87171' : '#fbbf24';
            const iconClass = isRejected ? 'fa-circle-xmark' : 'fa-circle-pause';

            alertContainer.className = bannerClass;
            alertContainer.style.display = 'flex';
            alertContainer.style.alignItems = 'center';
            alertContainer.innerHTML = `
                <div style="font-size:1.3rem;color:${iconColor};display:flex;align-items:center;">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div>
                    <div style="font-size:0.95rem;font-weight:800;color:${iconColor};">Candidate Status: ${escapeHtml(c.interview_status)}</div>
                </div>
            `;
        } else {
            alertContainer.style.display = 'none';
        }

        // Stepper rendering
        const stepper = document.getElementById('vp-stepper');
        if (rounds.length === 0) {
            stepper.innerHTML = `<div style="color:rgba(255,255,255,0.5);font-size:0.85rem;">No interview rounds configured for this vacancy.</div>`;
        } else {
            stepper.innerHTML = rounds.map(r => {
                const order = r.round_order || 1;
                let stepClass = '';
                let nodeContent = order;

                if (r.status === 'Passed' || (c.interview_status === 'Passed' && order <= c.current_round_order)) {
                    stepClass = 'completed';
                    nodeContent = '<i class="fa-solid fa-check"></i>';
                } else if (order === c.current_round_order) {
                    if (c.interview_status === 'Rejected') {
                        stepClass = 'rejected';
                        nodeContent = '<i class="fa-solid fa-xmark"></i>';
                    } else if (c.interview_status === 'On Hold') {
                        stepClass = 'onhold';
                        nodeContent = '<i class="fa-solid fa-pause"></i>';
                    } else {
                        stepClass = 'active';
                    }
                }

                return `
                <div class="step-item ${stepClass}">
                    <div class="step-circle">${nodeContent}</div>
                    <div class="step-title-text">${escapeHtml(r.round_title)}</div>
                    <div class="step-status-sub">${r.status || 'Pending'}</div>
                </div>`;
            }).join('');
        }

        // Round feedback cards rendering
        const roundsDetails = document.getElementById('vp-rounds-details');
        if (rounds.length === 0) {
            roundsDetails.innerHTML = `<div style="color:rgba(255,255,255,0.4);font-size:0.84rem;">No round evaluation comments saved yet.</div>`;
        } else {
            roundsDetails.innerHTML = rounds.map(r => `
                <div class="progress-round-box">
                    <div class="progress-round-top">
                        <div style="font-size:0.95rem;font-weight:800;color:#fff;">
                            Round ${r.round_order}: ${escapeHtml(r.round_title)}
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            ${r.score !== null && r.score !== undefined ? `<span style="background:rgba(99,102,241,0.2);color:#a5b4fc;padding:3px 10px;border-radius:99px;font-weight:800;font-size:0.75rem;border:1px solid rgba(99,102,241,0.4);"><i class="fa-solid fa-star"></i> Score: ${r.score}/100</span>` : ''}
                            <span class="status-pill ${r.status === 'Passed' ? 'status-pill-passed' : r.status === 'Rejected' ? 'status-pill-rejected' : r.status === 'On Hold' ? 'status-pill-onhold' : 'status-pill-ongoing'}">${r.status || 'Pending'}</span>
                        </div>
                    </div>
                    <div style="font-size:0.8rem;color:rgba(255,255,255,0.55);margin-bottom:8px;">${escapeHtml(r.round_description || 'No description.')}</div>
                    ${r.comment ? `<div style="font-size:0.84rem;color:#e2e8f0;background:rgba(255,255,255,0.03);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);margin-top:6px;"><strong>HR Comment:</strong> ${escapeHtml(r.comment)}</div>` : `<div style="font-size:0.78rem;color:rgba(255,255,255,0.35);font-style:italic;margin-top:4px;">No evaluation comments added for this round.</div>`}
                </div>
            `).join('');
        }

        openModal('view-progress-modal');
    } catch (err) {
        showToast('Failed to load candidate progress: ' + err.message, 'error');
    }
}

/* ========================================================
   2. UPDATE INTERVIEW PROGRESS MODAL
   ======================================================== */

function selectStatusTile(status) {
    const input = document.getElementById('up-status-select');
    if (input) input.value = status;
    document.querySelectorAll('.status-tile').forEach(tile => {
        if (tile.getAttribute('data-status') === status) {
            tile.classList.add('active');
        } else {
            tile.classList.remove('active');
        }
    });
}

async function openUpdateProgressModal(candidateId) {
    activeCandidateId = candidateId;
    document.getElementById('up-candidate-id').value = candidateId;

    try {
        const data = await apiRequest('GET', `/api/screening/candidates/${candidateId}/progress`);
        const c = data.candidate;
        const rounds = data.rounds || [];
        activeCandidateProgressData = data;

        const initial = (c.name || 'U').charAt(0).toUpperCase();
        const avatarEl = document.getElementById('up-cand-avatar');
        if (avatarEl) avatarEl.textContent = initial;
        
        const nameEl = document.getElementById('up-cand-name');
        if (nameEl) nameEl.textContent = c.name || 'Unknown Candidate';

        const jobEl = document.getElementById('up-cand-job');
        if (jobEl) jobEl.innerHTML = `<i class="fa-solid fa-briefcase" style="margin-right:4px;"></i> ${escapeHtml(c.job_title || 'General Vacancy')}`;

        const subEl = document.getElementById('up-cand-sub');
        if (subEl) subEl.textContent = c.email || '—';

        const roundSelect = document.getElementById('up-round-select');
        roundSelect.innerHTML = rounds.map(r => `
            <option value="${r.round_id}" ${r.round_order === c.current_round_order ? 'selected' : ''}>
                Round ${r.round_order}: ${escapeHtml(r.round_title)} ${r.round_order === c.current_round_order ? '(Current Active Step)' : ''}
            </option>
        `).join('');

        const selectedRound = rounds.find(r => r.round_order === c.current_round_order) || rounds[0] || {};
        const targetStatus = selectedRound.status && selectedRound.status !== 'Pending' ? selectedRound.status : c.interview_status || 'Passed';
        selectStatusTile(targetStatus);

        document.getElementById('up-score-input').value = selectedRound.score !== null && selectedRound.score !== undefined ? selectedRound.score : '';
        document.getElementById('up-comment-input').value = selectedRound.comment || '';

        openModal('update-progress-modal');
    } catch (err) {
        showToast('Failed to load candidate details: ' + err.message, 'error');
    }
}

async function submitInterviewProgress() {
    const cid = document.getElementById('up-candidate-id').value;
    const roundId = document.getElementById('up-round-select').value;
    const status = document.getElementById('up-status-select').value;
    const scoreVal = document.getElementById('up-score-input').value;
    const comment = document.getElementById('up-comment-input').value.trim();

    if (!roundId) {
        showToast('Please select an interview round.', 'error');
        return;
    }

    const score = scoreVal !== '' ? parseInt(scoreVal, 10) : null;

    try {
        await apiRequest('POST', `/api/screening/candidates/${cid}/progress`, {
            round_id: roundId,
            status: status,
            score: score,
            comment: comment,
        });

        showToast(' Interview progress updated successfully!', 'success');
        closeModal('update-progress-modal');
        await loadScreeningCandidates();
    } catch (err) {
        showToast('Failed to save interview progress: ' + err.message, 'error');
    }
}

/* ========================================================
   3. EDIT INTERVIEW ROUND MODAL
   ======================================================== */

async function openEditRoundsModal(candidateId, jobId) {
    document.getElementById('er-job-id').value = jobId;

    try {
        const data = await apiRequest('GET', `/api/screening/rounds?job_id=${jobId}`);
        const rounds = data.rounds || [];

        const job = allJobs.find(j => (j.job_id || j.id) === jobId);
        document.getElementById('er-job-sub').textContent = job ? (job.job_title || job.title) : 'Job Vacancy Rounds';

        const listContainer = document.getElementById('er-rounds-list');

        if (rounds.length === 0) {
            listContainer.innerHTML = `<div style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:14px;">No rounds currently configured. Click below to add rounds.</div>`;
        } else {
            listContainer.innerHTML = rounds.map((r, idx) => `
                <div class="progress-round-box er-round-box" data-round-id="${r.round_id}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <span class="round-step-badge">Round ${idx + 1}</span>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Round Title *</label>
                        <input type="text" class="form-control er-round-title" value="${escapeHtml(r.round_title)}" placeholder="e.g. HR Screening" />
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label">Round Description</label>
                        <textarea class="form-control er-round-desc" rows="2" placeholder="Enter round description or guidelines">${escapeHtml(r.round_description || '')}</textarea>
                    </div>
                </div>
            `).join('');
        }

        openModal('edit-rounds-modal');
    } catch (err) {
        showToast('Failed to load job vacancy rounds: ' + err.message, 'error');
    }
}

function addNewRoundToEditForm() {
    const listContainer = document.getElementById('er-rounds-list');
    const currentCount = listContainer.querySelectorAll('.er-round-box').length;
    const newIdx = currentCount + 1;

    const div = document.createElement('div');
    div.className = 'progress-round-box er-round-box';
    div.dataset.roundId = 'new';
    div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span class="round-step-badge">Round ${newIdx} (New)</span>
            <button onclick="this.closest('.er-round-box').remove()" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:0.85rem;"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="form-group">
            <label class="form-label">Round Title *</label>
            <input type="text" class="form-control er-round-title" value="" placeholder="e.g. Technical Interview" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Round Description</label>
            <textarea class="form-control er-round-desc" rows="2" placeholder="Enter round description or guidelines"></textarea>
        </div>
    `;
    listContainer.appendChild(div);
}

async function saveEditedRounds() {
    const jobId = document.getElementById('er-job-id').value;
    const roundBoxes = document.querySelectorAll('.er-round-box');

    let hasError = false;
    roundBoxes.forEach(box => {
        const titleInput = box.querySelector('.er-round-title');
        if (!titleInput.value.trim()) {
            titleInput.style.borderColor = '#ef4444';
            hasError = true;
        } else {
            titleInput.style.borderColor = '';
        }
    });

    if (hasError) {
        showToast('Please enter a Title for all rounds.', 'error');
        return;
    }

    try {
        for (const box of roundBoxes) {
            const roundId = box.dataset.roundId;
            const title = box.querySelector('.er-round-title').value.trim();
            const desc = box.querySelector('.er-round-desc').value.trim();

            if (roundId === 'new') {
                await apiRequest('POST', `/api/screening/rounds`, {
                    job_id: jobId,
                    org_id: currentOrgId,
                    round_title: title,
                    round_description: desc
                });
            } else {
                await apiRequest('PUT', `/api/screening/rounds/${roundId}`, {
                    round_title: title,
                    round_description: desc
                });
            }
        }

        showToast(' Interview rounds updated successfully!', 'success');
        closeModal('edit-rounds-modal');
        await loadScreeningCandidates();
    } catch (err) {
        showToast('Failed to save interview rounds: ' + err.message, 'error');
    }
}

/* ── Helpers ─────────────────────────────────────────────── */
function showScreeningSkeleton(show) {
    const sk = document.getElementById('screen-skeleton');
    const wrap = document.getElementById('screen-table-wrap');
    const emp = document.getElementById('screen-empty');
    if (show) {
        if (sk) sk.style.display = 'block';
        if (wrap) wrap.style.display = 'none';
        if (emp) emp.style.display = 'none';
    } else {
        if (sk) sk.style.display = 'none';
    }
}

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function (e) {
        if (e.target === this) this.classList.remove('open');
    });
});
