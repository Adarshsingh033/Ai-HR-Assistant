/* ========================================================
   admin/profile.js – Admin Profile Module Logic
   ======================================================== */

let currentAdminProfile = null;
let updatedProfileImageBase64 = null;

window.addEventListener('DOMContentLoaded', async () => {
    await loadAdminProfile();
});

/* Fetch Admin Profile from Database */
async function loadAdminProfile() {
    try {
        const data = await apiRequest('GET', '/api/admin/profile');
        if (data) {
            currentAdminProfile = data;
            renderAdminProfile(data);
        }
    } catch (err) {
        console.warn('Failed to load profile from API, fallback to session data:', err);
        const session = Session.get();
        if (session) {
            renderAdminProfile({
                full_name: session.username || 'Admin',
                username: session.username || 'admin',
                email: `${(session.username || 'admin').toLowerCase().replace(/\s+/g, '')}@example.com`,
                phone: session.phone || '',
                profile_image: session.profile_image || ''
            });
        }
    }
}

/* Render Admin Profile Data onto UI */
function renderAdminProfile(data) {
    const fullName = data.full_name || data.username || 'Admin';
    const username = data.username || 'admin';
    const email = data.email || '';
    const phone = data.phone || '';
    const profileImg = data.profile_image || '';
    const initials = fullName.substring(0, 2).toUpperCase();

    // Sidebar User Chip
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarRole = document.getElementById('sidebar-role');
    const sidebarAvatar = document.getElementById('sidebar-avatar');

    if (sidebarName) sidebarName.textContent = fullName;
    if (sidebarRole) sidebarRole.textContent = 'Admin';
    if (sidebarAvatar) {
        if (profileImg) {
            sidebarAvatar.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            sidebarAvatar.textContent = initials;
        }
    }

    // Profile Left Card
    const cardName = document.getElementById('profile-card-name');
    const cardEmail = document.getElementById('profile-card-email');
    const avatarLarge = document.getElementById('profile-avatar-large');

    if (cardName) cardName.textContent = fullName;
    if (cardEmail) cardEmail.textContent = email;
    if (avatarLarge) {
        if (profileImg) {
            avatarLarge.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            avatarLarge.textContent = initials;
        }
    }

    // Profile Form Inputs
    const fullNameInput = document.getElementById('profile-full-name');
    const usernameInput = document.getElementById('profile-username');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');

    if (fullNameInput) fullNameInput.value = fullName;
    if (usernameInput) usernameInput.value = username;
    if (emailInput) emailInput.value = email;
    if (phoneInput) phoneInput.value = phone;

    // Profile Image Circle Preview
    const circlePreview = document.getElementById('profile-circle-preview');
    if (circlePreview) {
        if (profileImg) {
            circlePreview.innerHTML = `<img src="${profileImg}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
        } else {
            circlePreview.innerHTML = initials;
        }
    }
}

/* Handle Image File Selection in Profile */
function onProfileImageFileChange(event) {
    const file = event.target.files[0];
    const circlePreview = document.getElementById('profile-circle-preview');
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image size exceeds 2MB limit.', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            updatedProfileImageBase64 = e.target.result;
            if (circlePreview) {
                circlePreview.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
            }
        };
        reader.readAsDataURL(file);
    }
}

/* Save Changes button handler */
async function handleSaveProfile(e) {
    e.preventDefault();

    const fullName = document.getElementById('profile-full-name')?.value.trim();
    const username = document.getElementById('profile-username')?.value.trim();
    const email = document.getElementById('profile-email')?.value.trim();
    const phone = document.getElementById('profile-phone')?.value.trim() || '';

    if (!fullName || !username || !email) {
        showToast('Full Name, Username, and Email Address are required.', 'error');
        return;
    }

    const btn = document.getElementById('save-profile-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    try {
        const payload = {
            full_name: fullName,
            username: username,
            email: email,
            phone: phone,
        };

        if (updatedProfileImageBase64 !== null) {
            payload.profile_image = updatedProfileImageBase64;
        }

        const data = await apiRequest('PUT', '/api/admin/profile', payload);
        if (data) {
            currentAdminProfile = data;
            renderAdminProfile(data);

            // Update session data
            Session.set({
                user_id: data.user_id,
                username: data.username,
                role: data.role,
                phone: data.phone,
                profile_image: data.profile_image
            });

            showToast('Profile updated successfully!', 'success');
        }
    } catch (err) {
        showToast(err.message || 'Failed to update profile.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    }
}

/* Toggle Password Visibility (Eye Icon) */
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

/* Handle Change Admin Password */
async function handleChangePassword(e) {
    e.preventDefault();

    const oldPassword = document.getElementById('profile-old-password')?.value.trim();
    const newPassword = document.getElementById('profile-new-password')?.value.trim();
    const confirmPassword = document.getElementById('profile-confirm-password')?.value.trim();

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

    const btn = document.getElementById('change-password-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving Password...';
    }

    try {
        const payload = {
            old_password: oldPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
        };

        const res = await apiRequest('PUT', '/api/admin/change-password', payload);
        showToast(res.message || 'Password updated successfully!', 'success');

        // Reset password fields
        const oldInput = document.getElementById('profile-old-password');
        const newInput = document.getElementById('profile-new-password');
        const confirmInput = document.getElementById('profile-confirm-password');

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

