/* ================================================================
   hr_upload.js – Resume Upload Module
   Background-safe processing via localStorage session.
   ================================================================ */

const SESSION_KEY = 'hr_upload_session';
const ALLOWED_EXTS = ['pdf', 'docx', 'doc', 'txt'];
const MAX_FILES = 10;
const MAX_SIZE_MB = 10;

/* ── In-memory state ── */
let selectedJob = null;
let allJobs = [];
let filteredJobs = [];
let jobFilter = 'active';
let fileQueue = [];      // [{ file, status, result, rejectionReason }]
let uploadSession = null;    // persisted to localStorage
let currentOrgId = null;
let currentHrId = null;
let isProcessing = false;

/* ── Init ──────────────────────────────────────────────────────── */
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
    setupDropZone();

    // Restore any in-progress session
    restoreSession();
});

/* ── Job Loading ───────────────────────────────────────────────── */
async function loadJobs() {
    try {
        const data = await apiRequest('GET', `/api/jobs?organization_id=${currentOrgId}`);
        allJobs = (data && data.jobs) ? data.jobs : [];
        filterJobs('');

        // Pre-select from URL param
        const jobId = new URLSearchParams(window.location.search).get('job_id');
        if (jobId) {
            const j = allJobs.find(x => (x.job_id || x.id) === jobId);
            if (j) selectJob(j);
        }
    } catch (e) {
        document.getElementById('job-list').innerHTML =
            '<div class="no-jobs-msg"><i class="fa-solid fa-triangle-exclamation"></i><br>Failed to load vacancies.</div>';
    }
}

function filterJobs(q) {
    const query = (q || '').toLowerCase();
    filteredJobs = allJobs.filter(j => {
        const title = (j.job_title || j.title || '').toLowerCase();
        const dept = (j.department || '').toLowerCase();
        const status = (j.status || 'draft').toLowerCase();
        const matchQ = !query || title.includes(query) || dept.includes(query);
        const isActive = status === 'active';
        return matchQ && isActive;
    });
    renderJobList();
}

function renderJobList() {
    const list = document.getElementById('job-list');
    if (!list) return;

    if (filteredJobs.length === 0) {
        list.innerHTML = '<div class="no-jobs-msg"><i class="fa-solid fa-folder-open"></i><br>No vacancies found.</div>';
        return;
    }

    list.innerHTML = filteredJobs.map(j => {
        const jid = j.job_id || j.id;
        const title = escapeHtml(j.job_title || j.title || 'Untitled');
        const dept = escapeHtml(j.department || 'General');
        const status = (j.status || 'draft').toLowerCase();
        const sel = selectedJob && (selectedJob.job_id || selectedJob.id) === jid;
        const statusColor = status === 'active' ? '#34d399' : (status === 'draft' ? '#fbbf24' : '#9ca3af');

        return `
        <div class="job-item ${sel ? 'selected' : ''}" id="ji-${jid}" onclick="selectJobById('${jid}')">
            <div class="job-item-title" title="${title}">${title}</div>
            <div class="job-item-meta">
                <div class="status-dot ${status}"></div>
                <span class="job-item-dept">${dept}</span>
                <span style="margin-left:auto;font-size:0.78rem;font-weight:700;color:${statusColor};">${status}</span>
            </div>
        </div>`;
    }).join('');
}

function selectJobById(jid) {
    const j = allJobs.find(x => (x.job_id || x.id) === jid);
    if (j) selectJob(j);
}

function selectJob(j) {
    selectedJob = j;
    const jid = j.job_id || j.id;

    // Highlight in list
    document.querySelectorAll('.job-item').forEach(el => el.classList.remove('selected'));
    document.getElementById(`ji-${jid}`)?.classList.add('selected');

    // Show banner
    document.getElementById('no-job-placeholder').style.display = 'none';
    document.getElementById('selected-banner').classList.remove('hidden');
    document.getElementById('banner-title').textContent = j.job_title || j.title || '';
    document.getElementById('banner-sub').textContent =
        `${j.department || 'General'} • ${(j.status || 'draft')}`;
    const btnVc = document.getElementById('banner-view-candidates');
    if (btnVc) btnVc.href = `all_candidates.html?job_id=${jid}`;

    // Enable drop zone + show upload phase
    document.getElementById('drop-zone').classList.remove('disabled');
    showPhase('upload');
    updateUploadBtn();
}

/* ── Drop Zone ─────────────────────────────────────────────────── */
function setupDropZone() {
    const dz = document.getElementById('drop-zone');
    const input = document.getElementById('file-input');

    input.addEventListener('change', e => {
        addFiles(Array.from(e.target.files));
        e.target.value = '';
    });

    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('dragover');
        if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
    });
}

