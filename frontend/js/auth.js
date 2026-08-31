/* ========================================================
   auth.js – Unified Login Page Logic for AI HR Assistant
   ======================================================== */

/* Redirect if already logged in */
window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (session?.role === 'admin') location.href = '/admin/dashboard.html';
    else if (session?.role === 'hr') location.href = '/hr/dashboard.html';
});

/* Password visibility toggle */
function togglePassword() {
    const input = document.getElementById('password');
    const btn = document.getElementById('pwd-toggle');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
}

/* Error display */
function showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function hideError() {
    const el = document.getElementById('error-msg');
    if (el) el.classList.add('hidden');
}

/* Unified Login submit */
async function handleLogin(e) {
    e.preventDefault();
    hideError();

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
            });

            showToast(`Welcome back, ${data.username}!`, 'success');

            setTimeout(() => {
                if (data.role === 'admin') {
                    location.href = '/admin/dashboard.html';
                } else {
                    location.href = '/hr/dashboard.html';
                }
            }, 600);
        }
    } catch (err) {
        showError(err.message || 'Invalid username or password.');
        setLoading(btn, false);
    }
}
