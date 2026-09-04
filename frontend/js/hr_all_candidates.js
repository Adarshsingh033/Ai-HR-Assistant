/* ========================================================
   hr_all_candidates.js – Candidates List Module
   ======================================================== */

let allCandidates = [];
let allJobs = [];
let currentOrgId = null;
let currentHrId  = null;
let sortByMatch  = false;

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

    // Pre-select job from URL param (e.g. linked from jobs.html)
    const params  = new URLSearchParams(window.location.search);
    const jobParam = params.get('job_id');

    await Promise.all([loadJobs(jobParam), loadCandidates()]);
});

/* ── Load Job list for filter ──────────────────────────── */
async function loadJobs(preselect = null) {
    try {
        const data = await apiRequest('GET', `/api/jobs?organization_id=${currentOrgId}`);
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
        const jobId    = document.getElementById('filter-job')?.value || '';
        const location = document.getElementById('filter-location')?.value?.trim() || '';
        const search   = document.getElementById('filter-search')?.value?.trim() || '';

        let url = `/api/candidates?org_id=${currentOrgId}`;
        if (jobId)    url += `&job_id=${encodeURIComponent(jobId)}`;
        if (location) url += `&location=${encodeURIComponent(location)}`;
        if (search)   url += `&search=${encodeURIComponent(search)}`;
        if (byMatch)  url += `&sort_by_match=true`;

        const data = await apiRequest('GET', url);
        allCandidates = (data && data.candidates) ? data.candidates : [];

        renderStats();
        renderTable();
    } catch (e) {
        showToast('Failed to load candidates: ' + e.message, 'error');
    } finally {
        showSkeleton(false);
    }
}

function applyFilters() {
    // Debounce inline
    clearTimeout(applyFilters._t);
    applyFilters._t = setTimeout(() => loadCandidates(sortByMatch), 350);
}

function resetFilters() {
    document.getElementById('filter-job').value = '';
    document.getElementById('filter-location').value = '';
    document.getElementById('filter-search').value = '';
    loadCandidates(false);
}

