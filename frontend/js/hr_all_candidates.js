/* ========================================================
   hr_all_candidates.js – Candidates List Module
   ======================================================== */

let allCandidates = [];
let allJobs = [];
let currentOrgId = null;
let currentHrId = null;
let currentBranchId = null;  // branch-level isolation
let sortByMatch = false;

let candidateState = {
    page: 1,
    limit: 10
};

/* ── Init ──────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
    const session = Session.get();
    if (!session || session.role !== 'hr') {
        location.href = '../index.html';
        return;
    }
    currentOrgId = session.org_id;
    currentHrId = session.user_id;
    currentBranchId = session.branch_id || null;  // enforce branch isolation

    try {
        const profile = await apiRequest('GET', '/api/hr/profile');
        if (profile) {
            currentOrgId = profile.org_id || currentOrgId;
            currentBranchId = profile.branch_id || currentBranchId;
        }
    } catch(e) {}

    syncHRSidebarFromSession();

    // Pre-select job from URL param (e.g. linked from jobs.html)
    const params = new URLSearchParams(window.location.search);
    const jobParam = params.get('job_id');

    await Promise.all([loadJobs(jobParam), loadCandidates()]);
});

/* ── Load Job list for filter ──────────────────────────── */
async function loadJobs(preselect = null) {
    try {
        // Always filter jobs to current branch for branch-level data isolation
        let url = `/api/jobs?organization_id=${currentOrgId}`;
        if (currentBranchId) url += `&branch_id=${currentBranchId}`;
        const data = await apiRequest('GET', url);
        allJobs = (data && data.jobs) ? data.jobs : [];
        const sel = document.getElementById('filter-job');
        if (!sel) return;
        sel.innerHTML = '<option value="">All Job Vacancies</option>';
        allJobs.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.job_id || j.id;
            opt.textContent = j.job_title || j.title || 'Untitled';
            sel.appendChild(opt);
        });
        if (preselect) sel.value = preselect;
    } catch (e) {
        console.warn('Failed to load jobs for filter:', e);
    }
}

