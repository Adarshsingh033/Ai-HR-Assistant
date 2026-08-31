/* ========================================================
   auth.js – Login page logic
   ======================================================== */

let selectedRole = 'admin';

/* Redirect if already logged in */
window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (session?.role === 'admin') location.href = '/admin/dashboard.html';
    else if (session?.role === 'hr') location.href = '/hr/dashboard.html';
});

/* Role tab switcher */
function setRole(role) {
    selectedRole = role;
    document.getElementById('tab-admin').classList.toggle('active', role === 'admin');
    document.getElementById('tab-hr').classList.toggle('active', role === 'hr');

    const hint = document.getElementById('cred-hint');
    if (role === 'admin') {
        hint.innerHTML = '<strong>Admin Default:</strong> username: <strong>admin</strong> / password: <strong>admin123</strong>';
        hint.classList.remove('hidden');
    } else {
        hint.innerHTML = '<i class="fa-solid fa-key"></i> Use the HR credentials created by your Admin.';
        hint.classList.remove('hidden');
    }

    // Clear inputs
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    hideError();
}

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
    document.getElementById('error-msg').classList.add('hidden');
}

/* Login submit */
async function handleLogin(e) {
    e.preventDefault();
    hideError();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const btn = document.getElementById('login-btn');

    if (!username || !password) {
        showError('Please enter username and password.');
        return;
    }

    setLoading(btn, true);

    try {
        const data = await apiRequest('POST', '/api/auth/login', { username, password });

        if (data.success) {
            // Validate role matches tab selection
            if (data.role !== selectedRole) {
                showError(`This account is not an ${selectedRole.toUpperCase()} account.`);
                setLoading(btn, false);
                return;
            }

            Session.set({
                user_id: data.user_id,
                username: data.username,
                role: data.role,
                org_id: data.org_id || '',
            });

            showToast(`Welcome, ${data.username}! `, 'success');

            setTimeout(() => {
                if (data.role === 'admin') {
                    location.href = '/admin/dashboard.html';
                } else {
                    location.href = '/hr/dashboard.html';
                }
            }, 800);
        }
    } catch (err) {
        showError(err.message || 'Login failed. Check credentials and try again.');
        setLoading(btn, false);
    }
}
