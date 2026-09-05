/* ========================================================
   hr_compare.js – Candidate Comparison Logic
   ======================================================== */

let allJobs = [];
let availableCandidates = [];
let currentOrgId = null;
let currentHrId = null;
let tsJob = null;
let tsCand1 = null;
let tsCand2 = null;
const COMPARE_SESSION_KEY = 'hr_compare_session';

function saveCompareSession(jobId, cand1Id, cand2Id, resultData) {
    try {
        localStorage.setItem(COMPARE_SESSION_KEY, JSON.stringify({
            jobId, cand1Id, cand2Id, data: resultData, timestamp: Date.now()
        }));
    } catch(e) {}
}

function loadCompareSession() {
    try {
        const raw = localStorage.getItem(COMPARE_SESSION_KEY);
        if (!raw) return null;
        const sess = JSON.parse(raw);
        if (Date.now() - sess.timestamp > 2 * 60 * 60 * 1000) {
            localStorage.removeItem(COMPARE_SESSION_KEY);
            return null;
        }
        return sess;
    } catch(e) { return null; }
}

function clearCompareSession() {
    try { localStorage.removeItem(COMPARE_SESSION_KEY); } catch(e) {}
}

async function restoreCompareSession() {
    const sess = loadCompareSession();
    if (!sess) return;
    
    const jobSel = document.getElementById('compare-job-select');
    if (jobSel) {
        jobSel.value = sess.jobId;
        try {
            const data = await apiRequest('GET', `/api/comparison/candidates-by-job?job_id=${sess.jobId}&org_id=${currentOrgId}`);
            availableCandidates = (data && data.candidates) ? data.candidates : [];
            populateCandidateDropdowns();
            
            const cand1Sel = document.getElementById('compare-cand1-select');
            const cand2Sel = document.getElementById('compare-cand2-select');
            
            if (tsCand1) { tsCand1.setValue(sess.cand1Id); }
            else if (cand1Sel) { cand1Sel.value = sess.cand1Id; }
            
            if (tsCand2) { tsCand2.setValue(sess.cand2Id); }
            else if (cand2Sel) { cand2Sel.value = sess.cand2Id; }
            
            validateSelections();
            
            renderComparisonResults(sess.data);
            document.getElementById('compare-placeholder').style.display = 'none';
            document.getElementById('compare-result-container').style.display = 'block';
        } catch (e) {
            console.warn('Failed to restore comparison session:', e);
            clearCompareSession();
        }
    }
}

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

    // Attach change listeners to candidate dropdowns
    document.getElementById('compare-cand1-select')?.addEventListener('change', validateSelections);
    document.getElementById('compare-cand2-select')?.addEventListener('change', validateSelections);
    
    // Restore session if available
    await restoreCompareSession();
});

/* ── Load Job Vacancies ────────────────────────────────── */
async function loadJobs() {
    try {
        const data = await apiRequest('GET', `/api/jobs?organization_id=${currentOrgId}`);
        allJobs = (data && data.jobs) ? data.jobs : [];

        const jobSel = document.getElementById('compare-job-select');
        if (!jobSel) return;

        const options = allJobs.map(j => {
            const jid = j.job_id || j.id;
            const title = escapeHtml(j.job_title || j.title || 'Untitled');
            return `<option value="${jid}">${title}</option>`;
        }).join('');

        jobSel.innerHTML = '<option value="">-- Choose Job Vacancy --</option>' + options;
        
        if (tsJob) tsJob.destroy();
        tsJob = new TomSelect('#compare-job-select', { create: false, controlInput: '<input>' });
        
    } catch (e) {
        showToast('Failed to load job vacancies: ' + e.message, 'error');
    }
}

/* ── On Job Selection Changed ──────────────────────────── */
async function onJobSelectionChanged() {
    clearCompareSession();

    const jobId = document.getElementById('compare-job-select').value;
    const cand1Sel = document.getElementById('compare-cand1-select');
    const cand2Sel = document.getElementById('compare-cand2-select');
    const btnCompare = document.getElementById('btn-run-compare');

    // Reset results and selections
    document.getElementById('compare-placeholder').style.display = 'flex';
    document.getElementById('compare-result-container').style.display = 'none';

    if (!jobId) {
        cand1Sel.innerHTML = '<option value="">-- Select Candidate A --</option>';
        cand2Sel.innerHTML = '<option value="">-- Select Candidate B --</option>';
        
        if (tsCand1) tsCand1.destroy();
        if (tsCand2) tsCand2.destroy();
        tsCand1 = new TomSelect('#compare-cand1-select', { create: false, controlInput: '<input>' });
        tsCand2 = new TomSelect('#compare-cand2-select', { create: false, controlInput: '<input>' });
        tsCand1.disable();
        tsCand2.disable();
        
        btnCompare.disabled = true;
        return;
    }

    try {
        const data = await apiRequest('GET', `/api/comparison/candidates-by-job?job_id=${jobId}&org_id=${currentOrgId}`);
        availableCandidates = (data && data.candidates) ? data.candidates : [];

        if (availableCandidates.length < 2) {
            showToast(`Only ${availableCandidates.length} candidate resume(s) uploaded for this job vacancy. At least 2 candidates are required for comparison.`, 'warning');
        }

        populateCandidateDropdowns();
    } catch (e) {
        showToast('Failed to load candidates for job: ' + e.message, 'error');
    }
}