/* ── Load Candidates ────────────────────────────────────── */
async function loadCandidates(byMatch = false) {
    sortByMatch = byMatch;
    showSkeleton(true);

    try {
        const jobId = document.getElementById('filter-job')?.value || '';
        const contacted = document.getElementById('filter-status')?.value || document.getElementById('filter-contacted')?.value || '';
        const search = document.getElementById('search-input')?.value?.trim() || document.getElementById('filter-search')?.value?.trim() || '';

        let url = `/api/candidates?org_id=${currentOrgId}`;
        // Branch-level isolation: HR users only see their branch's candidates
        if (currentBranchId) url += `&branch_id=${currentBranchId}`;
        if (jobId) url += `&job_id=${encodeURIComponent(jobId)}`;
        if (contacted !== '') url += `&contacted=${encodeURIComponent(contacted)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (byMatch) url += `&sort_by_match=true`;

        const data = await apiRequest('GET', url);
        allCandidates = (data && data.candidates) ? data.candidates : [];

        candidateState.page = 1;
        renderStats();
        renderTable();
    } catch (e) {
        showToast('Failed to load candidates: ' + e.message, 'error');
    } finally {
        showSkeleton(false);
    }
}

function applyFilters() {
    clearTimeout(applyFilters._t);
    applyFilters._t = setTimeout(() => loadCandidates(sortByMatch), 350);
}

/* ── Filter Handlers (Called by all_candidates.html controls) ── */
function onSearchInput(val) {
    applyFilters();
}

function onJobFilterChange(val) {
    loadCandidates(sortByMatch);
}

function onStatusFilterChange(val) {
    loadCandidates(sortByMatch);
}

function onMinAtsFilterChange(val) {
    candidateState.page = 1;
    renderTable();
}

function clearAllFilters() {
    if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
    if (document.getElementById('filter-job')) document.getElementById('filter-job').value = '';
    if (document.getElementById('filter-status')) document.getElementById('filter-status').value = '';
    if (document.getElementById('filter-contacted')) document.getElementById('filter-contacted').value = '';
    if (document.getElementById('filter-min-ats')) document.getElementById('filter-min-ats').value = '0';
    loadCandidates(false);
}

function resetFilters() {
    clearAllFilters();
}

/* ── Stats ──────────────────────────────────────────────── */
function renderStats() {
    const total = allCandidates.length;
    const now = new Date();
    const month = allCandidates.filter(c => {
        if (!c.created_at) return false;
        const d = new Date(c.created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const reached = allCandidates.filter(c => c.reached === true || c.reached === 'true').length;

    const totalEl = document.getElementById('stat-total');
    if (totalEl) totalEl.textContent = total;
    const monthEl = document.getElementById('stat-month');
    if (monthEl) monthEl.textContent = month;
    const cntEl = document.getElementById('stat-contacted');
    if (cntEl) cntEl.textContent = reached;
    const rchEl = document.getElementById('stat-reached');
    if (rchEl) rchEl.textContent = reached;
}

/* ── Table Render (7 Columns with Rank & Contacted Toggle) ── */
function renderTable() {
    const tbody = document.getElementById('candidates-tbody');
    const empty = document.getElementById('table-empty');
    const wrap = document.getElementById('table-wrap');
    const count = document.getElementById('table-count');

    if (!tbody) return;

    // Filter by Min ATS score if selected
    const minAts = parseInt(document.getElementById('filter-min-ats')?.value || '0', 10);
    let displayList = allCandidates;
    if (minAts > 0) {
        displayList = displayList.filter(c => (c.match_percentage || 0) >= minAts);
    }

    if (displayList.length === 0) {
        if (empty) empty.style.display = 'block';
        if (wrap) wrap.style.display = 'none';
        if (count) count.textContent = '0 candidates';
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap) wrap.style.display = 'block';
    if (count) count.textContent = `${displayList.length} candidate${displayList.length !== 1 ? 's' : ''}`;

    const total = displayList.length;
    const totalPages = Math.ceil(total / candidateState.limit) || 1;
    if (candidateState.page > totalPages) candidateState.page = totalPages;
    if (candidateState.page < 1) candidateState.page = 1;

    const startIdx = (candidateState.page - 1) * candidateState.limit;
    const pagedCandidates = displayList.slice(startIdx, startIdx + candidateState.limit);

    tbody.innerHTML = pagedCandidates.map((c, index) => {
        const rank = startIdx + index + 1;
        const rankClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
        const cid = c.candidate_id;
        const matchPct = c.match_percentage || 0;
        const matchCls = matchPct >= 70 ? 'match-high' : matchPct >= 40 ? 'match-medium' : 'match-low';

        return `
        <tr>
            <td style="text-align:center;">
                <div class="rank-badge ${rankClass}" title="Rank #${rank}">#${rank}</div>
            </td>
            <td>
                <div class="cand-name">${escapeHtml(c.name || 'Unknown Candidate')}</div>
            </td>
            <td class="td-truncate" title="${escapeHtml(c.email || '')}">
                ${escapeHtml(c.email || '—')}
            </td>
            <td style="white-space:nowrap;">${escapeHtml(c.phone || '—')}</td>
            <td class="td-truncate" title="${escapeHtml(c.address || '')}">
                ${escapeHtml(c.address || '—')}
            </td>
            <td style="text-align:center;white-space:nowrap;">
                <span class="match-badge ${matchCls}">${matchPct}%</span>
            </td>
            <td style="text-align:center;">
                <label class="toggle-switch" title="${c.reached ? 'Contacted' : 'Not Contacted'}">
                    <input type="checkbox" ${c.reached ? 'checked' : ''} onchange="toggleCandidateReached('${cid}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td style="text-align:right;position:relative;">
                <button class="action-dots-btn" onclick="toggleActionMenu(event, '${cid}')" title="Actions">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="action-dropdown" id="amenu-${cid}">
                    <div class="action-dropdown-item" onclick="handleAction('view', '${cid}')">
                        <i class="fa-regular fa-eye" style="color:#818cf8;"></i> View
                    </div>
                    <div class="action-dropdown-item" onclick="handleAction('edit', '${cid}')">
                        <i class="fa-solid fa-pen" style="color:#a5b4fc;"></i> Edit
                    </div>
                    <div class="action-dropdown-item" onclick="handleAction('sendmail', '${cid}')">
                        <i class="fa-solid fa-paper-plane" style="color:#a5b4fc;"></i> Send Mail
                    </div>
                    <div class="action-dropdown-divider"></div>
                    <div class="action-dropdown-item danger" onclick="handleAction('delete', '${cid}', '${escapeHtml(c.name || '')}')">
                        <i class="fa-solid fa-trash-can" style="color:#f87171;"></i> Delete
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    renderCandidatePagination(total, totalPages, startIdx, pagedCandidates.length);
}

function changeCandidateLimit(newLimit) {
    candidateState.limit = parseInt(newLimit, 10) || 10;
    candidateState.page = 1;
    renderTable();
}

function renderCandidatePagination(total, totalPages, startIdx, pagedCount) {
    const container = document.getElementById('candidate-pagination-container');
    if (!container) return;

    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = paginationBarHTML({
        page: candidateState.page,
        totalPages: totalPages,
        total: total,
        limit: candidateState.limit,
        onPage: 'changeCandidatePage',
        onPageSize: 'changeCandidateLimit',
        pageSizes: [10, 25, 50, 100]
    });
}

function changeCandidatePage(page) {
    candidateState.page = page;
    renderTable();
}

/* ── Contacted Status Toggle ─────────────────────────────── */
async function toggleCandidateReached(cid, reached) {
    try {
        await apiRequest('PUT', `/api/candidates/${cid}/status`, { reached });
        const c = allCandidates.find(x => x.candidate_id === cid);
        if (c) c.reached = reached;
        renderStats();
        showToast(reached ? ' Candidate marked as Contacted' : ' Candidate marked as Not Contacted', 'success');
    } catch (err) {
        showToast('Failed to update status: ' + err.message, 'error');
        loadCandidates(sortByMatch);
    }
}

/* ── Download Resume ─────────────────────────────────────── */
function downloadResume(cid) {
    const link = document.createElement('a');
    link.href = `/api/candidates/${cid}/download`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloading resume…', 'info');
}

function toggleActionMenu(event, cid) {
    event.stopPropagation();
    const targetMenu = document.getElementById(`amenu-${cid}`);
    const isCurrentlyOpen = targetMenu && targetMenu.classList.contains('open');

    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));

    if (targetMenu && !isCurrentlyOpen) {
        targetMenu.classList.add('open');
        if (event && event.currentTarget) {
            const btn = event.currentTarget;
            const rect = btn.getBoundingClientRect();
            const menuHeight = targetMenu.offsetHeight || 150;
            const menuWidth = targetMenu.offsetWidth || 140;
            const spaceBelow = window.innerHeight - rect.bottom;

            targetMenu.style.position = 'fixed';
            targetMenu.style.right = 'auto';
            targetMenu.style.left = `${Math.min(window.innerWidth - menuWidth - 16, Math.max(10, rect.right - menuWidth))}px`;
            targetMenu.style.zIndex = '99999';

            if (spaceBelow < menuHeight + 15 && rect.top > menuHeight + 15) {
                targetMenu.style.top = `${rect.top - menuHeight - 4}px`;
                targetMenu.style.bottom = 'auto';
            } else {
                targetMenu.style.top = `${rect.bottom + 4}px`;
                targetMenu.style.bottom = 'auto';
            }
        }
    }
}

