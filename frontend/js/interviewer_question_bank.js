/**
 * interviewer_question_bank.js
 * Handles all Question Bank UI interactions: load, add, edit, delete, filter.
 */

'use strict';

let allQuestions = [];
let currentDiffFilter = '';
let currentCatFilter  = '';
let deleteTargetId = null;

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    await loadQuestions();
});

// ── Fetch Questions ───────────────────────────────────────────────────────────

async function loadQuestions() {
    showSkeleton(true);
    try {
        const data = await apiRequest('GET', '/api/interviewer/question-bank');
        allQuestions = data.questions || [];
        updateStats();
        applyFilters();
    } catch (e) {
        showToast('Failed to load questions: ' + e.message, 'error');
        showSkeleton(false);
    }
}

function updateStats() {
    const total  = allQuestions.length;
    const easy   = allQuestions.filter(q => q.difficulty === 'Easy').length;
    const medium = allQuestions.filter(q => q.difficulty === 'Medium').length;
    const hard   = allQuestions.filter(q => q.difficulty === 'Hard').length;

    setText('stat-total',  total);
    setText('stat-easy',   easy);
    setText('stat-medium', medium);
    setText('stat-hard',   hard);

    // Populate category filter dropdown
    const catSelect = document.getElementById('category-filter');
    if (catSelect) {
        const cats = [...new Set(
            allQuestions.map(q => q.category).filter(c => c && c.trim())
        )].sort();
        const current = catSelect.value;
        catSelect.innerHTML = '<option value="">All Categories</option>' +
            cats.map(c => `<option value="${escapeHtml(c)}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Filter ────────────────────────────────────────────────────────────────────

function setDiffFilter(btn, diff) {
    currentDiffFilter = diff;
    document.querySelectorAll('.diff-filter-btn').forEach(b => {
        b.className = 'diff-filter-btn';
        if (b === btn) {
            if (!diff)              b.classList.add('active-all');
            else if (diff === 'Easy')   b.classList.add('active-easy');
            else if (diff === 'Medium') b.classList.add('active-medium');
            else if (diff === 'Hard')   b.classList.add('active-hard');
        }
    });
    applyFilters();
}

function applyFilters() {
    const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    currentCatFilter = (document.getElementById('category-filter')?.value || '').trim();

    let filtered = allQuestions;
    if (currentDiffFilter) {
        filtered = filtered.filter(q => q.difficulty === currentDiffFilter);
    }
    if (currentCatFilter) {
        filtered = filtered.filter(q => (q.category || '') === currentCatFilter);
    }
    if (searchVal) {
        filtered = filtered.filter(q =>
            q.question.toLowerCase().includes(searchVal) ||
            (q.category || '').toLowerCase().includes(searchVal)
        );
    }
    renderList(filtered);
}

// ── Render ────────────────────────────────────────────────────────────────────

function showSkeleton(show) {
    document.getElementById('questions-skeleton').style.display = show ? 'flex' : 'none';
    document.getElementById('questions-grid').style.display     = 'none';
    document.getElementById('questions-empty').style.display    = 'none';
}

function renderList(questions) {
    document.getElementById('questions-skeleton').style.display = 'none';

    const wrap  = document.getElementById('questions-grid');
    const empty = document.getElementById('questions-empty');

    if (questions.length === 0) {
        wrap.style.display  = 'none';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';
    wrap.style.display  = 'flex';

    wrap.innerHTML = questions.map((q, i) => {
        const diffClass = q.difficulty.toLowerCase();
        const diffIcon  = diffClass === 'easy' ? 'fa-leaf' : diffClass === 'medium' ? 'fa-bolt' : 'fa-fire';
        const date = q.created_at
            ? new Date(q.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : '';

        return `
        <div class="q-card ${diffClass}" id="qcard-${q.id}">
            <!-- Row number -->
            <div class="q-num">${i + 1}</div>

            <!-- Question content -->
            <div class="q-body">
                <div class="q-meta">
                    <span class="diff-badge diff-${diffClass}">
                        <i class="fa-solid ${diffIcon}"></i> ${escapeHtml(q.difficulty)}
                    </span>
                    ${q.category
                        ? `<span class="q-category-badge"><i class="fa-solid fa-tag" style="font-size:0.65rem;"></i>${escapeHtml(q.category)}</span>`
                        : ''}
                </div>
                <div class="q-text">${escapeHtml(q.question)}</div>
            </div>

            <!-- Actions: three-dot kebab -->
            <div class="q-kebab-wrap">
                <button class="q-kebab-btn" title="More options" onclick="toggleQMenu(event, 'qmenu-${q.id}')">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                <div class="q-dropdown" id="qmenu-${q.id}">
                    <button class="q-drop-item" onclick="closeAllQMenus(); openEditModal('${q.id}')">
                        <i class="fa-solid fa-pen" style="color:#a5b4fc;"></i> Edit
                    </button>
                    <button class="q-drop-item danger" onclick="closeAllQMenus(); openDeleteModal('${q.id}')">
                        <i class="fa-solid fa-trash-can" style="color:#f87171;"></i> Delete
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Add Modal ─────────────────────────────────────────────────────────────────

function openAddModal() {
    document.getElementById('edit-q-id').value      = '';
    document.getElementById('question-input').value = '';
    document.getElementById('category-input').value = '';
    document.getElementById('modal-title-text').textContent = 'Add New Question';
    selectDiff('Easy');
    document.getElementById('question-modal').classList.add('open');
    setTimeout(() => document.getElementById('question-input').focus(), 100);
}

function openEditModal(qId) {
    const q = allQuestions.find(x => x.id === qId);
    if (!q) return;

    document.getElementById('edit-q-id').value      = qId;
    document.getElementById('question-input').value = q.question;
    document.getElementById('category-input').value = q.category || '';
    document.getElementById('modal-title-text').textContent = 'Edit Question';
    selectDiff(q.difficulty);
    document.getElementById('question-modal').classList.add('open');
    setTimeout(() => document.getElementById('question-input').focus(), 100);
}

function closeModal() {
    document.getElementById('question-modal').classList.remove('open');
}

// ── Difficulty Selector ───────────────────────────────────────────────────────

function selectDiff(diff) {
    ['Easy', 'Medium', 'Hard'].forEach(d => {
        const el = document.getElementById(`diff-${d.toLowerCase()}`);
        if (el) el.classList.toggle('selected', d === diff);
    });
    document.getElementById('selected-difficulty').value = diff;
}

// ── Save (Create or Update) ───────────────────────────────────────────────────

async function saveQuestion() {
    const qText    = (document.getElementById('question-input').value || '').trim();
    const category = (document.getElementById('category-input').value || '').trim();
    const diff     = document.getElementById('selected-difficulty').value;
    const editId   = document.getElementById('edit-q-id').value;

    if (!qText) {
        showToast('Please write a question.', 'error');
        document.getElementById('question-input').focus();
        return;
    }

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        const payload = { question: qText, difficulty: diff, category: category || null };

        if (editId) {
            await apiRequest('PUT', `/api/interviewer/question-bank/${editId}`, payload);
            showToast('Question updated successfully!', 'success');
        } else {
            await apiRequest('POST', '/api/interviewer/question-bank', payload);
            showToast('Question added to your bank!', 'success');
        }

        closeModal();
        await loadQuestions();
    } catch (e) {
        showToast('Failed to save: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Question';
    }
}

// ── Delete ────────────────────────────────────────────────────────────────────

function openDeleteModal(qId) {
    deleteTargetId = qId;
    document.getElementById('delete-modal').classList.add('open');
}

function closeDeleteModal() {
    deleteTargetId = null;
    document.getElementById('delete-modal').classList.remove('open');
}

async function confirmDelete() {
    if (!deleteTargetId) return;

    const btn = document.getElementById('confirm-delete-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    try {
        await apiRequest('DELETE', `/api/interviewer/question-bank/${deleteTargetId}`);
        showToast('Question deleted successfully.', 'success');
        closeDeleteModal();
        await loadQuestions();
    } catch (e) {
        showToast('Failed to delete: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}

// ── Kebab Menu ─────────────────────────────────────────────────────────────────

function toggleQMenu(event, menuId) {
    event.stopPropagation();
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    closeAllQMenus();
    if (!isOpen) menu.classList.add('open');
}

function closeAllQMenus() {
    document.querySelectorAll('.q-dropdown.open').forEach(m => m.classList.remove('open'));
}

document.addEventListener('click', closeAllQMenus);
