/* ============================================================
   ai_task_manager.js
   Global background AI task manager — works across page navigation,
   refreshes, and network interruptions.

   Usage:
     AITaskManager.submit('jd_generation', payload, {
       onCompleted: (result) => { ... },
       onFailed: (err) => { ... },
       onProgress: (task) => { ... }   // optional polling callback
     });

     // On page load — restore any running task for this feature:
     AITaskManager.restore('jd_generation', 'jd_my_job_key', {
       onCompleted: ..., onFailed: ...
     });

   All running task IDs are persisted to localStorage so they survive
   browser refreshes and page navigation.
   ============================================================ */

const AITaskManager = (() => {
    const LS_KEY = 'ai_hr_tasks';
    const POLL_INTERVAL_MS = 2500;
    const MAX_POLL_DURATION_MS = 15 * 60 * 1000; // 15 minutes max
    const _pollers = {}; // { task_id: intervalId }

    // ── API base URL ────────────────────────────────────────────
    function getAPI() {
        return (typeof API !== 'undefined' ? API : '')
            || `${window.location.protocol}//${window.location.host}`;
    }

    // ── LocalStorage task store ─────────────────────────────────
    function _loadStore() {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
        } catch { return {}; }
    }

    function _saveStore(store) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { }
    }

    function _storeTask(key, taskId, taskType, meta = {}) {
        const store = _loadStore();
        store[key] = {
            task_id: taskId,
            task_type: taskType,
            status: 'pending',
            started_at: Date.now(),
            ...meta
        };
        _saveStore(store);
    }

    function _updateStoredTask(key, updates) {
        const store = _loadStore();
        if (store[key]) Object.assign(store[key], updates);
        _saveStore(store);
    }

    function _removeTask(key) {
        const store = _loadStore();
        delete store[key];
        _saveStore(store);
    }

    function _getTask(key) {
        return _loadStore()[key] || null;
    }

    // ── Polling ─────────────────────────────────────────────────
    async function _pollTask(taskId, key, callbacks = {}) {
        const { onCompleted, onFailed, onProgress } = callbacks;

        if (_pollers[taskId]) return; // Already polling

        const startTime = Date.now();

        const intervalId = setInterval(async () => {
            // Max duration guard
            if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
                clearInterval(intervalId);
                delete _pollers[taskId];
                _updateStoredTask(key, { status: 'failed' });
                if (onFailed) onFailed({ error: 'Task timed out after 15 minutes.' });
                _showToast('AI task timed out. Please try again.', 'error');
                _updateBadge();
                return;
            }

            try {
                const res = await fetch(`${getAPI()}/api/ai-tasks/${taskId}`);
                if (!res.ok) {
                    console.warn('[AITaskManager] Poll error:', res.status);
                    return;
                }
                const task = await res.json();

                if (onProgress) onProgress(task);

                if (task.status === 'completed') {
                    clearInterval(intervalId);
                    delete _pollers[taskId];
                    _updateStoredTask(key, { status: 'completed', result: task.result_data });
                    if (onCompleted) onCompleted(task.result_data, task);
                    _showToast('AI process completed!', 'success');
                    _updateBadge();

                } else if (task.status === 'failed') {
                    clearInterval(intervalId);
                    delete _pollers[taskId];
                    _updateStoredTask(key, { status: 'failed', error: task.error_message });
                    if (onFailed) onFailed({ error: task.error_message });
                    _showToast(`AI process failed: ${task.error_message || 'Unknown error'}`, 'error');
                    _updateBadge();
                }
                // else: still pending/running — keep polling
            } catch (err) {
                console.warn('[AITaskManager] Poll network error:', err);
                // Don't stop polling on network errors — it might recover
            }
        }, POLL_INTERVAL_MS);

        _pollers[taskId] = intervalId;
        _updateBadge();
    }

    // ── Public API ───────────────────────────────────────────────

    /**
     * Submit an AI task and start polling.
     * @param {string} storageKey  - Unique key for localStorage (e.g. 'jd_gen_xyz')
     * @param {string} endpoint    - API endpoint (e.g. '/api/jobs/generate-jd')
     * @param {string} method      - HTTP method (default 'POST')
     * @param {object|FormData} payload - Request body
     * @param {object} callbacks   - { onCompleted, onFailed, onProgress }
     * @returns {Promise<string|null>} task_id or null on error
     */
    async function submit(storageKey, endpoint, payload, callbacks = {}, method = 'POST') {
        try {
            let fetchOpts = { method };
            if (payload instanceof FormData) {
                fetchOpts.body = payload;
            } else {
                fetchOpts.headers = { 'Content-Type': 'application/json' };
                fetchOpts.body = JSON.stringify(payload);
            }

            const res = await fetch(`${getAPI()}${endpoint}`, fetchOpts);
            const data = await res.json();

            if (!res.ok) {
                const err = data.detail || `HTTP ${res.status}`;
                if (callbacks.onFailed) callbacks.onFailed({ error: err });
                _showToast(`Failed to start AI process: ${err}`, 'error');
                return null;
            }

            const taskId = data.task_id;
            if (!taskId) {
                console.error('[AITaskManager] No task_id in response:', data);
                return null;
            }

            _storeTask(storageKey, taskId, data.task_type || 'unknown', {
                endpoint,
                extra: data
            });

            _showToast('AI process started in the background. You can navigate freely!', 'info');
            _pollTask(taskId, storageKey, callbacks);
            _updateBadge();
            return taskId;

        } catch (err) {
            console.error('[AITaskManager] Submit error:', err);
            if (callbacks.onFailed) callbacks.onFailed({ error: err.message });
            _showToast(`Network error: ${err.message}`, 'error');
            return null;
        }
    }

    /**
     * Restore polling for a stored task (call on page load).
     * @param {string} storageKey  - Key used when the task was submitted
     * @param {object} callbacks   - { onCompleted, onFailed, onProgress, onRestored }
     * @returns {object|null} stored task or null
     */
    function restore(storageKey, callbacks = {}) {
        const stored = _getTask(storageKey);
        if (!stored) return null;
        if (!stored.task_id) return null;

        // If already done, fire callbacks immediately
        if (stored.status === 'completed' && stored.result) {
            if (callbacks.onCompleted) callbacks.onCompleted(stored.result, stored);
            if (callbacks.onRestored) callbacks.onRestored(stored);
            return stored;
        }

        if (stored.status === 'failed') {
            if (callbacks.onFailed) callbacks.onFailed({ error: stored.error || 'Task failed' });
            if (callbacks.onRestored) callbacks.onRestored(stored);
            return stored;
        }

        // Still pending/running — resume polling
        if (callbacks.onRestored) callbacks.onRestored(stored);
        _pollTask(stored.task_id, storageKey, callbacks);
        _updateBadge();
        return stored;
    }

    /**
     * Cancel tracking for a task (does not cancel server-side processing).
     */
    function clear(storageKey) {
        const stored = _getTask(storageKey);
        if (stored && _pollers[stored.task_id]) {
            clearInterval(_pollers[stored.task_id]);
            delete _pollers[stored.task_id];
        }
        _removeTask(storageKey);
        _updateBadge();
    }

    /**
     * Get the stored task entry for a key.
     */
    function getStored(storageKey) {
        return _getTask(storageKey);
    }

    /**
     * Returns count of currently actively-polling tasks.
     */
    function activeCount() {
        return Object.keys(_pollers).length;
    }

    // ── Floating Badge UI ────────────────────────────────────────
    function _ensureBadge() {
        if (document.getElementById('ai-task-badge')) return;
        const badge = document.createElement('div');
        badge.id = 'ai-task-badge';
        badge.innerHTML = `
            <div id="ai-task-badge-inner" title="AI Tasks Running" style="
                position:fixed; bottom:24px; right:24px; z-index:99999;
                background:linear-gradient(135deg,#6366f1,#8b5cf6);
                color:#fff; border-radius:50px; padding:10px 18px;
                display:none; align-items:center; gap:9px;
                font-size:0.82rem; font-weight:700;
                box-shadow:0 4px 24px rgba(99,102,241,0.5);
                cursor:pointer; user-select:none;
                animation: aitask-pulse 1.6s ease-in-out infinite;
                font-family:inherit;
            ">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:0.85rem;"></i>
                <span id="ai-task-badge-text">AI Working…</span>
            </div>
        `;
        // Pulse animation
        if (!document.getElementById('ai-task-badge-style')) {
            const style = document.createElement('style');
            style.id = 'ai-task-badge-style';
            style.textContent = `
                @keyframes aitask-pulse {
                    0%,100% { box-shadow: 0 4px 24px rgba(99,102,241,0.5); }
                    50% { box-shadow: 0 4px 36px rgba(99,102,241,0.85); }
                }
            `;
            document.head.appendChild(style);
        }
        document.body.appendChild(badge);
    }

    function _updateBadge() {
        _ensureBadge();
        const count = Object.keys(_pollers).length;
        const inner = document.getElementById('ai-task-badge-inner');
        const text = document.getElementById('ai-task-badge-text');
        if (!inner) return;
        if (count > 0) {
            inner.style.display = 'flex';
            text.textContent = count === 1 ? 'AI Working…' : `${count} AI Tasks Running`;
        } else {
            inner.style.display = 'none';
        }
    }

    // ── Toast helper (uses global showToast if available) ────────
    function _showToast(msg, type = 'info') {
        if (typeof showToast === 'function') {
            showToast(msg, type);
        } else {
            console.log(`[AITaskManager Toast][${type}] ${msg}`);
        }
    }

    // ── On page load — update badge from any active pollers ──────
    if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
            _ensureBadge();
            _updateBadge();
        });
    }

    return { submit, restore, clear, getStored, activeCount };
})();