/* ── File Management ───────────────────────────────────────────── */
function addFiles(files) {
    const valid = files.filter(f => {
        const ext = getExt(f.name);
        return ALLOWED_EXTS.includes(ext);
    });
    const invalid = files.length - valid.length;
    if (invalid > 0)
        showToast(`${invalid} unsupported file(s) skipped. Accepted: PDF, DOCX, TXT.`, 'warning');

    const tooBig = valid.filter(f => f.size > MAX_SIZE_MB * 1024 * 1024);
    if (tooBig.length > 0)
        showToast(`${tooBig.length} file(s) exceed ${MAX_SIZE_MB} MB and were skipped.`, 'warning');

    const sizedOk = valid.filter(f => f.size <= MAX_SIZE_MB * 1024 * 1024);

    sizedOk.forEach(f => {
        if (fileQueue.length >= MAX_FILES) return;
        const dup = fileQueue.find(q => q.file.name === f.name && q.file.size === f.size);
        if (!dup) fileQueue.push({ file: f, status: 'queued', result: null, rejectionReason: null });
    });

    if (fileQueue.length >= MAX_FILES)
        showToast(`Maximum ${MAX_FILES} files allowed.`, 'warning');

    renderFileQueue();
    updateUploadBtn();
}

function removeFile(index) {
    fileQueue.splice(index, 1);
    renderFileQueue();
    updateUploadBtn();
}

function clearQueue() {
    fileQueue = fileQueue.filter(f => f.status !== 'queued');
    renderFileQueue();
    updateUploadBtn();
}

function getExt(name) {
    return (name || '').toLowerCase().split('.').pop();
}

function renderFileQueue() {
    const section = document.getElementById('queue-section');
    const list = document.getElementById('file-queue');
    const badge = document.getElementById('queue-count');

    if (fileQueue.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    if (section) section.style.display = 'block';
    if (badge) badge.textContent = `${fileQueue.length} file${fileQueue.length !== 1 ? 's' : ''}`;

    if (!list) return;
    list.innerHTML = fileQueue.map((item, i) => {
        const ext = getExt(item.file.name);
        const sizeMB = (item.file.size / 1024 / 1024).toFixed(2);
        const iconCls = ext === 'pdf' ? 'fa-file-pdf' : (ext === 'docx' || ext === 'doc') ? 'fa-file-word' : 'fa-file-lines';
        const iconBg = ext === 'pdf' ? 'rgba(239,68,68,0.15)' : (ext === 'docx' || ext === 'doc') ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)';
        const iconClr = ext === 'pdf' ? '#f87171' : (ext === 'docx' || ext === 'doc') ? '#60a5fa' : '#34d399';
        const canRemove = item.status === 'queued';

        return `
        <div class="file-row" id="fq-${i}">
            <div class="file-type-icon" style="background:${iconBg};color:${iconClr};">
                <i class="fa-solid ${iconCls}"></i>
            </div>
            <div class="file-details">
                <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
                <div class="file-meta">${sizeMB} MB • .${ext.toUpperCase()}</div>
            </div>
            <span class="file-status-badge status-queued">Queued</span>
            ${canRemove
                ? `<button class="file-remove-btn" onclick="removeFile(${i})" title="Remove">
                       <i class="fa-solid fa-xmark"></i>
                   </button>`
                : ''}
        </div>`;
    }).join('');
}

function updateUploadBtn() {
    const btn = document.getElementById('btn-upload');
    if (!btn) return;
    const hasQueued = fileQueue.some(f => f.status === 'queued');
    btn.disabled = !selectedJob || !hasQueued;
}

/* ── Session Persistence ───────────────────────────────────────── */
function saveSession(session) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) { }
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function restoreSession() {
    const sess = loadSession();
    if (!sess) return;

    // If session is done, show results
    if (sess.phase === 'done') {
        uploadSession = sess;
        // Re-select job from session
        const j = allJobs.find(x => (x.job_id || x.id) === sess.jobId);
        if (j) selectJob(j);
        showPhase('results');
        renderResults(sess);
        return;
    }

    // If session is uploading — resume
    if (sess.phase === 'uploading') {
        uploadSession = sess;
        const j = allJobs.find(x => (x.job_id || x.id) === sess.jobId);
        if (j) selectJob(j);

        // Rebuild in-memory fileQueue from session metadata (no actual File objects)
        // Processing will be based on session items that are still 'queued'
        showPhase('processing');
        updateProcessingUI(sess);

        // Resume processing remaining files
        resumeProcessing(sess);
    }
}

