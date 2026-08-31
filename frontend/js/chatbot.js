/**
 * Chatbot Widget Logic
 */
const Chatbot = {
    isOpen: false,
    messages: [],

    init() {
        this.injectStyles();
        this.render();
        this.bindEvents();
    },

    injectStyles() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '../css/chatbot.css';
        document.head.appendChild(link);
    },

    render() {
        const html = `
            <div class="chatbot-widget" id="chatbot-widget">
                <button class="chatbot-button" id="chatbot-toggle">
                    <i class="fa-solid fa-robot"></i>
                </button>
                <div class="chatbot-window" id="chatbot-window">
                    <div class="chatbot-header">
                        <div class="chatbot-title">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                            <span>AI Recruitment Assistant</span>
                        </div>
                        <button class="chatbot-close" id="chatbot-close">&times;</button>
                    </div>
                    <div class="chatbot-messages" id="chatbot-messages">
                        <div class="chat-msg bot">
                            Hello! I am your AI assistant. How can I help you today?
                            <br><br>
                        </div>
                    </div>
                    <div class="chatbot-footer">
                        <input type="text" class="chatbot-input" id="chatbot-input" placeholder="Type your message...">
                        <button class="chatbot-send" id="chatbot-send">
                            <i class="fa-solid fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    bindEvents() {
        document.getElementById('chatbot-toggle').addEventListener('click', () => this.toggle());
        document.getElementById('chatbot-close').addEventListener('click', () => this.toggle());
        document.getElementById('chatbot-send').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatbot-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    },

    toggle() {
        this.isOpen = !this.isOpen;
        document.getElementById('chatbot-window').classList.toggle('open', this.isOpen);
    },

    async sendMessage() {
        const input = document.getElementById('chatbot-input');
        const query = input.value.trim();
        if (!query) return;

        input.value = '';
        this.appendMessage('user', query);

        const typingId = this.showTyping();

        try {
            const session = JSON.parse(localStorage.getItem('recruit_session') || '{}');
            const hr_id = session.user_id;

            const response = await fetch('/api/chatbot/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, hr_id })
            });

            const data = await response.json();
            this.removeTyping(typingId);

            if (data.response) {
                this.appendMessage('bot', data.response);
            } else {
                this.appendMessage('bot', "I'm sorry, I encountered an error processing your request.");
            }
        } catch (error) {
            this.removeTyping(typingId);
            this.appendMessage('bot', "Network error. Please make sure the server is running.");
            console.error('Chatbot Error:', error);
        }
    },

    appendMessage(role, text) {
        const container = document.getElementById('chatbot-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${role}`;

        // Convert markdown-like syntax to simple HTML (line breaks and bold)
        const formattedText = text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        msgDiv.innerHTML = formattedText;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    },

    showTyping() {
        const container = document.getElementById('chatbot-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-msg bot typing-indicator';
        typingDiv.id = 'typing-' + Date.now();
        typingDiv.innerHTML = '<i class="fa-solid fa-ellipsis fa-fade"></i> AI is thinking...';
        container.appendChild(typingDiv);
        container.scrollTop = container.scrollHeight;
        return typingDiv.id;
    },

    removeTyping(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
};

// Initialize chatbot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Chatbot.init();
});
