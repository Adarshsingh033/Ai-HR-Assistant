/* ========================================================
   admin/change_password.js – Admin Change Password Page Logic
   ======================================================== */

/* Toggle Password Input Visibility (Eye Icon) */
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.className = 'fa-regular fa-eye-slash';
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.className = 'fa-regular fa-eye';
        }
    }
}

/* Handle Change Admin Password Form Submit */
async function handleChangePassword(e) {
    e.preventDefault();

    const oldPassword = document.getElementById('old-password')?.value.trim();
    const newPassword = document.getElementById('new-password')?.value.trim();
    const confirmPassword = document.getElementById('confirm-password')?.value.trim();

    if (!oldPassword || !newPassword || !confirmPassword) {
        showToast('Please fill in Old Password, New Password, and Confirm Password.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('New password and Confirm password do not match.', 'error');
        return;
    }

    if (oldPassword === newPassword) {
        showToast('New password cannot be the same as your old password.', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters long.', 'error');
        return;
    }

    const btn = document.getElementById('save-password-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    try {
        const payload = {
            old_password: oldPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
        };

        const res = await apiRequest('PUT', '/api/admin/change-password', payload);
        showToast(res.message || 'Password changed successfully!', 'success');

        // Clear input fields
        const oldInput = document.getElementById('old-password');
        const newInput = document.getElementById('new-password');
        const confirmInput = document.getElementById('confirm-password');

        if (oldInput) oldInput.value = '';
        if (newInput) newInput.value = '';
        if (confirmInput) confirmInput.value = '';
    } catch (err) {
        showToast(err.message || 'Failed to change password.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Password';
        }
    }
}