function populateCandidateDropdowns() {
    const cand1Sel = document.getElementById('compare-cand1-select');
    const cand2Sel = document.getElementById('compare-cand2-select');

    if (availableCandidates.length === 0) {
        cand1Sel.innerHTML = '<option value="">No candidates found for this job</option>';
        cand2Sel.innerHTML = '<option value="">No candidates found for this job</option>';
        
        if (tsCand1) tsCand1.destroy();
        if (tsCand2) tsCand2.destroy();
        tsCand1 = new TomSelect('#compare-cand1-select', { create: false, controlInput: '<input>' });
        tsCand2 = new TomSelect('#compare-cand2-select', { create: false, controlInput: '<input>' });
        tsCand1.disable();
        tsCand2.disable();
        
        document.getElementById('btn-run-compare').disabled = true;
        return;
    }

    const options = availableCandidates.map(c => {
        return `<option value="${c.candidate_id}">${escapeHtml(c.name)}</option>`;
    }).join('');

    cand1Sel.innerHTML = '<option value="">-- Select Candidate A --</option>' + options;
    cand2Sel.innerHTML = '<option value="">-- Select Candidate B --</option>' + options;
    
    if (tsCand1) tsCand1.destroy();
    if (tsCand2) tsCand2.destroy();
    tsCand1 = new TomSelect('#compare-cand1-select', { create: false, controlInput: '<input>' });
    tsCand2 = new TomSelect('#compare-cand2-select', { create: false, controlInput: '<input>' });

    // Auto-select top 2 candidates if available
    if (availableCandidates.length >= 2) {
        tsCand1.setValue(availableCandidates[0].candidate_id);
        tsCand2.setValue(availableCandidates[1].candidate_id);
    }

    tsCand1.enable();
    tsCand2.enable();

    validateSelections();
}

function validateSelections() {
    const cand1Val = document.getElementById('compare-cand1-select').value;
    const cand2Val = document.getElementById('compare-cand2-select').value;
    const btnCompare = document.getElementById('btn-run-compare');

    if (cand1Val && cand2Val && cand1Val !== cand2Val) {
        btnCompare.disabled = false;
    } else {
        btnCompare.disabled = true;
    }
}

/* ========================================================
   RUN CANDIDATE COMPARISON
   ======================================================== */

