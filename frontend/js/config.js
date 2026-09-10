/* ========================================================
   config.js – Dynamic Frontend Environment & Configuration
   ======================================================== */

// Default configuration with dynamic origin auto-detection
window.CONFIG = {
    // Backend Base API URL:
    // Automatically uses browser origin (e.g., https://hr.yourdomain.com or http://localhost:8002)
    API_BASE_URL: (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http'))
        ? window.location.origin
        : 'http://localhost:8002',

    // Application Metadata
    APP_NAME: 'AI HR Assistant',
    APP_VERSION: '1.0.0',

    // UI & Pagination Defaults
    DEFAULT_PAGE_SIZE: 10,
    TOAST_DURATION_MS: 3500
};

// Global Alias for ENV
window.ENV = window.CONFIG;

// Dynamically attempt to load frontend/.env if hosted
(function loadDynamicFrontendEnv() {
    if (typeof window === 'undefined' || !window.fetch) return;

    // Detect relative root path for frontend/.env
    const isSubfolder = window.location.pathname.includes('/admin/') ||
                        window.location.pathname.includes('/hr/') ||
                        window.location.pathname.includes('/super_admin/');
    const envPath = isSubfolder ? '../.env' : '.env';

    fetch(envPath)
        .then(function(res) {
            if (!res.ok) return null;
            return res.text();
        })
        .then(function(text) {
            if (!text) return;
            var lines = text.split(/\r?\n/);
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.startsWith('#')) continue;
                var eqIdx = line.indexOf('=');
                if (eqIdx !== -1) {
                    var key = line.slice(0, eqIdx).trim();
                    var val = line.slice(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (val !== '') {
                        window.CONFIG[key] = val;
                        window.ENV[key] = val;
                    }
                }
            }
        })
        .catch(function() {
            // Fallback gracefully to dynamic origin
        });
})();

