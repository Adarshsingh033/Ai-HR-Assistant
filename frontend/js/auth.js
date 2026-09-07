/* ========================================================
   auth.js – Unified Login Page Logic for AI HR Assistant
   ======================================================== */

/* Redirect if already logged in or clear form inputs */
window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (session?.role === 'super_admin') location.href = '/super_admin/dashboard.html';
    else if (session?.role === 'admin') location.href = '/admin/dashboard.html';
    else if (session?.role === 'hr') location.href = '/hr/dashboard.html';

    // Clear any browser pre-filled credentials
    const form = document.getElementById('login-form');
    if (form) form.reset();
    const u = document.getElementById('username');
    const p = document.getElementById('password');
    if (u) u.value = '';
    if (p) p.value = '';
});

/* Password visibility toggle */
function togglePassword() {
    const input = document.getElementById('password');
    const btn = document.getElementById('pwd-toggle');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
}

/* Error & Success display */
function showError(msg) {
    hideSuccess();
    const el = document.getElementById('error-msg');
    if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
}

function hideError() {
    const el = document.getElementById('error-msg');
    if (el) el.classList.add('hidden');
}

function showSuccess(msgHtml) {
    hideError();
    const el = document.getElementById('success-msg');
    if (el) {
        el.innerHTML = msgHtml;
        el.classList.remove('hidden');
    }
}

function hideSuccess() {
    const el = document.getElementById('success-msg');
    if (el) el.classList.add('hidden');
}

/* Unified Login submit */
async function handleLogin(e) {
    e.preventDefault();
    hideError();
    hideSuccess();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const btn = document.getElementById('login-btn');

    if (!username || !password) {
        showError('Please enter both username and password.');
        return;
    }

    setLoading(btn, true);

    try {
        const data = await apiRequest('POST', '/api/auth/login', { username, password });

        if (data.success) {
            Session.set({
                user_id: data.user_id,
                username: data.username,
                role: data.role,
                org_id: data.org_id || '',
                phone: data.phone || '',
                profile_image: data.profile_image || ''
            });

            // Display green banner & toast notification with strictly "Login Successful!"
            showSuccess(`<i class="fa-solid fa-circle-check" style="font-size: 1.2rem; color: #10b981;"></i> <span>Login Successful!</span>`);
            showToast(`Login Successful!`, 'success', 3500);

            setTimeout(() => {
                if (data.role === 'super_admin') {
                    location.href = '/super_admin/dashboard.html';
                } else if (data.role === 'admin') {
                    location.href = '/admin/dashboard.html';
                } else {
                    location.href = '/hr/dashboard.html';
                }
            }, 1200);
        }
    } catch (err) {
        showError(err.message || 'Invalid username or password.');
        setLoading(btn, false);
    }
}

/* ========================================================
   Forgot Password Logic
   ======================================================== */
let fpEmailAddress = '';

function openForgotPasswordModal() {
    console.log("openForgotPasswordModal triggered");
    try {
        const form = document.getElementById('fp-email-form');
        if (form) form.reset();
        
        const modal = document.getElementById('fp-email-modal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            console.error("fp-email-modal not found in DOM");
            alert("Error: Modal not found in HTML. Did you hard refresh?");
        }
    } catch (e) {
        console.error("Error in openForgotPasswordModal:", e);
        alert("Error opening modal: " + e.message);
    }
}

function closeFpModal(id) {
    document.getElementById(id).style.display = 'none';
}

async function handleFpEmailSubmit(e) {
    e.preventDefault();
    console.log("handleFpEmailSubmit triggered");
    
    const emailInput = document.getElementById('fp-email');
    if (!emailInput) {
        console.error("fp-email input not found");
        return;
    }
    
    const email = emailInput.value.trim();
    console.log("Email entered:", email);
    if (!email) return;

    const btn = document.getElementById('fp-email-btn');
    if (btn) setLoading(btn, true);

    try {
        console.log("Making API request to /api/auth/forgot-password...");
        const data = await apiRequest('POST', '/api/auth/forgot-password', { email });
        console.log("API response received:", data);
        
        if (data.success) {
            fpEmailAddress = email;
            closeFpModal('fp-email-modal');
            const otpForm = document.getElementById('fp-otp-form');
            if (otpForm) otpForm.reset();
            const otpModal = document.getElementById('fp-otp-modal');
            if (otpModal) otpModal.style.display = 'flex';
            showToast('OTP is sent to the email (1234)', 'success', 4000);
        }
    } catch (err) {
        console.error("API error:", err);
        showToast(err.message || 'Email not found', 'error');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

function handleFpOtpSubmit(e) {
    e.preventDefault();
    const otp = document.getElementById('fp-otp-input').value.trim();
    if (otp === '1234') {
        closeFpModal('fp-otp-modal');
        document.getElementById('fp-reset-form').reset();
        document.getElementById('fp-reset-modal').style.display = 'flex';
    } else {
        showToast('Invalid OTP. Please try again.', 'error');
    }
}

async function handleFpResetSubmit(e) {
    e.preventDefault();
    const newPwd = document.getElementById('fp-new-pwd').value;
    const confirmPwd = document.getElementById('fp-confirm-pwd').value;

    if (newPwd !== confirmPwd) {
        showToast('Passwords do not match', 'error');
        return;
    }

    const btn = document.getElementById('fp-reset-btn');
    setLoading(btn, true);

    try {
        const data = await apiRequest('POST', '/api/auth/reset-password', { 
            email: fpEmailAddress, 
            new_password: newPwd 
        });
        
        if (data.success) {
            closeFpModal('fp-reset-modal');
            showToast('Password reset successfully. You can now log in.', 'success', 4000);
            
            // pre-fill the email for convenience
            document.getElementById('username').value = fpEmailAddress;
        }
    } catch (err) {
        showToast(err.message || 'Failed to reset password', 'error');
    } finally {
        setLoading(btn, false);
    }
}