async function runCandidateComparison() {
    const jobId = document.getElementById('compare-job-select').value;
    const cand1Id = document.getElementById('compare-cand1-select').value;
    const cand2Id = document.getElementById('compare-cand2-select').value;

    if (!jobId || !cand1Id || !cand2Id) {
        showToast('Please select a job vacancy and two distinct candidates.', 'error');
        return;
    }

    const btn = document.getElementById('btn-run-compare');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Comparing…';

    try {
        const data = await apiRequest('POST', '/api/comparison/compare', {
            job_id: jobId,
            candidate1_id: cand1Id,
            candidate2_id: cand2Id,
        });

        saveCompareSession(jobId, cand1Id, cand2Id, data);
        renderComparisonResults(data);

        document.getElementById('compare-placeholder').style.display = 'none';
        document.getElementById('compare-result-container').style.display = 'block';

        showToast('Candidate comparison generated!', 'success');
    } catch (err) {
        showToast('Comparison failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-code-compare"></i> Compare Profiles';
    }
}

function renderComparisonResults(data) {
    const c1 = data.candidate1;
    const c2 = data.candidate2;
    const rec = data.recommendation;

    // ── 1. Render Centerpiece Donut Cards (Profile A vs Profile B) ──────────
    renderProfileCard('c1', c1);
    renderProfileCard('c2', c2);

    // ── 2. Render Category 01: Location ──────────────────────────────────────
    renderCategoryBlock('c1-loc', c1.name, c1.criteria.location, 'cat-1');
    renderCategoryBlock('c2-loc', c2.name, c2.criteria.location, 'cat-1');

    // ── 3. Render Category 02: Skills ────────────────────────────────────────
    renderCategoryBlock('c1-skills', c1.name, c1.criteria.skills, 'cat-2');
    renderCategoryBlock('c2-skills', c2.name, c2.criteria.skills, 'cat-2');
    renderSkillBadges('c1-skills-badges', c1.criteria.skills);
    renderSkillBadges('c2-skills-badges', c2.criteria.skills);

    // ── 4. Render Category 03: Education ─────────────────────────────────────
    renderCategoryBlock('c1-edu', c1.name, c1.criteria.education, 'cat-3');
    renderCategoryBlock('c2-edu', c2.name, c2.criteria.education, 'cat-3');

    // ── 5. Render Category 04: Experience ────────────────────────────────────
    renderCategoryBlock('c1-exp', c1.name, c1.criteria.experience, 'cat-4');
    renderCategoryBlock('c2-exp', c2.name, c2.criteria.experience, 'cat-4');

    // ── 6. Render AI Recommendation & Reason Panel ───────────────────────────
    document.getElementById('rec-title').textContent = rec.recommendation_title || 'Recommended Candidate';
    document.getElementById('rec-reason-body').textContent = rec.reason || 'No detailed reason generated.';
}

function renderProfileCard(prefix, candidate) {
    document.getElementById(`${prefix}-score-num`).textContent = `${candidate.overall_score}%`;
    document.getElementById(`${prefix}-avatar`).textContent = (candidate.name || 'U').charAt(0).toUpperCase();
    document.getElementById(`${prefix}-name-display`).textContent = candidate.name;
    document.getElementById(`${prefix}-email-display`).textContent = candidate.email || '—';

    // Conic gradient ring matching match score
    const ring = document.getElementById(`${prefix}-donut-ring`);
    if (ring) {
        const score = candidate.overall_score;
        const color = candidate.is_recommended ? '#10b981' : '#6366f1';
        ring.style.background = `conic-gradient(${color} 0deg ${score * 3.6}deg, rgba(255,255,255,0.08) ${score * 3.6}deg 360deg)`;
        ring.style.boxShadow = candidate.is_recommended ? '0 0 30px rgba(16,185,129,0.35)' : '0 0 20px rgba(99,102,241,0.2)';
    }

    // Recommendation Badge
    const recBadgeEl = document.getElementById(`${prefix}-rec-badge`);
    if (recBadgeEl) {
        if (candidate.is_recommended) {
            recBadgeEl.innerHTML = `<span class="rec-badge-winner"><i class="fa-solid fa-trophy"></i> BETTER MATCH / RECOMMENDED</span>`;
        } else {
            recBadgeEl.innerHTML = `<span style="font-size:0.75rem;color:var(--text-muted);margin-top:12px;display:inline-block;">Alternative Candidate</span>`;
        }
    }
}

function renderCategoryBlock(prefix, candidateName, criterion, catType) {
    const nameEl = document.getElementById(`${prefix.split('-')[0]}-name-${prefix.split('-')[1]}`);
    const statusEl = document.getElementById(`${prefix}-status`);
    const barEl = document.getElementById(`${prefix}-bar`);
    const descEl = document.getElementById(`${prefix}-desc`);

    if (nameEl) nameEl.textContent = candidateName;

    if (statusEl) {
        statusEl.textContent = `${criterion.status} (${criterion.score}%)`;
        statusEl.className = `crit-status-tag ${getCategoryStatusColorClass(criterion.score)}`;
    }

    if (barEl) {
        barEl.style.width = `${criterion.score}%`;
    }

    if (descEl) {
        descEl.textContent = criterion.details;
    }
}

function renderSkillBadges(containerId, skillsCriterion) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const matched = skillsCriterion.matched_skills || [];
    const missing = skillsCriterion.missing_skills || [];

    let html = '';
    matched.forEach(s => {
        html += `<span class="badge badge-success" style="margin-right:6px;margin-bottom:6px;"><i class="fa-solid fa-check"></i> ${escapeHtml(s)}</span>`;
    });
    missing.forEach(s => {
        html += `<span class="badge" style="background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);margin-right:6px;margin-bottom:6px;"><i class="fa-solid fa-xmark"></i> ${escapeHtml(s)}</span>`;
    });

    container.innerHTML = html || '<span style="font-size:0.78rem;color:var(--text-muted);">No specific skill tags extracted</span>';
}

function getCategoryStatusColorClass(score) {
    if (score >= 80) return 'cat-03'; // Teal
    if (score >= 65) return 'cat-02'; // Orange
    return 'cat-01'; // Red
}