/* ── Main Upload Flow ──────────────────────────────────────────── */
async function startUpload() {
    if (!selectedJob) { showToast('Please select a job vacancy first.', 'warning'); return; }
    const queued = fileQueue.filter(f => f.status === 'queued');
    if (queued.length === 0) { showToast('No files to upload.', 'warning'); return; }

    const jid = selectedJob.job_id || selectedJob.id;

    // Build session
    uploadSession = {
        jobId: jid,
        jobTitle: selectedJob.job_title || selectedJob.title || '',
        orgId: currentOrgId,
        hrId: currentHrId,
        phase: 'uploading',
        startedAt: new Date().toISOString(),
        items: queued.map(q => ({
            name: q.file.name,
            size: q.file.size,
            status: 'queued',   // queued | parsing | passed | failed
            result: null,
            rejectionReason: null,
        })),
    };
    saveSession(uploadSession);

    // Keep File objects mapped by name+size so we can send them
    const fileMap = {};
    queued.forEach(q => { fileMap[`${q.file.name}::${q.file.size}`] = q.file; });

    showPhase('processing');
    updateProcessingUI(uploadSession);

    await processItems(uploadSession, fileMap);
}

async function resumeProcessing(sess) {
    // When restoring, we don't have File objects — mark remaining queued as failed with message
    const stillQueued = sess.items.filter(i => i.status === 'queued');
    if (stillQueued.length === 0) {
        sess.phase = 'done';
        saveSession(sess);
        showPhase('results');
        renderResults(sess);
        return;
    }

    stillQueued.forEach(i => {
        i.status = 'failed';
        i.rejectionReason = 'Upload interrupted — please retry this file.';
    });
    sess.phase = 'done';
    saveSession(sess);
    updateProcessingUI(sess);
    await new Promise(r => setTimeout(r, 600));
    showPhase('results');
    renderResults(sess);
}

async function processItems(sess, fileMap) {
    for (let idx = 0; idx < sess.items.length; idx++) {
        const item = sess.items[idx];
        if (item.status !== 'queued') continue;

        item.status = 'parsing';
        saveSession(sess);
        updateProcessingUI(sess);
        updateProcRow(idx, item);

        const file = fileMap[`${item.name}::${item.size}`];
        if (!file) {
            item.status = 'failed';
            item.rejectionReason = 'File reference lost — please retry.';
            saveSession(sess);
            updateProcessingUI(sess);
            updateProcRow(idx, item);
            continue;
        }

        try {
            const fd = new FormData();
            fd.append('job_id', sess.jobId);
            fd.append('org_id', sess.orgId);
            fd.append('hr_id', sess.hrId);
            fd.append('file', file);

            const res = await fetch(`${window.location.protocol}//${window.location.host}/api/candidates/parse`, {
                method: 'POST',
                body: fd,
            });

            const data = await res.json();

            if (res.status === 422 && data.rejected) {
                item.status = 'failed';
                item.rejectionReason = data.reason || 'Rejected by server.';
            } else if (!res.ok) {
                item.status = 'failed';
                item.rejectionReason = data.detail || `Server error ${res.status}`;
            } else {
                item.status = 'passed';
                item.result = data;
            }
        } catch (e) {
            item.status = 'failed';
            item.rejectionReason = `Network error: ${e.message}`;
        }

        saveSession(sess);
        updateProcessingUI(sess);
        updateProcRow(idx, item);

        // Small UX pause
        await new Promise(r => setTimeout(r, 200));
    }

    // All done
    sess.phase = 'done';
    saveSession(sess);

    await new Promise(r => setTimeout(r, 600));
    showPhase('results');
    renderResults(sess);

    const passed = sess.items.filter(i => i.status === 'passed').length;
    const failed = sess.items.filter(i => i.status === 'failed').length;
    if (passed > 0) showToast(` ${passed} resume(s) parsed and scored!`, 'success');
    if (failed > 0) showToast(`❌ ${failed} file(s) failed — check the Failed section.`, 'warning');
}

