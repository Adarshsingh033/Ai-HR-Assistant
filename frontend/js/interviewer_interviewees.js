/* ========================================================
   interviewer_interviewees.js – My Interviewees List & Pull Logic
   ======================================================== */

let allAssignments = [];
let pullableCandidates = [];
let selectedPullItems = new Set();
let invState = { page: 1, limit: 10 };
let searchDebounce = null;
let pullSearchDebounce = null;

window.addEventListener('DOMContentLoaded', async () => {
    // Auth check happens in interviewer_common.js
    await loadAssignments();
});

/* ── Load Assignments ───────────────────────────────────── */
async function loadAssignments() {
    showSkeleton(true);

    try {
        const url = `/api/interviewer/my-interviewees?page=1&limit=1000`;
        const data = await apiRequest('GET', url);
        
        allAssignments = (data && data.assignments) ? data.assignments : [];
        renderTable();
    } catch (e) {
        showToast('Failed to load interview assignments: ' + e.message, 'error');
    } finally {
        showSkeleton(false);
    }
}

function onSearchInput() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        invState.page = 1;
        renderTable();
    }, 250);
}

function renderTable() {
    const tbody = document.getElementById('inv-tbody');
    const empty = document.getElementById('inv-empty');
    const wrap = document.getElementById('inv-table-wrap');

    if (!tbody) return;

    const query = document.getElementById('inv-search')?.value?.trim().toLowerCase() || '';

    let filtered = allAssignments;
    if (query) {
        filtered = allAssignments.filter(a => 
            (a.candidate_name && a.candidate_name.toLowerCase().includes(query)) ||
            (a.candidate_email && a.candidate_email.toLowerCase().includes(query)) ||
            (a.job_title && a.job_title.toLowerCase().includes(query)) ||
            (a.round_step && a.round_step.toLowerCase().includes(query))
        );
    }

    const total = filtered.length;

    if (total === 0) {
        if (empty) empty.style.display = 'flex';
        if (wrap) wrap.style.display = 'none';
        renderPagination(0, 1, 0, 0);
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap) wrap.style.display = 'block';

    const totalPages = Math.ceil(total / invState.limit) || 1;
    if (invState.page > totalPages) invState.page = totalPages;
    if (invState.page < 1) invState.page = 1;

    const startIdx = (invState.page - 1) * invState.limit;
    const paged = filtered.slice(startIdx, startIdx + invState.limit);

    tbody.innerHTML = paged.map(a => {
        const initial = (a.candidate_name || 'U').charAt(0).toUpperCase();

        return `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#4f46e5);display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:800;color:#fff;flex-shrink:0;">
                        ${initial}
                    </div>
                    <div>
                        <div style="font-weight:700; color:var(--text-bright); font-size:0.92rem;">${escapeHtml(a.candidate_name)}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(a.candidate_email)}</div>
                    </div>
                </div>
            </td>
            <td>
                <span style="display:inline-block;padding:4px 12px;border-radius:99px;background:rgba(249,115,22,0.12);color:#fb923c;border:1px solid rgba(249,115,22,0.25);font-size:0.78rem;font-weight:700;">
                    <i class="fa-solid fa-briefcase" style="margin-right:4px;"></i> ${escapeHtml(a.job_title)}
                </span>
            </td>
            <td>
                <span class="round-badge"><i class="fa-solid fa-diagram-next" style="margin-right:4px;"></i> ${escapeHtml(a.round_step)}</span>
            </td>
            <td>
                <span class="score-badge"><i class="fa-solid fa-bolt" style="margin-right:4px;"></i>${a.ats_score}% Match</span>
            </td>
            <td style="text-align:right;">
                <a href="interview.html?id=${a.assignment_id}" class="btn-sm btn-primary-sm">
                    <i class="fa-solid fa-play" style="font-size:0.75rem;"></i> Start
                </a>
            </td>
        </tr>`;
    }).join('');

    renderPagination(total, totalPages, startIdx, paged.length);
}

function changeLimit(newLimit) {
    invState.limit = parseInt(newLimit, 10) || 10;
    invState.page = 1;
    renderTable();
}

function changePage(page) {
    invState.page = page;
    renderTable();
}

window.changePage = changePage;
window.changeLimit = changeLimit;

function renderPagination(total, totalPages, startIdx, pagedCount) {
    const container = document.getElementById('inv-pagination');
    if (!container) return;

    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = paginationBarHTML({
        page: invState.page,
        totalPages: totalPages || 1,
        total: total,
        limit: invState.limit,
        onPage: 'changePage',
        onPageSize: 'changeLimit',
        pageSizes: [10, 25, 50]
    });
}

function showSkeleton(show) {
    const sk = document.getElementById('inv-skeleton');
    const wrap = document.getElementById('inv-table-wrap');
    const emp = document.getElementById('inv-empty');
    if (show) {
        if (sk) sk.style.display = 'block';
        if (wrap) wrap.style.display = 'none';
        if (emp) emp.style.display = 'none';
    } else {
        if (sk) sk.style.display = 'none';
    }
}

