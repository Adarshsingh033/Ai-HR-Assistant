document.addEventListener('DOMContentLoaded', () => {
    const user = Session.get();
    if (!user || user.role !== 'hr') {
        location.href = '../index.html';
        return;
    }
    
    // Set user details in sidebar
    syncHRSidebarFromSession();

    // Initialize UI
    initMailingUI();
    
    // Handle URL Params for quick compose (e.g. from Candidates or Screening)
    handleUrlParams();
});

let currentFolder = 'inbox';
let emailsData = [];

function initMailingUI() {
    // Event listeners for folders
    document.querySelectorAll('.mail-folder').forEach(el => {
        el.addEventListener('click', (e) => {
            document.querySelectorAll('.mail-folder').forEach(f => f.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            
            currentFolder = target.dataset.folder;
            document.getElementById('current-folder-title').innerText = target.querySelector('.folder-name').innerText;
            
            // Hide compose, show list
            document.getElementById('compose-view').classList.add('hidden');
            document.getElementById('email-list-view').classList.remove('hidden');
            document.getElementById('email-detail-view').classList.add('hidden');
            
            loadEmails(currentFolder);
        });
    });

    // Default load inbox
    loadEmails('inbox');
}

async function loadEmails(folder) {
    const listContainer = document.getElementById('email-list-container');
    listContainer.innerHTML = `
        <div class="flex-center" style="padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-circle-notch fa-spin fa-2x"></i>
        </div>
    `;
    
    try {
        const user = Session.get();
        const response = await fetch(`${API}/api/emails?hr_id=${user.user_id}&folder=${folder}`);
        if (!response.ok) throw new Error("Failed to fetch emails.");
        
        emailsData = await response.json();
        
        if (emailsData.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h3>Nothing to see here</h3>
                    <p>Your ${folder} folder is empty.</p>
                </div>
            `;
            return;
        }
        
        listContainer.innerHTML = '';
        emailsData.forEach(email => {
            const dateObj = new Date(email.updated_at || email.sent_at || Date.now());
            const isToday = dateObj.toDateString() === new Date().toDateString();
            const timeStr = isToday ? 
                dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
                dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                
            const starClass = email.is_starred ? 'fa-solid fa-star text-warning' : 'fa-regular fa-star';
            
            const emailRow = document.createElement('div');
            emailRow.className = `email-row`;
            emailRow.innerHTML = `
                <div class="email-star" onclick="toggleStar(event, '${email.id}', ${!email.is_starred})">
                    <i class="${starClass}"></i>
                </div>
                <div class="email-sender">${folder === 'sent' ? `To: ${email.to_email}` : (email.from_email || email.to_email)}</div>
                <div class="email-subject-snippet">
                    <span class="email-subject">${email.subject || '(No Subject)'}</span>
                    <span class="email-snippet"> - ${email.body.substring(0, 50).replace(/\n/g, ' ')}...</span>
                </div>
                <div class="email-time">${timeStr}</div>
            `;
            
            emailRow.onclick = () => viewEmailDetail(email.id);
            listContainer.appendChild(emailRow);
        });
        
    } catch (error) {
        console.error(error);
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation text-danger" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Failed to load emails.</p>
            </div>
        `;
    }
}

async function toggleStar(event, emailId, newState) {
    event.stopPropagation();
    const targetElement = event.currentTarget;
    try {
        const user = Session.get();
        const response = await fetch(`${API}/api/emails/${emailId}/star?hr_id=${user.user_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_starred: newState })
        });
        if (!response.ok) throw new Error("Failed to star email.");
        
        // Optimistic UI update
        const starIcon = targetElement.querySelector('i');
        if (newState) {
            starIcon.className = 'fa-solid fa-star text-warning';
        } else {
            starIcon.className = 'fa-regular fa-star';
        }
        
        // If in starred folder, remove from view
        if (currentFolder === 'starred' && !newState) {
            targetElement.closest('.email-row').remove();
            if (document.querySelectorAll('.email-row').length === 0) {
                loadEmails('starred');
            }
        }
        
    } catch (error) {
        showToast(error.message, "error");
    }
}

function viewEmailDetail(emailId) {
    const email = emailsData.find(e => e.id === emailId);
    if (!email) return;
    
    document.getElementById('email-detail-view').dataset.emailId = emailId;
    
    document.getElementById('email-list-view').classList.add('hidden');
    const detailView = document.getElementById('email-detail-view');
    detailView.classList.remove('hidden');
    
    document.getElementById('detail-subject').innerText = email.subject || '(No Subject)';
    document.getElementById('detail-from').innerText = email.from_email || email.to_email;
    document.getElementById('detail-to').innerText = email.to_email;
    
    const dateObj = new Date(email.updated_at || email.sent_at || Date.now());
    document.getElementById('detail-time').innerText = dateObj.toLocaleString();
    
    document.getElementById('detail-body').innerText = email.body;
}

function backToList() {
    document.getElementById('email-detail-view').classList.add('hidden');
    document.getElementById('compose-view').classList.add('hidden');
    document.getElementById('email-list-view').classList.remove('hidden');
}

function openCompose() {
    // Unselect folders
    document.querySelectorAll('.mail-folder').forEach(f => f.classList.remove('active'));
    document.getElementById('current-folder-title').innerText = "New Message";
    
    document.getElementById('email-list-view').classList.add('hidden');
    document.getElementById('email-detail-view').classList.add('hidden');
    document.getElementById('compose-view').classList.remove('hidden');
    
    // Clear form
    document.getElementById('compose-to').value = '';
    document.getElementById('compose-cc').value = '';
    document.getElementById('compose-bcc').value = '';
    document.getElementById('compose-subject').value = '';
    document.getElementById('compose-body').value = '';
    document.getElementById('ai-prompt').value = '';
    document.getElementById('hidden-candidate-id').value = '';
    
    const draftIdEl = document.getElementById('hidden-draft-id');
    if (draftIdEl) draftIdEl.value = '';
}

async function generateDraft() {
    const prompt = document.getElementById('ai-prompt').value.trim();
    const candidateId = document.getElementById('hidden-candidate-id').value.trim();

    if (!prompt) {
        showToast("Please enter a prompt for the AI.", "warning");
        return;
    }

    const btn = document.getElementById('btn-ai-draft');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';
    btn.disabled = true;

    try {
        const user = Session.get();
        const response = await fetch(`${API}/api/emails/draft?hr_id=${user.user_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                candidate_id: candidateId || null
            })
        });

        if (!response.ok) throw new Error("Failed to generate draft.");

        const data = await response.json();
        document.getElementById('compose-subject').value = data.subject || '';
        document.getElementById('compose-body').value = data.body || '';
        showToast("Draft generated successfully!", "success");
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function sendEmail() {
    const to = document.getElementById('compose-to').value.trim();
    const cc = document.getElementById('compose-cc').value.trim();
    const bcc = document.getElementById('compose-bcc').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const body = document.getElementById('compose-body').value.trim();
    const candidateId = document.getElementById('hidden-candidate-id').value.trim();
    const draftId = document.getElementById('hidden-draft-id') ? document.getElementById('hidden-draft-id').value.trim() : '';

    if (!to || !subject || !body) {
        showToast("Please fill in To, Subject, and Body.", "warning");
        return;
    }

    const btn = document.getElementById('btn-send');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...';
    btn.disabled = true;

    try {
        const user = Session.get();
        const response = await fetch(`${API}/api/emails/send?hr_id=${user.user_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to_email: to,
                candidate_id: candidateId || null,
                cc_emails: cc,
                bcc_emails: bcc,
                subject: subject,
                body: body,
                draft_id: draftId || null
            })
        });

        if (!response.ok) throw new Error("Failed to send email.");

        showToast("Email sent successfully!", "success");
        
        // Go back to sent folder
        document.querySelector('[data-folder="sent"]').click();
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function handleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const toEmail = urlParams.get('to');
    const candidateId = urlParams.get('candidate_id');
    const source = urlParams.get('source'); // 'candidates' or 'screening'
    const status = urlParams.get('status');
    const candidateName = urlParams.get('name');
    const roundTitle = urlParams.get('round');

    if (toEmail || candidateId) {
        openCompose();
        document.getElementById('compose-to').value = toEmail || '';
        document.getElementById('hidden-candidate-id').value = candidateId || '';
        
        if (source === 'candidates') {
            const user = Session.get();
            document.getElementById('compose-subject').value = `Update on your application`;
            document.getElementById('compose-body').value = `Dear ${candidateName || 'Candidate'},\n\nThank you for applying to our organization. We have reviewed your profile and would like to reach out to you regarding the next steps in our hiring process.\n\nWe will be in touch shortly with more details.\n\nBest Regards,\n${user.full_name || 'HR Professional'}\nAI HR Assistant Team`;
        } 
        else if (source === 'screening') {
            let promptText = "Draft a professional email to the candidate.";
            if (status) {
                if (status === 'Passed') {
                    if (roundTitle) {
                        promptText = `Write a professional email informing the candidate that they have successfully cleared all their interview rounds, including the final '${roundTitle}'.`;
                    } else {
                        promptText = "Write a professional email informing the candidate that they have successfully cleared all their interview rounds and will be moving forward in the process.";
                    }
                } else if (status === 'Ongoing') {
                    if (roundTitle) {
                        promptText = `Write a professional email informing the candidate that they have successfully cleared their previous round and will now be moving forward to the '${roundTitle}'.`;
                    } else {
                        promptText = "Write a professional email informing the candidate about their upcoming interview round.";
                    }
                } else if (status === 'Rejected') {
                    if (roundTitle) {
                        promptText = `Write a professional, polite rejection email informing the candidate that we will not be moving forward with their application following their performance in the '${roundTitle}'.`;
                    } else {
                        promptText = "Write a professional, polite rejection email informing the candidate that we will not be moving forward with their application at this time.";
                    }
                } else if (status === 'On Hold') {
                    promptText = "Write a professional email informing the candidate that their application is currently on hold, and we will get back to them with an update soon.";
                }
            }
            document.getElementById('ai-prompt').value = promptText;
            // Auto generate draft
            generateDraft();
        }
    }
}