/* ── Processing UI Helpers ─────────────────────────────────────── */
function updateProcessingUI(sess) {
    const total = sess.items.length;
    const passed = sess.items.filter(i => i.status === 'passed').length;
    const failed = sess.items.filter(i => i.status === 'failed').length;
    const done = passed + failed;
    const remaining = total - done;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    setEl('cnt-total', total);
    setEl('cnt-remaining', remaining);
    setEl('cnt-passed', passed);
    setEl('cnt-failed', failed);

    const bar = document.getElementById('proc-bar');
    if (bar) bar.style.width = pct + '%';

    const titleEl = document.getElementById('proc-title');
    const subEl = document.getElementById('proc-sub');
    if (titleEl) titleEl.textContent = done < total
        ? `Processing resumes… (${done}/${total})`
        : 'Processing complete!';
    if (subEl) subEl.textContent = done < total
        ? `Uploading and parsing — ${remaining} file${remaining !== 1 ? 's' : ''} remaining`
        : `${passed} passed, ${failed} failed`;

    // Init proc rows if they don't exist yet
    const pq = document.getElementById('proc-file-queue');
    if (pq && pq.children.length !== sess.items.length) {
        pq.innerHTML = sess.items.map((item, i) => buildProcRow(i, item)).join('');
    }
}

function buildProcRow(idx, item) {
    const ext = getExt(item.name);
    const iconCls = ext === 'pdf' ? 'fa-file-pdf' : (ext === 'docx' || ext === 'doc') ? 'fa-file-word' : 'fa-file-lines';
    const iconBg = ext === 'pdf' ? 'rgba(239,68,68,0.15)' : (ext === 'docx' || ext === 'doc') ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)';
    const iconClr = ext === 'pdf' ? '#f87171' : (ext === 'docx' || ext === 'doc') ? '#60a5fa' : '#34d399';
    const badgeHtml = statusBadge(item.status);

    return `
    <div class="file-row" id="prow-${idx}">
        <div class="file-type-icon" style="background:${iconBg};color:${iconClr};">
            <i class="fa-solid ${iconCls}"></i>
        </div>
        <div class="file-details">
            <div class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="file-meta">.${ext.toUpperCase()}</div>
        </div>
        ${badgeHtml}
    </div>`;
}

function updateProcRow(idx, item) {
    const row = document.getElementById(`prow-${idx}`);
    if (!row) return;

    const badgeEl = row.querySelector('.file-status-badge');
    if (badgeEl) badgeEl.outerHTML = statusBadge(item.status);

    row.className = `file-row${item.status === 'passed' ? ' done' : item.status === 'failed' ? ' failed' : item.status === 'parsing' ? ' parsing' : ''}`;
}

function statusBadge(status) {
    const map = {
        queued: ['status-queued', '<i class="fa-regular fa-clock"></i> Queued'],
        parsing: ['status-parsing', '<i class="fa-solid fa-spinner fa-spin"></i> Parsing…'],
        passed: ['status-passed', '<i class="fa-solid fa-circle-check"></i> Passed'],
        failed: ['status-failed', '<i class="fa-solid fa-circle-xmark"></i> Failed'],
    };
    const [cls, html] = map[status] || map.queued;
    return `<span class="file-status-badge ${cls}">${html}</span>`;
}

/* ── Results ───────────────────────────────────────────────────── */
function renderResults(sess) {
    const passed = sess.items.filter(i => i.status === 'passed');
    const failed = sess.items.filter(i => i.status === 'failed');

    setEl('res-passed', passed.length);
    setEl('res-failed', failed.length);

    const jobLabel = document.getElementById('results-job-label');
    if (jobLabel) jobLabel.textContent = `Job: ${sess.jobTitle}`;

    // Failed cards
    const failedList = document.getElementById('failed-cards-list');
    if (failedList) {
        failedList.innerHTML = failed.map((item, fi) => `
        <div class="failed-card" id="fcard-${fi}">
            <i class="fa-solid fa-circle-xmark failed-icon"></i>
            <div style="flex:1;min-width:0;">
                <div class="failed-filename">${escapeHtml(item.name)}</div>
                <div class="failed-reason">${escapeHtml(item.rejectionReason || 'Unknown error')}</div>
            </div>
            <button class="btn-retry" onclick="retryFile(${fi})">
                <i class="fa-solid fa-rotate-right"></i> Retry
            </button>
        </div>`).join('');
    }

    // Hide failed toggle if no failures
    const fBtn = document.getElementById('failed-toggle-btn');
    if (fBtn) fBtn.style.cursor = failed.length > 0 ? 'pointer' : 'default';

    // Hide submit if nothing passed
    const submitBtn = document.getElementById('btn-submit');
    if (submitBtn) {
        submitBtn.style.display = passed.length > 0 ? 'flex' : 'none';
    }
}

function toggleFailedSection(open) {
    const sess = loadSession();
    if (!sess) return;
    const failed = sess.items.filter(i => i.status === 'failed');
    if (failed.length === 0) return;

    const sec = document.getElementById('failed-section');
    if (sec) sec.classList.toggle('open', open);
}

