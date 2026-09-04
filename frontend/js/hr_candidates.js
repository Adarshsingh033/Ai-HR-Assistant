/* ========================================================
   hr_candidates.js – Candidate Management Logic
   ======================================================== */

let currentJobId = null;
let selectedFilesToUpload = [];
let showTop10 = false;

window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (!session || session.role !== 'hr') {
        location.href = '../index.html';
        return;
    }

    // Populate user info
    document.getElementById('sidebar-name').textContent = session.username;
    document.getElementById('sidebar-avatar').textContent = session.username.charAt(0).toUpperCase();

    // Get Job ID from URL
    const params = new URLSearchParams(window.location.search);
    currentJobId = params.get('job_id');

    // Only redirect if we are on candidates.html (which requires a job)
    const isGlobalView = window.location.pathname.includes('all_candidates.html');
    if (!currentJobId && !isGlobalView) {
        showToast('No job selected. Redirecting...', 'warning');
        setTimeout(() => location.href = 'jobs.html', 1500);
        return;
    }

    // Load Context & Candidates
    if (currentJobId) {
        loadJobDetails(currentJobId);
        loadCandidates(currentJobId);
    } else {
        // All Candidates View
        document.getElementById('job-title-display').textContent = 'All Candidates';
        const backBtn = document.querySelector('.topbar .btn-secondary');
        if (backBtn) backBtn.classList.add('hidden');

        // Hide upload button in global view as it requires a job context
        const uploadBtn = document.querySelector('.topbar button[onclick="openUploadModal()"]');
        if (uploadBtn) uploadBtn.classList.add('hidden');

        loadCandidates(null, session.org_id);
    }

    // Setup Drag/Drop
    setupDropZone();
});

/* ── Load Job Context ─────────────────────────────────── */
async function loadJobDetails(jobId) {
    try {
        const job = await apiRequest('GET', `/api/jobs/${jobId}`);
        document.getElementById('job-title-display').textContent = job.title;
    } catch (err) {
        document.getElementById('job-title-display').textContent = 'Unknown Job';
    }
}

