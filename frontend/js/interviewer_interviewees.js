/* ========================================================
   interviewer_interviewees.js – My Interviewees List
   ======================================================== */

let allAssignments = [];
let invState = { page: 1, limit: 10 };

window.addEventListener('DOMContentLoaded', async () => {
    // Auth check happens in interviewer_common.js
    await loadAssignments();
});

async function loadAssignments() {
    showSkeleton(true);

    try {
        const url = `/api/interviewer/my-interviewees?page=${invState.page}&limit=${invState.limit}`;
        const data = await apiRequest('GET', url);
        
        allAssignments = (data && data.assignments) ? data.assignments : [];
        renderTable(data.total || allAssignments.length, data.total_pages || 1);
    } catch (e) {
        showToast('Failed to load interview assignments: ' + e.message, 'error');
    } finally {
        showSkeleton(false);
    }
}

function renderTable(total, totalPages) {
    const tbody = document.getElementById('inv-tbody');
    const empty = document.getElementById('inv-empty');
    const wrap = document.getElementById('inv-table-wrap');

    if (!tbody) return;

    if (allAssignments.length === 0) {
        if (empty) empty.style.display = 'flex';
        if (wrap) wrap.style.display = 'none';
        renderPagination(0, 1, 0, 0);
        return;
    }

    if (empty) empty.style.display = 'none';
    if (wrap) wrap.style.display = 'block';

    const startIdx = (invState.page - 1) * invState.limit;

    tbody.innerHTML = allAssignments.map(a => {
        return `
        <tr>
            <td>
                <div style="font-weight:700; color:#fff; font-size:0.95rem;">${escapeHtml(a.candidate_name)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(a.candidate_email)}</div>
            </td>
            <td>
                <div style="font-weight:600; color:#e2e8f0;">${escapeHtml(a.job_title)}</div>
            </td>
            <td>
                <span class="round-badge">${escapeHtml(a.round_step)}</span>
            </td>
            <td>
                <span class="score-badge"><i class="fa-solid fa-bolt" style="margin-right:4px;"></i>${a.ats_score}% Match</span>
            </td>
            <td style="text-align:right;">
                <a href="interview.html?id=${a.assignment_id}" class="btn-primary-sm">
                    Evaluate <i class="fa-solid fa-arrow-right" style="margin-left:4px;"></i>
                </a>
            </td>
        </tr>`;
    }).join('');

    renderPagination(total, totalPages, startIdx, allAssignments.length);
}

function changeLimit(newLimit) {
    invState.limit = parseInt(newLimit, 10) || 10;
    invState.page = 1;
    loadAssignments();
}

function changePage(page) {
    invState.page = page;
    loadAssignments();
}

function renderPagination(total, totalPages, startIdx, pagedCount) {
    const container = document.getElementById('inv-pagination');
    if (!container) return;

    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    const startItem = total === 0 ? 0 : startIdx + 1;
    const endItem = startIdx + pagedCount;
    const currentPage = invState.page;

    let pageBtns = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        pageBtns += `<button onclick="changePage(1)" class="page-btn">1</button>`;
        if (startPage > 2) pageBtns += `<span class="page-dots">…</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        if (p === currentPage) {
            pageBtns += `<button class="page-btn active">${p}</button>`;
        } else {
            pageBtns += `<button onclick="changePage(${p})" class="page-btn">${p}</button>`;
        }
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pageBtns += `<span class="page-dots">…</span>`;
        pageBtns += `<button onclick="changePage(${totalPages})" class="page-btn">${totalPages}</button>`;
    }

    container.innerHTML = `
        <div class="pagination-wrap">
            <div class="pagination-info">
                <span>${startItem}–${endItem} of ${total} <span class="dot">·</span> Page ${currentPage} of ${totalPages}</span>
                <div class="limit-select">
                    <span>Rows:</span>
                    <select onchange="changeLimit(this.value)">
                        <option value="10" ${invState.limit === 10 ? 'selected' : ''}>10</option>
                        <option value="25" ${invState.limit === 25 ? 'selected' : ''}>25</option>
                        <option value="50" ${invState.limit === 50 ? 'selected' : ''}>50</option>
                    </select>
                </div>
            </div>
            <div class="pagination-controls">
                <button onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} class="page-nav" title="Previous page">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                ${pageBtns}
                <button onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} class="page-nav" title="Next page">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
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
