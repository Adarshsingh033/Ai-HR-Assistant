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
    btn.innerHTML = isHidden ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
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
        text.innerHTML = 'Register';
    }
}

let profileImageBase64 = null;

function previewRegisterAvatar(event) {
    const file = event.target.files[0];
    const previewEl = document.getElementById('avatar-circle-preview');
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            showError('Image size exceeds 2MB limit.');
            event.target.value = '';
            profileImageBase64 = null;
            if (previewEl) previewEl.innerHTML = '<i class="fa-solid fa-camera"></i>';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            profileImageBase64 = e.target.result;
            if (previewEl) {
                previewEl.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
            }
        };
        reader.readAsDataURL(file);
    } else {
        profileImageBase64 = null;
        if (previewEl) previewEl.innerHTML = '<i class="fa-solid fa-camera"></i>';
    }
}

/* Main submit handler */
async function handleRegister(e) {
    e.preventDefault();
    hideError();

    const fullName = document.getElementById('full-name').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone')?.value.trim() || null;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Client-side validation
    if (!fullName || !username || !email || !password || !confirmPassword) {
        showError('Please fill in all required fields.');
        return;
    }

    if (username.length < 3) {
        showError('Username must be at least 3 characters long.');
        return;
    }

    if (phone && !/^\d{10}$/.test(phone)) {
        showError('Phone number must be exactly 10 digits.');
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
            phone: phone,
            profile_image: profileImageBase64,
            password: password,
            confirm_password: confirmPassword,
        });

        if (data.success) {
            // Store admin session metadata directly for auto-login
            Session.set({
                user_id: data.admin.id,
                username: data.admin.username,
                role: 'admin',
                org_id: '',
                phone: data.admin.phone || '',
                profile_image: data.admin.profile_image || ''
            });

            showToast(`Registration Successful!`, 'success', 2500);
            setTimeout(() => {
                location.href = '/admin/dashboard.html';
            }, 1000);
        }
    } catch (err) {
        // Parse FastAPI validation errors
        const msg = err.message || 'Registration failed. Please try again.';
        showError(msg);
        setRegLoading(false);
    }
}