/* ── Stats ──────────────────────────────────────────────── */
function renderStats() {
    const total   = allCandidates.length;
    const now     = new Date();
    const month   = allCandidates.filter(c => {
        const d = new Date(c.created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const avg     = total > 0
        ? Math.round(allCandidates.reduce((s, c) => s + (c.match_percentage || 0), 0) / total)
        : 0;
    const reached = allCandidates.filter(c => c.reached).length;

    document.getElementById('stat-total').textContent   = total;
    document.getElementById('stat-month').textContent   = month;
    document.getElementById('stat-avg').textContent     = avg + '%';
    document.getElementById('stat-reached').textContent = reached;
}

/* ── Table Render ────────────────────────────────────────── */
function renderTable() {
    const tbody  = document.getElementById('candidates-tbody');
    const empty  = document.getElementById('table-empty');
    const wrap   = document.getElementById('table-wrap');
    const count  = document.getElementById('table-count');

    if (!tbody) return;

    if (allCandidates.length === 0) {
        if (empty) empty.style.display = 'block';
        if (wrap)  wrap.style.display  = 'none';
        if (count) count.textContent   = '0 candidates';
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap)  wrap.style.display  = 'block';
    if (count) count.textContent   = `${allCandidates.length} candidate${allCandidates.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = allCandidates.map((c, i) => {
        const pct       = c.match_percentage || 0;
        const matchCls  = pct >= 70 ? 'match-high' : pct >= 40 ? 'match-medium' : 'match-low';
        const initial   = (c.name || 'U').charAt(0).toUpperCase();
        const location  = c.address || '—';
        const exp       = c.total_experience
            ? (String(c.total_experience).includes('yr') || String(c.total_experience).includes('year')
                ? c.total_experience
                : c.total_experience + ' yr')
            : '—';
        const added = relativeTime(c.created_at);
        const cid   = c.candidate_id;

        return `
        <tr>
            <td style="color:rgba(255,255,255,0.3);font-weight:600;">${i + 1}</td>
            <td>
                <div class="cand-name-cell">
                    <div class="cand-avatar">${initial}</div>
                    <div>
                        <div class="cand-name">${escapeHtml(c.name || 'Unknown')}</div>
                        <div class="cand-file">${escapeHtml(c.filename || '')}</div>
                    </div>
                </div>
            </td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(c.email)}">
                ${escapeHtml(c.email || '—')}
            </td>
            <td>${escapeHtml(c.phone || '—')}</td>
            <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(location)}">
                ${escapeHtml(location)}
            </td>
            <td>${escapeHtml(exp)}</td>
            <td>
                <span class="match-badge ${matchCls}">${pct}%</span>
            </td>
            <td style="white-space:nowrap;color:rgba(255,255,255,0.45);font-size:0.78rem;">${added}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn view" title="View Candidate" onclick="openViewModal('${cid}')">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button class="action-btn edit" title="Edit Candidate" onclick="openEditModal('${cid}')">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="action-btn del" title="Delete Candidate" onclick="openDeleteModal('${cid}', '${escapeHtml(c.name || '')}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

/* ── Relative Time ───────────────────────────────────────── */
function relativeTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const s  = Math.floor(diff / 1000);
    const m  = Math.floor(s / 60);
    const h  = Math.floor(m / 60);
    const d  = Math.floor(h / 24);
    const w  = Math.floor(d / 7);
    const mo = Math.floor(d / 30);
    const y  = Math.floor(d / 365);

    if (s < 60)   return 'Just now';
    if (m < 60)   return `${m}m ago`;
    if (h < 24)   return `${h}h ago`;
    if (d < 7)    return `${d} day${d !== 1 ? 's' : ''} ago`;
    if (w < 4)    return `${w} week${w !== 1 ? 's' : ''} ago`;
    if (mo < 12)  return `${mo} month${mo !== 1 ? 's' : ''} ago`;
    return `${y} year${y !== 1 ? 's' : ''} ago`;
}

/* ── View Modal ──────────────────────────────────────────── */
function openViewModal(candidateId) {
    const c = allCandidates.find(x => x.candidate_id === candidateId);
    if (!c) return;

    document.getElementById('vm-avatar').textContent = (c.name || 'U').charAt(0).toUpperCase();
    document.getElementById('vm-name').textContent   = c.name || 'Unknown Candidate';
    document.getElementById('vm-sub').textContent    =
        `${c.total_experience ? c.total_experience + ' yr experience' : 'Experience N/A'} • ${c.gender || 'Gender N/A'}`;

    document.getElementById('vm-email').textContent   = c.email   || '—';
    document.getElementById('vm-phone').textContent   = c.phone   || '—';
    document.getElementById('vm-address').textContent = c.address || '—';
    document.getElementById('vm-gender').textContent  = c.gender  || '—';
    document.getElementById('vm-exp').textContent     = c.total_experience ? c.total_experience + ' years' : '—';
    document.getElementById('vm-edu').textContent     = c.education || '—';

    const li = document.getElementById('vm-linkedin');
    const gh = document.getElementById('vm-github');
    li.innerHTML = c.linkedin_url ? `<a href="${escapeHtml(c.linkedin_url)}" target="_blank">${escapeHtml(c.linkedin_url)}</a>` : '—';
    gh.innerHTML = c.github_url   ? `<a href="${escapeHtml(c.github_url)}"   target="_blank">${escapeHtml(c.github_url)}</a>`   : '—';

    // Skills
    const skillsWrap = document.getElementById('vm-skills');
    const skills = Array.isArray(c.skills) ? c.skills : (c.skills || '').split(',').filter(Boolean);
    skillsWrap.innerHTML = skills.length
        ? skills.map(s => `<span class="skill-chip">${escapeHtml(s.trim())}</span>`).join('')
        : '<span style="color:rgba(255,255,255,0.3);font-size:0.8rem;">No skills extracted</span>';

    // Match explanation
    const matchEl = document.getElementById('vm-match-explain');
    matchEl.innerHTML = c.match_explanation
        ? `<strong style="color:#a5b4fc;">${c.match_percentage}% Match</strong> — ${escapeHtml(c.match_explanation)}`
        : '—';

    // Resume text
    document.getElementById('vm-resume-text').textContent =
        c.resume_text?.trim() || 'No resume text available.';

    document.getElementById('view-modal').classList.add('open');
}

/* ── Edit Modal ──────────────────────────────────────────── */
function openEditModal(candidateId) {
    const c = allCandidates.find(x => x.candidate_id === candidateId);
    if (!c) return;

    document.getElementById('edit-candidate-id').value   = c.candidate_id;
    document.getElementById('edit-name').value           = c.name || '';
    document.getElementById('edit-gender').value         = c.gender || '';
    document.getElementById('edit-email').value          = c.email || '';
    document.getElementById('edit-phone').value          = c.phone || '';
    document.getElementById('edit-address').value        = c.address || '';
    document.getElementById('edit-experience').value     = c.total_experience || '';
    document.getElementById('edit-qualification').value  = c.qualification || '';
    document.getElementById('edit-skills').value         = Array.isArray(c.skills)
        ? c.skills.join(', ')
        : (c.skills || '');
    document.getElementById('edit-education').value      = c.education || '';
    document.getElementById('edit-linkedin').value       = c.linkedin_url || '';
    document.getElementById('edit-github').value         = c.github_url || '';

    document.getElementById('edit-modal').classList.add('open');
}

async function saveCandidate(e) {
    e.preventDefault();
    const cid  = document.getElementById('edit-candidate-id').value;
    const btn  = document.getElementById('edit-save-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    const payload = {
        name:             document.getElementById('edit-name').value.trim() || null,
        gender:           document.getElementById('edit-gender').value || null,
        email:            document.getElementById('edit-email').value.trim() || null,
        phone:            document.getElementById('edit-phone').value.trim() || null,
        address:          document.getElementById('edit-address').value.trim() || null,
        total_experience: document.getElementById('edit-experience').value.trim() || null,
        qualification:    document.getElementById('edit-qualification').value.trim() || null,
        skills:           document.getElementById('edit-skills').value.trim() || null,
        education:        document.getElementById('edit-education').value.trim() || null,
        linkedin_url:     document.getElementById('edit-linkedin').value.trim() || null,
        github_url:       document.getElementById('edit-github').value.trim() || null,
    };

    try {
        await apiRequest('PUT', `/api/candidates/${cid}`, payload);
        showToast('Candidate updated successfully!', 'success');
        closeModal('edit-modal');
        await loadCandidates(sortByMatch);
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
    }
}

/* ── Delete Modal ────────────────────────────────────────── */
function openDeleteModal(candidateId, name) {
    document.getElementById('del-candidate-id').value = candidateId;
    document.getElementById('del-name').textContent   = name || 'this candidate';
    document.getElementById('delete-modal').classList.add('open');
}

async function confirmDelete() {
    const cid = document.getElementById('del-candidate-id').value;
    try {
        await apiRequest('DELETE', `/api/candidates/${cid}`);
        showToast('Candidate deleted.', 'success');
        closeModal('delete-modal');
        await loadCandidates(sortByMatch);
    } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
    }
}

/* ── Helpers ─────────────────────────────────────────────── */
function showSkeleton(show) {
    const sk   = document.getElementById('table-skeleton');
    const wrap = document.getElementById('table-wrap');
    const emp  = document.getElementById('table-empty');
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

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
    });
});