async function retryFile(failedIndex) {
    const sess = loadSession();
    if (!sess) { showToast('No upload session found.', 'error'); return; }

    const failedItems = sess.items.filter(i => i.status === 'failed');
    const item = failedItems[failedIndex];
    if (!item) return;

    showToast(`Opening file picker to retry: ${item.name}`, 'info');

    // Create a hidden file input for retry
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.doc,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) { document.body.removeChild(input); return; }

        if (file.name !== item.name) {
            showToast(`Please select the same file: ${item.name}`, 'warning');
            document.body.removeChild(input);
            return;
        }

        item.status = 'parsing';
        item.rejectionReason = null;
        sess.phase = 'uploading';
        saveSession(sess);

        const fcard = document.getElementById(`fcard-${failedIndex}`);
        if (fcard) fcard.style.opacity = '0.5';

        try {
            const fd = new FormData();
            fd.append('job_id', sess.jobId);
            fd.append('org_id', sess.orgId);
            fd.append('hr_id', sess.hrId);
            fd.append('file', file);

            const res = await fetch(`${window.location.protocol}//${window.location.host}/api/candidates/parse`, {
                method: 'POST', body: fd,
            });
            const data = await res.json();

            if (res.status === 422 && data.rejected) {
                item.status = 'failed';
                item.rejectionReason = data.reason || 'Rejected.';
                showToast(`Still rejected: ${data.reason}`, 'warning');
            } else if (!res.ok) {
                item.status = 'failed';
                item.rejectionReason = data.detail || `Error ${res.status}`;
                showToast('Retry failed: ' + (data.detail || ''), 'error');
            } else {
                item.status = 'passed';
                item.result = data;
                showToast(` ${file.name} passed on retry!`, 'success');
            }
        } catch (err) {
            item.status = 'failed';
            item.rejectionReason = `Network error: ${err.message}`;
            showToast('Network error during retry.', 'error');
        }

        sess.phase = 'done';
        saveSession(sess);
        renderResults(sess);
        document.body.removeChild(input);
    };

    input.click();
}

/* ── Submit Passed Candidates ──────────────────────────────────── */
async function submitCandidates() {
    const sess = loadSession();
    if (!sess) return;

    const passedItems = sess.items.filter(i => i.status === 'passed');
    if (passedItems.length === 0) return;

    // Show loading state
    const btn = document.getElementById('btn-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    let savedCount = 0;
    let failCount = 0;

    for (const item of passedItems) {
        try {
            const fd = new FormData();
            fd.append('job_id', sess.jobId);
            fd.append('org_id', sess.orgId);
            fd.append('hr_id', sess.hrId);
            fd.append('parsed_data', JSON.stringify(item.result));
            fd.append('tmp_filename', item.result.tmp_filename);

            const res = await fetch(`${window.location.protocol}//${window.location.host}/api/candidates/save`, {
                method: 'POST',
                body: fd,
            });

            if (res.ok) {
                savedCount++;
            } else {
                failCount++;
            }
        } catch (err) {
            console.error('Error saving candidate:', err);
            failCount++;
        }
    }

    if (savedCount > 0) {
        showToast(` ${savedCount} candidate${savedCount !== 1 ? 's' : ''} added to the Candidates list!`, 'success');
    }
    if (failCount > 0) {
        showToast(`Failed to save ${failCount} candidate(s).`, 'error');
    }

    clearSession();
    uploadSession = null;

    setTimeout(() => {
        window.location.href = `all_candidates.html?job_id=${sess.jobId}`;
    }, 1200);
}

/* ── Reset / Upload More ───────────────────────────────────────── */
function resetUpload() {
    clearSession();
    uploadSession = null;
    fileQueue = [];
    showPhase('upload');
    renderFileQueue();
    updateUploadBtn();

    const pq = document.getElementById('proc-file-queue');
    if (pq) pq.innerHTML = '';
    setEl('proc-bar', null);
    const bar = document.getElementById('proc-bar');
    if (bar) bar.style.width = '0%';
}

/* ── Phase Switching ───────────────────────────────────────────── */
function showPhase(name) {
    ['upload', 'processing', 'results'].forEach(p => {
        const el = document.getElementById(`phase-${p}`);
        if (el) el.classList.toggle('active', p === name);
    });
}

/* ── Utility ───────────────────────────────────────────────────── */
function setEl(id, val) {
    const el = document.getElementById(id);
    if (el && val !== null) el.textContent = val;
}