/* ── Pull Candidates Flow ────────────────────────────────── */

function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function (e) {
        if (e.target === this) this.classList.remove('open');
    });
});

async function openPullModal() {
    selectedPullItems.clear();
    document.getElementById('pull-search').value = '';
    const selectAll = document.getElementById('pull-select-all');
    if (selectAll) selectAll.checked = false;
    updatePullSelectionUI();

    openModal('pull-modal');
    await loadPullableCandidates();
}

function closePullModal() {
    closeModal('pull-modal');
}

async function loadPullableCandidates() {
    showPullSkeleton(true);

    try {
        const query = document.getElementById('pull-search')?.value?.trim() || '';
        let url = '/api/interviewer/pullable-candidates';
        if (query) url += `?search=${encodeURIComponent(query)}`;

        const data = await apiRequest('GET', url);
        pullableCandidates = (data && data.candidates) ? data.candidates : [];
        renderPullTable();
    } catch (e) {
        showToast('Failed to load ongoing candidates: ' + e.message, 'error');
    } finally {
        showPullSkeleton(false);
    }
}

function onPullSearchInput() {
    clearTimeout(pullSearchDebounce);
    pullSearchDebounce = setTimeout(() => loadPullableCandidates(), 300);
}

function renderPullTable() {
    const tbody = document.getElementById('pull-tbody');
    const empty = document.getElementById('pull-empty');
    const wrap = document.getElementById('pull-table-wrap');

    if (!tbody) return;

    if (pullableCandidates.length === 0) {
        if (empty) empty.style.display = 'flex';
        if (wrap) wrap.style.display = 'none';
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap) wrap.style.display = 'block';

    tbody.innerHTML = pullableCandidates.map(c => {
        const itemKey = `${c.candidate_id}_${c.round_id}`;
        const isChecked = selectedPullItems.has(itemKey);

        const initial = (c.candidate_name || 'U').charAt(0).toUpperCase();

        return `
        <tr>
            <td style="text-align:center;">
                <input type="checkbox" class="pull-chk" data-key="${itemKey}" data-cid="${c.candidate_id}" data-rid="${c.round_id}" data-jid="${c.job_id}" ${isChecked ? 'checked' : ''} onchange="onPullCheckChange(this)" style="cursor:pointer;" />
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#4f46e5);display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:800;color:#fff;flex-shrink:0;">
                        ${initial}
                    </div>
                    <div>
                        <div style="font-weight:700; color:var(--text-bright); font-size:0.92rem;">${escapeHtml(c.candidate_name)}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(c.candidate_email)}</div>
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    updatePullSelectionUI();
}

function onPullCheckChange(chk) {
    const key = chk.dataset.key;
    if (chk.checked) {
        selectedPullItems.add(key);
    } else {
        selectedPullItems.delete(key);
    }
    updatePullSelectionUI();
}

function toggleSelectAllPull(checked) {
    const checkboxes = document.querySelectorAll('.pull-chk');
    checkboxes.forEach(chk => {
        chk.checked = checked;
        const key = chk.dataset.key;
        if (checked) {
            selectedPullItems.add(key);
        } else {
            selectedPullItems.delete(key);
        }
    });
    updatePullSelectionUI();
}

function updatePullSelectionUI() {
    const countEl = document.getElementById('pull-selected-count');
    const submitBtn = document.getElementById('btn-submit-pull');
    const count = selectedPullItems.size;

    if (countEl) {
        countEl.textContent = `${count} candidate${count !== 1 ? 's' : ''} selected`;
    }

    if (submitBtn) {
        if (count > 0) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
        } else {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
        }
    }
}

async function submitPullCandidates() {
    if (selectedPullItems.size === 0) return;

    const itemsToPull = [];
    document.querySelectorAll('.pull-chk:checked').forEach(chk => {
        itemsToPull.push({
            candidate_id: chk.dataset.cid,
            round_id: chk.dataset.rid,
            job_id: chk.dataset.jid
        });
    });

    if (itemsToPull.length === 0) return;

    const btn = document.getElementById('btn-submit-pull');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pulling...';

    try {
        const res = await apiRequest('POST', '/api/interviewer/pull-candidates', { items: itemsToPull });
        showToast(res.message || `Successfully pulled ${res.pulled_count || itemsToPull.length} candidate(s)!`, 'success');
        closePullModal();
        await loadAssignments();
    } catch (err) {
        showToast('Failed to pull candidates: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function showPullSkeleton(show) {
    const sk = document.getElementById('pull-skeleton');
    const wrap = document.getElementById('pull-table-wrap');
    const emp = document.getElementById('pull-empty');
    if (show) {
        if (sk) sk.style.display = 'block';
        if (wrap) wrap.style.display = 'none';
        if (emp) emp.style.display = 'none';
    } else {
        if (sk) sk.style.display = 'none';
    }
}
