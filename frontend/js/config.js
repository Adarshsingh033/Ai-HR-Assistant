/* ========================================================
   config.js – Frontend Environment & Static Configurations
   ========================================================
   Centralized location for static constants like API Base URL.
   If the backend URL or port changes, update API_BASE_URL here.
   ======================================================== */

window.CONFIG = {
    // Backend Base API URL
    // Examples: 'http://localhost:8000', 'http://127.0.0.1:8000', 'https://api.yourdomain.com'
    // Set to '' (empty string) to auto-detect from browser origin
    API_BASE_URL: 'http://localhost:8000',

    // Application Metadata
    APP_NAME: 'AI HR Assistant',
    APP_VERSION: '1.0.0',

    // UI & Pagination Defaults
    DEFAULT_PAGE_SIZE: 10,
    TOAST_DURATION_MS: 3500
};

// Global Alias for ENV
window.ENV = window.CONFIG;
