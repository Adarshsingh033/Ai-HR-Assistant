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
let fpOtpCode = '';   // stores the OTP returned from the server

function openForgotPasswordModal() {
    const form = document.getElementById('fp-email-form');
    if (form) form.reset();
    document.getElementById('fp-email-modal')?.classList.add('open');
}

function closeFpModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

async function handleFpEmailSubmit(e) {
    e.preventDefault();

    const email = (document.getElementById('fp-email')?.value || '').trim();
    if (!email) return;

    const btn = document.getElementById('fp-email-btn');
    if (btn) setLoading(btn, true);

    try {
        const data = await apiRequest('POST', '/api/auth/forgot-password', { email });

        if (data.success) {
            fpEmailAddress = email;
            fpOtpCode = data.otp || '';   // server returns the OTP

            // Show the OTP email address in the second modal
            const emailDisplay = document.getElementById('fp-otp-email-display');
            if (emailDisplay) emailDisplay.textContent = email;

            closeFpModal('fp-email-modal');
            document.getElementById('fp-otp-form')?.reset();
            document.getElementById('fp-otp-modal')?.classList.add('open');

            const hint = fpOtpCode
                ? `OTP is sent to your email! <strong>${fpOtpCode}</strong>`
                : `OTP is sent to your email! <strong>123456</strong>`;
            showToast(hint, 'success', 6000);
        }
    } catch (err) {
        showToast(err.message || 'No account found with that email.', 'error');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

function handleFpOtpSubmit(e) {
    e.preventDefault();
    const enteredOtp = (document.getElementById('fp-otp-input')?.value || '').trim();

    // Validate against server-returned OTP (or fallback demo OTP)
    const validOtp = fpOtpCode || '123456';
    if (enteredOtp === validOtp) {
        closeFpModal('fp-otp-modal');
        document.getElementById('fp-reset-form')?.reset();
        document.getElementById('fp-reset-modal')?.classList.add('open');
    } else {
        showToast('Invalid code. Please check your email and try again.', 'error');
        document.getElementById('fp-otp-input').value = '';
        document.getElementById('fp-otp-input').focus();
    }
}

async function handleFpResetSubmit(e) {
    e.preventDefault();
    const newPwd = document.getElementById('fp-new-pwd').value;
    const confirmPwd = document.getElementById('fp-confirm-pwd').value;

    if (newPwd.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast('Passwords do not match.', 'error');
        return;
    }

    const btn = document.getElementById('fp-reset-btn');
    if (btn) setLoading(btn, true);

    try {
        const data = await apiRequest('POST', '/api/auth/reset-password', {
            email: fpEmailAddress,
            new_password: newPwd
        });

        if (data.success) {
            closeFpModal('fp-reset-modal');
            showToast('Password reset successfully! You can now sign in.', 'success', 4500);
            // Pre-fill username/email on login form for convenience
            const usernameEl = document.getElementById('username');
            if (usernameEl) usernameEl.value = fpEmailAddress;
            // Reset state
            fpEmailAddress = '';
            fpOtpCode = '';
        }
    } catch (err) {
        showToast(err.message || 'Failed to reset password. Please try again.', 'error');
    } finally {
        if (btn) setLoading(btn, false);
    }
}
