/* ========================================================
   interviewer_interview.js – Interview Evaluation Flow
   ======================================================== */

let assignmentId = null;
let currentAssignment = null;

window.addEventListener('DOMContentLoaded', async () => {
    // Auth check happens in interviewer_common.js

    const params = new URLSearchParams(window.location.search);
    assignmentId = params.get('id');

    if (!assignmentId) {
        showToast('Invalid assignment ID', 'error');
        setTimeout(() => location.href = 'my_interviewees.html', 1500);
        return;
    }

    await loadAssignmentDetails();
});

async function loadAssignmentDetails() {
    try {
        currentAssignment = await apiRequest('GET', `/api/interviewer/my-interviewees/${assignmentId}`);
        
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('eval-content').style.display = 'block';

        populateUI();
    } catch (e) {
        showToast('Failed to load interview details: ' + e.message, 'error');
        document.getElementById('loading-state').innerHTML = `<div style="color:#ef4444;">Error loading interview details.</div>`;
    }
}

function populateUI() {
    const c = currentAssignment.candidate;
    const j = currentAssignment.job;
    const r = currentAssignment.round;

    document.getElementById('cand-name').textContent = c.name;
    document.getElementById('cand-job').textContent = j.job_title;
    document.getElementById('cand-round').textContent = r.round_step;
    document.getElementById('cand-email').textContent = c.email;
    document.getElementById('cand-match').textContent = `${c.ats_score}% Match`;

    const skillsBox = document.getElementById('cand-skills');
    if (c.skills && c.skills.length > 0) {
        skillsBox.innerHTML = c.skills.map(s => 
            `<span style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:4px 10px; border-radius:8px; font-size:0.75rem; color:#e2e8f0;">${escapeHtml(s)}</span>`
        ).join('');
    } else {
        skillsBox.innerHTML = '<span style="color:var(--text-muted); font-size:0.8rem;">No skills listed</span>';
    }

    // Resume button
    if (c.filename) {
        const btnResume = document.getElementById('btn-resume');
        btnResume.style.display = 'inline-flex';
        btnResume.onclick = (e) => {
            e.preventDefault();
            downloadResume();
        };
    }

    // Existing evaluation
    if (currentAssignment.rating) {
        document.getElementById('eval-rating').value = currentAssignment.rating;
    }
    if (currentAssignment.feedback) {
        document.getElementById('eval-feedback').value = currentAssignment.feedback;
    }
    if (currentAssignment.status) {
        document.querySelectorAll('.status-radio input').forEach(rad => {
            if (rad.value === currentAssignment.status) {
                rad.checked = true;
                updateRadioSelection(rad);
            }
        });
    }

    // Questions
    if (currentAssignment.questions && currentAssignment.questions.length > 0) {
        renderQuestions(currentAssignment.questions);
    }
}

function updateRadioSelection(radioInput) {
    document.querySelectorAll('.status-radio').forEach(el => el.classList.remove('selected'));
    radioInput.closest('.status-radio').classList.add('selected');
}

async function downloadResume() {
    const btn = document.getElementById('btn-resume');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
    
    try {
        const session = Session.get();
        const headers = {};
        if (session && session.id) headers['X-Admin-ID'] = session.id;

        const baseUrl = typeof API !== 'undefined' ? API : 'http://localhost:8000';
        const url = `${baseUrl}/api/interviewer/assignments/${assignmentId}/resume`;
        
        const response = await fetch(url, { headers });
        if (!response.ok) {
            let errorText = 'Failed to download resume';
            try {
                const errJson = await response.json();
                errorText = errJson.detail || errorText;
            } catch (e) {}
            throw new Error(errorText);
        }

        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        
        // Open in new tab
        window.open(objectUrl, '_blank');
        
        // Optional: clear the object URL after a while to free memory
        setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);

    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.innerHTML = origHtml;
    }
}

async function generateQuestions() {
    const btn = document.getElementById('btn-generate-q');
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

    try {
        const data = await apiRequest('POST', `/api/interviewer/assignments/${assignmentId}/generate-questions`);
        if (data && data.questions) {
            renderQuestions(data.questions);
            showToast('Interview questions generated successfully', 'success');
        }
    } catch (e) {
        showToast('Failed to generate questions: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
    }
}

function renderQuestions(questions) {
    const list = document.getElementById('questions-list');
    
    if (!questions || questions.length === 0) {
        list.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:20px 0;">No questions available. Click generate.</div>`;
        return;
    }

    list.innerHTML = questions.map((q, i) => {
        return `
        <div class="question-item">
            <div style="display:flex;">
                <span class="q-num">Q${i+1}.</span>
                <span class="q-text">${escapeHtml(q)}</span>
            </div>
        </div>`;
    }).join('');
}

async function submitEvaluation(event) {
    event.preventDefault();

    const ratingVal = document.getElementById('eval-rating').value;
    const feedbackVal = document.getElementById('eval-feedback').value.trim();
    const isDone = document.getElementById('eval-is-done').checked;
    
    let statusVal = 'Ongoing';
    document.querySelectorAll('.status-radio input').forEach(rad => {
        if (rad.checked) statusVal = rad.value;
    });

    if (!ratingVal) {
        showToast('Please select a rating.', 'error');
        return;
    }
    if (!feedbackVal) {
        showToast('Please provide feedback.', 'error');
        return;
    }

    const payload = {
        status: statusVal,
        rating: parseInt(ratingVal, 10),
        feedback: feedbackVal,
        is_done: isDone
    };

    const btn = document.getElementById('submit-btn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

    try {
        await apiRequest('POST', `/api/interviewer/assignments/${assignmentId}/submit`, payload);
        
        showToast('Evaluation submitted successfully!', 'success');
        
        if (isDone) {
            setTimeout(() => location.href = 'my_interviewees.html', 1500);
        } else {
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    } catch (e) {
        showToast('Failed to submit evaluation: ' + e.message, 'error');
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}
