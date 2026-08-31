/* ========================================================
   register.js – Admin Registration Page Logic
   ======================================================== */

/* Redirect if already logged in */
window.addEventListener('DOMContentLoaded', () => {
    const session = Session.get();
    if (session?.role === 'admin') location.href = '/admin/dashboard.html';
    else if (session?.role === 'hr') location.href = '/hr/dashboard.html';
});

/* Password visibility toggle */
function togglePwd(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
}

/* Password strength indicator */
function updateStrengthBar(value) {
    const bar = document.getElementById('strength-bar');
    let score = 0;
    if (value.length >= 6) score++;
    if (value.length >= 10) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    const widths = ['0%', '20%', '40%', '65%', '85%', '100%'];
    const colors = ['transparent', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981'];

    bar.style.width = widths[score];
    bar.style.background = colors[score];
}

/* Error display helpers */
function showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error-msg').classList.add('hidden');
}

/* Button loading state */
function setRegLoading(loading) {
    const btn = document.getElementById('register-btn');
    const spinner = document.getElementById('reg-spinner');
    const text = document.getElementById('reg-btn-text');
    if (loading) {
        btn.disabled = true;
        spinner.style.display = 'block';
        text.style.opacity = '0.5';
        text.innerHTML = 'Creating Account...';
    } else {
        btn.disabled = false;
        spinner.style.display = 'none';
        text.style.opacity = '1';
        text.innerHTML = '<i class="fa-solid fa-shield"></i> Create Admin Account';
    }
}

/* Main submit handler */
async function handleRegister(e) {
    e.preventDefault();
    hideError();

    const fullName = document.getElementById('full-name').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Client-side validation
    if (!fullName || !username || !email || !password || !confirmPassword) {
        showError('Please fill in all fields.');
        return;
    }

    if (username.length < 3) {
        showError('Username must be at least 3 characters long.');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters long.');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match. Please re-enter.');
        return;
    }

    setRegLoading(true);

    try {
        const data = await apiRequest('POST', '/api/auth/register', {
            full_name: fullName,
            username: username,
            email: email,
            password: password,
            confirm_password: confirmPassword,
        });

        if (data.success) {
            showToast(`<i class="fa-solid fa-circle-check"></i> Account created for "${data.admin.username}"! Redirecting to login...`, 'success', 3000);
            setTimeout(() => {
                location.href = '/index.html';
            }, 2500);
        }
    } catch (err) {
        // Parse FastAPI validation errors
        const msg = err.message || 'Registration failed. Please try again.';
        showError(msg);
        setRegLoading(false);
    }
}