function handleAction(action, cid, name = '') {
    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
    if (action === 'view') openViewModal(cid);
    if (action === 'edit') openEditModal(cid);
    if (action === 'download') downloadResume(cid);
    if (action === 'delete') openDeleteModal(cid, name);
    if (action === 'sendmail') {
        const c = allCandidates.find(x => x.candidate_id === cid);
        if (c) {
            window.location.href = `emails.html?source=candidates&candidate_id=${cid}&to=${encodeURIComponent(c.email || '')}&name=${encodeURIComponent(c.name || '')}`;
        }
    }
}

document.addEventListener('click', () => {
    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
});
window.addEventListener('scroll', () => {
    document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
}, true);

/* ── Relative Time ───────────────────────────────────────── */
function relativeTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const w = Math.floor(d / 7);
    const mo = Math.floor(d / 30);
    const y = Math.floor(d / 365);

    if (s < 60) return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 7) return `${d} day${d !== 1 ? 's' : ''} ago`;
    if (w < 4) return `${w} week${w !== 1 ? 's' : ''} ago`;
    if (mo < 12) return `${mo} month${mo !== 1 ? 's' : ''} ago`;
    return `${y} year${y !== 1 ? 's' : ''} ago`;
}

/* ── View Modal ──────────────────────────────────────────── */
function openViewModal(candidateId) {
    const c = allCandidates.find(x => x.candidate_id === candidateId);
    if (!c) return;

    document.getElementById('vm-avatar').textContent = (c.name || 'U').charAt(0).toUpperCase();
    document.getElementById('vm-name').textContent = c.name || 'Unknown Candidate';
    document.getElementById('vm-sub').textContent =
        `${c.total_experience ? c.total_experience + ' yr experience' : 'Experience N/A'} • ${c.gender || 'Gender N/A'}`;

    document.getElementById('vm-email').textContent = c.email || '—';
    document.getElementById('vm-phone').textContent = c.phone || '—';
    document.getElementById('vm-address').textContent = c.address || '—';
    document.getElementById('vm-gender').textContent = c.gender || '—';
    document.getElementById('vm-exp').textContent = c.total_experience ? c.total_experience + ' years' : '—';
    document.getElementById('vm-qual').textContent = c.qualification || c.education || '—';

    // Applied Job Vacancy
    const jobObj = allJobs.find(j => (j.job_id || j.id) === c.job_id);
    document.getElementById('vm-job').textContent = jobObj ? (jobObj.job_title || jobObj.title) : 'General Vacancy';

    // Match score
    const scoreEl = document.getElementById('vm-score');
    if (scoreEl) {
        scoreEl.innerHTML = `<span class="match-badge ${c.match_percentage >= 70 ? 'match-high' : c.match_percentage >= 40 ? 'match-medium' : 'match-low'}">${c.match_percentage || 0}%</span>`;
    }

    const li = document.getElementById('vm-linkedin');
    const gh = document.getElementById('vm-github');
    li.innerHTML = c.linkedin_url ? `<a href="${escapeHtml(c.linkedin_url)}" target="_blank">${escapeHtml(c.linkedin_url)}</a>` : '—';
    gh.innerHTML = c.github_url ? `<a href="${escapeHtml(c.github_url)}"   target="_blank">${escapeHtml(c.github_url)}</a>` : '—';

    // Skills
    const skillsWrap = document.getElementById('vm-skills');
    const skills = Array.isArray(c.skills) ? c.skills : (c.skills || '').split(',').filter(Boolean);
    skillsWrap.innerHTML = skills.length
        ? skills.map(s => `<span class="skill-chip">${escapeHtml(s.trim())}</span>`).join('')
        : '<span style="color:var(--text-muted);font-size:0.8rem;">No skills extracted</span>';

    // Match explanation & reason
    const matchEl = document.getElementById('vm-match-explain');
    matchEl.innerHTML = c.match_explanation
        ? `<strong style="color:var(--accent);">${c.match_percentage}%</strong><br><span style="margin-top:4px;display:block;color:var(--text-muted);">${escapeHtml(c.match_explanation)}</span>`
        : '—';

    // Download link
    const dlBtn = document.getElementById('vm-download-link');
    if (dlBtn) {
        dlBtn.href = `/api/candidates/${candidateId}/download`;
        dlBtn.download = c.filename || 'resume.pdf';
    }

    // Document preview
    const frame = document.getElementById('vm-preview-frame');
    const txtBox = document.getElementById('vm-resume-text');
    const ext = (c.filename || '').toLowerCase().split('.').pop();

    if (ext === 'pdf') {
        if (frame) {
            frame.src = `/api/candidates/${candidateId}/preview`;
            frame.style.display = 'block';
        }
        if (txtBox) txtBox.style.display = 'none';
    } else {
        if (frame) {
            frame.src = 'about:blank';
            frame.style.display = 'none';
        }
        if (txtBox) {
            txtBox.textContent = c.resume_text?.trim() || 'No text preview available.';
            txtBox.style.display = 'block';
        }
    }

    document.getElementById('view-modal').classList.add('open');
}