/* ── Load Candidates ──────────────────────────────────── */
async function loadCandidates(jobId = null, orgId = null) {
    const grid = document.getElementById('candidates-grid');
    const empty = document.getElementById('candidates-empty');
    const loader = document.getElementById('candidates-loader');

    grid.innerHTML = '';
    empty.classList.add('hidden');
    loader.classList.remove('hidden');

    try {
        let url = '/api/candidates';
        const params = [];
        if (jobId) params.push(`job_id=${jobId}`);
        else if (orgId) params.push(`org_id=${orgId}`);

        if (showTop10) params.push('top_10=true');

        if (params.length > 0) url += `?${params.join('&')}`;

        const data = await apiRequest('GET', url);
        const candidates = data.candidates || [];

        loader.classList.add('hidden');

        if (candidates.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        candidates.forEach(cand => {
            const card = document.createElement('div');
            card.className = 'card candidate-card';

            const avatarChar = (cand.name || 'U').charAt(0).toUpperCase();

            const skillsHtml = (cand.skills || []).slice(0, 5).map(s =>
                `<span class="skill-badge">${s}</span>`
            ).join('');

            const extraSkills = (cand.skills || []).length > 5
                ? `<span class="skill-badge" style="background:transparent; border:1px solid var(--border);">+${cand.skills.length - 5}</span>`
                : '';

            card.innerHTML = `
                <div class="candidate-header">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="candidate-avatar">${avatarChar}</div>
                            <div>
                                <div class="candidate-name">${cand.name || 'Unknown Candidate'}</div>
                                <div class="candidate-role">${cand.total_experience || 'Experience Unknown'} year's</div>
                            </div>
                        </div>
                        <div class="match-badge ${cand.match_percentage >= 70 ? 'match-high' : cand.match_percentage >= 40 ? 'match-mid' : 'match-low'}">
                            ${cand.match_percentage || 0}% Match
                        </div>
                    </div>
                </div>

                <div class="candidate-meta">
                    <div class="candidate-meta-item" title="Email">
                        <span>✉️</span> ${cand.email || 'N/A'}
                    </div>
                    <div class="candidate-meta-item" title="Phone">
                        <span><i class="fa-solid fa-mobile-screen"></i></span> ${cand.phone || 'N/A'}
                    </div>
                    <div class="candidate-meta-item" title="Gender">
                        <span><i class="fa-solid fa-user"></i></span> ${cand.gender || 'N/A'}
                    </div>
                    <div class="candidate-meta-item" title="Uploaded">
                        <span><i class="fa-solid fa-calendar"></i></span> ${formatDate(cand.created_at)}
                    </div>
                </div>

                <div class="resume-link" title="${cand.filename}"><i class="fa-solid fa-file-lines"></i> ${cand.filename}</div>

                <div class="candidate-skills">
                    ${skillsHtml} ${extraSkills}
                </div>

                <div class="card-footer flex gap-2">
                    <button class="btn btn-secondary w-full btn-sm" onclick='openViewCandidateModal(${JSON.stringify(cand).replace(/'/g, "&#39;")})'>View Details</button>
                    <a href="emails.html?to=${encodeURIComponent(cand.email || '')}" class="btn btn-secondary btn-sm" title="Send Email"><i class="fa-solid fa-envelope"></i></a>
                    <button class="btn btn-secondary btn-sm" onclick="delCandidate('${cand.candidate_id}')" title="Remove Candidate"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            grid.appendChild(card);
        });

    } catch (err) {
        loader.classList.add('hidden');
        showToast('Failed to load candidates', 'error');
        console.error(err);
    }
}

/* ── Toggle Top 10 ────────────────────────────────────── */
function toggleTop10() {
    showTop10 = !showTop10;
    const btn = document.getElementById('toggle-top-10');
    if (showTop10) {
        btn.classList.replace('btn-secondary', 'btn-primary');
        btn.innerHTML = '<i class="fa-solid fa-star"></i> Showing Top 10';
    } else {
        btn.classList.replace('btn-primary', 'btn-secondary');
        btn.innerHTML = '<i class="fa-solid fa-star"></i> Top 10 Matches';
    }
    const session = Session.get();
    loadCandidates(currentJobId, currentJobId ? null : session.org_id);
}

/* ── Top Match List Modal ─────────────────────────────── */
async function openTopMatchListModal() {
    const modal = document.getElementById('top-match-modal');
    const tbody = document.getElementById('top-match-table-body');

    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Loading top matches...</td></tr>';
    modal.classList.add('open');

    try {
        let url = `/api/candidates?sort_by_match=true`;
        if (currentJobId) url += `&job_id=${currentJobId}`;
        else {
            const session = Session.get();
            if (session.org_id) url += `&org_id=${session.org_id}`;
        }

        const data = await apiRequest('GET', url);
        const candidates = data.candidates || [];

        if (candidates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No candidates found yet.</td></tr>';
            return;
        }

        tbody.innerHTML = candidates.map((cand, index) => `
            <tr>
                <td class="font-bold text-accent">#${index + 1}</td>
                <td class="text-center">
                    <input type="checkbox" 
                           ${cand.reached ? 'checked' : ''} 
                           onchange="updateCandidateStatus('${cand.candidate_id}', { reached: this.checked })"
                           style="width: 18px; height: 18px; cursor: pointer;">
                </td>
                <td>
                    <div class="font-semibold">${cand.name}</div>
                </td>
                <td>
                    <div class="text-sm">${cand.email || 'N/A'}</div>
                    <div class="text-muted text-xs">${cand.phone || 'N/A'}</div>
                    <a href="emails.html?to=${encodeURIComponent(cand.email || '')}&candidate_id=${cand.candidate_id}" class="text-xs text-accent hover:underline mt-1 inline-block" title="Send Email">Send Mail</a>
                </td>
                <td>
                    <div class="match-badge ${cand.match_percentage >= 70 ? 'match-high' : cand.match_percentage >= 40 ? 'match-mid' : 'match-low'}">
                        ${cand.match_percentage || 0}%
                    </div>
                </td>
                <td>
                    <textarea 
                           class="input btn-sm w-full" 
                           placeholder="Ex: Excellent skills, need follow-up..." 
                           style="height: 60px; resize: vertical; padding: 6px; font-size: 0.85rem;"
                           onblur="updateCandidateStatus('${cand.candidate_id}', { remark: this.value })"
                           >${cand.remark || ''}</textarea>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Failed to load Best Matches.</td></tr>';
        showToast('Error loading best matches', 'error');
    }
}

async function updateCandidateStatus(candidateId, updates) {
    try {
        await apiRequest('PUT', `/api/candidates/${candidateId}/status`, updates);
        // showToast('Updated', 'success'); // Optional, might be too noisy
    } catch (err) {
        showToast('Failed to update candidate status', 'error');
        console.error(err);
    }
}

function closeTopMatchListModal() {
    document.getElementById('top-match-modal').classList.remove('open');
}

/* ── View Candidate Modal ─────────────────────────────── */
function openViewCandidateModal(cand) {
    document.getElementById('vc-avatar').textContent = (cand.name || 'U').charAt(0).toUpperCase();
    document.getElementById('vc-name').textContent = cand.name || 'Unknown Candidate';
    document.getElementById('vc-role').textContent = cand.total_experience || 'Experience Unknown';

    document.getElementById('vc-email').innerHTML = `<i class="fa-solid fa-envelope"></i> ${cand.email || 'N/A'}`;
    document.getElementById('vc-phone').innerHTML = `<i class="fa-solid fa-mobile-screen"></i> ${cand.phone || 'N/A'}`;
    document.getElementById('vc-gender').innerHTML = `<i class="fa-solid fa-user"></i> ${cand.gender || 'N/A'}`;
    document.getElementById('vc-exp').innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${cand.total_experience || 'N/A'}`;

    const skillsHtml = (cand.skills || []).map(s =>
        `<span class="skill-badge" style="font-size: 0.85rem; padding: 4px 10px;">${s}</span>`
    ).join('');
    document.getElementById('vc-skills').innerHTML = skillsHtml || '<span class="text-muted text-sm">No skills detected</span>';

    document.getElementById('vc-file').innerHTML = `<i class="fa-solid fa-file-lines"></i> ${cand.filename}`;

    const matchSection = document.getElementById('vc-match-section') || createMatchSection();
    matchSection.innerHTML = `
        <div class="mt-4 p-3 rounded bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]">
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold">JD Match Analysis</span>
                <span class="match-badge ${cand.match_percentage >= 70 ? 'match-high' : cand.match_percentage >= 40 ? 'match-mid' : 'match-low'}">${cand.match_percentage || 0}% Match</span>
            </div>
            <p class="text-xs text-muted leading-relaxed">${cand.match_explanation || 'No analysis available.'}</p>
        </div>
    `;

    document.getElementById('view-candidate-modal').classList.add('open');
}

function createMatchSection() {
    const parent = document.querySelector('#view-candidate-modal .modal');
    const div = document.createElement('div');
    div.id = 'vc-match-section';
    // Insert before the action buttons (the last div in the modal)
    const actions = parent.querySelector('.flex.justify-end');
    parent.insertBefore(div, actions);
    return div;
}

function closeViewCandidateModal() {
    document.getElementById('view-candidate-modal').classList.remove('open');
}

/* ── Delete Candidate ─────────────────────────────────── */
async function delCandidate(candId) {
    if (!confirm('Are you sure you want to remove this candidate?')) return;
    try {
        await apiRequest('DELETE', `/api/candidates/${candId}`);
        showToast('Candidate removed', 'success');
        const session = Session.get();
        loadCandidates(currentJobId, currentJobId ? null : session.org_id);
    } catch (err) {
        showToast('Failed to remove candidate', 'error');
    }
}

/* ── Upload Logic ─────────────────────────────────────── */
function openUploadModal() {
    selectedFilesToUpload = [];
    updateFileList();
    document.getElementById('upload-modal').classList.add('open');
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.remove('open');
}

function setupDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    fileInput.addEventListener('change', handleFileSelect);

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect({ target: fileInput });
        }
    });
}

function handleFileSelect(event) {
    const ALLOWED_EXTS = ['pdf', 'docx', 'doc', 'txt'];
    const ALLOWED_TYPES = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
    ];
    const files = Array.from(event.target.files);
    const valid = files.filter(f => {
        const ext = f.name.toLowerCase().split('.').pop();
        return ALLOWED_TYPES.includes(f.type) || ALLOWED_EXTS.includes(ext);
    });

    if (valid.length !== files.length) {
        showToast('Only PDF, DOCX, and TXT files are supported.', 'warning');
    }

    selectedFilesToUpload = [...selectedFilesToUpload, ...valid].slice(0, 10); // Max 10 limit

    // Reset input value to allow selecting same files again
    event.target.value = '';

    updateFileList();
}

function updateFileList() {
    const list = document.getElementById('selected-files');
    const btn = document.getElementById('btn-upload');

    if (selectedFilesToUpload.length === 0) {
        list.innerHTML = '';
        btn.disabled = true;
        return;
    }

    btn.disabled = false;
    list.innerHTML = selectedFilesToUpload.map((f, i) => `
        <div class="flex justify-between items-center bg-[rgba(255,255,255,0.03)] p-2 rounded mt-1 border border-[rgba(255,255,255,0.05)]">
            <span class="truncate">${f.name}</span>
            <button class="text-danger hover:text-white ml-2" onclick="removeFile(${i}); event.stopPropagation();">×</button>
        </div>
    `).join('');
}

window.removeFile = function (index) {
    selectedFilesToUpload.splice(index, 1);
    updateFileList();
};

async function startUpload() {
    if (selectedFilesToUpload.length === 0) return;

    closeUploadModal();

    const statusBar = document.getElementById('upload-status');
    const statusText = document.getElementById('upload-status-text');
    const progressText = document.getElementById('upload-progress');

    statusBar.classList.remove('hidden');
    const session = Session.get();

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedFilesToUpload.length; i++) {
        const file = selectedFilesToUpload[i];
        statusText.textContent = `Parsing ${file.name}...`;
        progressText.textContent = `${i + 1}/${selectedFilesToUpload.length}`;

        const fd = new FormData();
        fd.append('job_id', currentJobId);
        fd.append('org_id', session.org_id);
        fd.append('hr_id', session.user_id);
        fd.append('file', file);

        try {
            await apiRequest('POST', '/api/candidates/upload', fd, true);
            successCount++;
        } catch (err) {
            console.error('Upload error:', err);
            failCount++;
        }
    }

    statusBar.classList.add('hidden');

    // Reset selected files
    selectedFilesToUpload = [];
    updateFileList();

    if (successCount > 0) {
        showToast(`Successfully parsed ${successCount} candidate(s).`, 'success');
        loadCandidates(currentJobId, null);
    }
    if (failCount > 0) {
        showToast(`Failed to process ${failCount} file(s).`, 'error');
        loadCandidates(currentJobId, null); // Still load to show partial successes
    }
}
