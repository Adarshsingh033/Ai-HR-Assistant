/* ========================================================
   auth.js – Unified Login Page Logic for AI HR Assistant
   ======================================================== */

/* Redirect if already logged in or clear form inputs */
window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (session?.role === 'admin') location.href = '/admin/dashboard.html';
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
                if (data.role === 'admin') {
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