/* ── Edit Modal & Smart Save ────────────────────────────── */
function openEditModal(candidateId) {
    const c = allCandidates.find(x => x.candidate_id === candidateId);
    if (!c) return;

    document.getElementById('edit-candidate-id').value = c.candidate_id;
    document.getElementById('edit-name').value = c.name || '';
    document.getElementById('edit-gender').value = c.gender || '';
    document.getElementById('edit-email').value = c.email || '';
    document.getElementById('edit-phone').value = c.phone || '';
    document.getElementById('edit-address').value = c.address || '';
    document.getElementById('edit-experience').value = c.total_experience || '';
    document.getElementById('edit-qualification').value = c.qualification || c.education || '';
    document.getElementById('edit-skills').value = Array.isArray(c.skills)
        ? c.skills.join(', ')
        : (c.skills || '');
    document.getElementById('edit-linkedin').value = c.linkedin_url || '';
    document.getElementById('edit-github').value = c.github_url || '';

    document.getElementById('edit-modal').classList.add('open');
}

async function saveCandidate(e) {
    e.preventDefault();
    const cid = document.getElementById('edit-candidate-id').value;
    const btn = document.getElementById('edit-save-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    const payload = {
        name: document.getElementById('edit-name').value.trim() || null,
        gender: document.getElementById('edit-gender').value || null,
        email: document.getElementById('edit-email').value.trim() || null,
        phone: document.getElementById('edit-phone').value.trim() || null,
        address: document.getElementById('edit-address').value.trim() || null,
        total_experience: document.getElementById('edit-experience').value.trim() || null,
        qualification: document.getElementById('edit-qualification').value.trim() || null,
        skills: document.getElementById('edit-skills').value.trim() || null,
        linkedin_url: document.getElementById('edit-linkedin').value.trim() || null,
        github_url: document.getElementById('edit-github').value.trim() || null,
    };

    try {
        await apiRequest('PUT', `/api/candidates/${cid}`, payload);
        showToast('Candidate updated successfully', 'success');
        closeModal('edit-modal');
        await loadCandidates(sortByMatch);
    } catch (err) {
        showToast('Failed to update', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
    }
}

/* ── Delete Modal & Ranking Update ──────────────────────── */
function openDeleteModal(candidateId, name) {
    document.getElementById('del-candidate-id').value = candidateId;
    document.getElementById('del-name').textContent = name || 'this candidate';
    document.getElementById('delete-modal').classList.add('open');
}

async function confirmDelete() {
    const cid = document.getElementById('del-candidate-id').value;
    try {
        await apiRequest('DELETE', `/api/candidates/${cid}`);
        showToast('Candidate deleted and rankings updated.', 'success');
        closeModal('delete-modal');
        await loadCandidates(sortByMatch);
    } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
    }
}

/* ── Helpers ─────────────────────────────────────────────── */
function showSkeleton(show) {
    const sk = document.getElementById('table-skeleton');
    const wrap = document.getElementById('table-wrap');
    const emp = document.getElementById('table-empty');
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

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function (e) {
        if (e.target === this) this.classList.remove('open');
    });
});
