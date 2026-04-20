const authShell = document.getElementById('auth-shell');
const appContainer = document.getElementById('app-container');
const authStatus = document.getElementById('auth-status');
const showLoginBtn = document.getElementById('show-login-btn');
const showSignupBtn = document.getElementById('show-signup-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const logoutBtn = document.getElementById('logout-btn');
const accountName = document.getElementById('account-name');
const accountEmail = document.getElementById('account-email');

const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const statusMsg = document.getElementById('upload-status');
const datasetSection = document.getElementById('dataset-section');
const datasetMetrics = document.getElementById('dataset-metrics');
const datasetColumnsList = document.getElementById('dataset-columns-list');

const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');

let conversationHistory = [];
const MAX_HISTORY = 6;

setAuthMode('login');
bindAuthEvents();
initializeAuthState();

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    statusMsg.textContent = 'Uploading dataset...';
    statusMsg.style.color = '#ccc';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (response.ok) {
            statusMsg.textContent = 'Dataset ready for analysis';
            statusMsg.style.color = '#4ade80';
            renderDatasetSummary(data.dataset_summary);

            chatInput.disabled = false;
            sendBtn.disabled = false;
            conversationHistory = [];

            appendSystemMessage(`Dataset loaded: **${data.filename}**\n${data.dataset_summary.rows} rows · ${data.dataset_summary.columns} columns · ${data.dataset_summary.numeric_columns} numeric fields\n\nYou can now ask for summaries, comparisons, trends, or charts.`);
        } else {
            statusMsg.textContent = data.error || 'Upload failed.';
            statusMsg.style.color = '#ef4444';
        }
    } catch (error) {
        statusMsg.textContent = 'Upload failed. Please try again.';
        statusMsg.style.color = '#ef4444';
    }
});

sendBtn.addEventListener('click', sendQuery);
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') sendQuery();
});

document.querySelectorAll('.examples-section li').forEach((item) => {
    item.addEventListener('click', () => {
        if (!chatInput.disabled) {
            chatInput.value = item.textContent.replace(/"/g, '');
            sendQuery();
        } else {
            appendSystemMessage('Please upload a dataset first to enable analysis.', null, true);
        }
    });
});

async function sendQuery() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendUserMessage(text);
    chatInput.value = '';
    chatInput.disabled = true;
    sendBtn.disabled = true;

    const loadingId = showTypingIndicator();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: conversationHistory
            })
        });

        const data = await response.json();
        removeTypingIndicator(loadingId);

        if (response.ok) {
            appendSystemMessage(data.response, data.chart_url);
            conversationHistory.push(
                { role: 'user', content: text },
                { role: 'assistant', content: data.response }
            );

            if (conversationHistory.length > MAX_HISTORY * 2) {
                conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
            }
        } else if (response.status === 401) {
            resetWorkspace();
            renderAuthState(null);
            setAuthMode('login');
            setAuthMessage(data.error || 'Please log in to continue.', true);
        } else {
            appendSystemMessage(data.response || data.error || 'An unexpected server error occurred.', null, true);
        }
    } catch (error) {
        removeTypingIndicator(loadingId);
        appendSystemMessage('Connection error. The server may be restarting. Please try again in a moment.', null, true);
    }

    if (!appContainer.hidden) {
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

function bindAuthEvents() {
    showLoginBtn.addEventListener('click', () => setAuthMode('login'));
    showSignupBtn.addEventListener('click', () => setAuthMode('signup'));

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitAuth('/login', {
            email: document.getElementById('login-email').value.trim(),
            password: document.getElementById('login-password').value
        });
    });

    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitAuth('/signup', {
            name: document.getElementById('signup-name').value.trim(),
            email: document.getElementById('signup-email').value.trim(),
            password: document.getElementById('signup-password').value
        });
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/logout', { method: 'POST' });
        } finally {
            resetWorkspace();
            renderAuthState(null);
            setAuthMode('login');
            setAuthMessage('Logged out successfully.', false);
        }
    });
}

async function initializeAuthState() {
    try {
        const response = await fetch('/auth/status');
        const data = await response.json();

        if (data.authenticated) {
            renderAuthState(data.user);
        } else {
            renderAuthState(null);
        }
    } catch (error) {
        renderAuthState(null);
        setAuthMessage('Unable to check session state. Please refresh and try again.', true);
    }
}

function setAuthMode(mode) {
    const loginActive = mode === 'login';
    showLoginBtn.classList.toggle('active', loginActive);
    showSignupBtn.classList.toggle('active', !loginActive);
    loginForm.hidden = !loginActive;
    signupForm.hidden = loginActive;
    setAuthMessage('');
}

async function submitAuth(url, payload) {
    setAuthMessage(url === '/login' ? 'Signing you in...' : 'Creating your account...', false);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
            setAuthMessage(data.error || 'Authentication failed.', true);
            return;
        }

        resetWorkspace();
        renderAuthState(data.user);
        loginForm.reset();
        signupForm.reset();
        setAuthMessage('');
    } catch (error) {
        setAuthMessage('Authentication request failed. Please try again.', true);
    }
}

function renderAuthState(user) {
    const isAuthenticated = Boolean(user);
    authShell.hidden = isAuthenticated;
    appContainer.hidden = !isAuthenticated;

    if (!isAuthenticated) {
        accountName.textContent = '';
        accountEmail.textContent = '';
        chatInput.disabled = true;
        sendBtn.disabled = true;
        return;
    }

    accountName.textContent = user.name;
    accountEmail.textContent = user.email;
}

function setAuthMessage(message, isError = false) {
    authStatus.textContent = message;
    authStatus.style.color = isError ? '#fca5a5' : '#86efac';
}

function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user-message';
    div.innerHTML = `
        <div class="avatar">You</div>
        <div class="bubble">${escapeHtml(text)}</div>
    `;
    chatBox.appendChild(div);
    scrollToBottom();
}

function appendSystemMessage(text, chartUrl = null, isError = false) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message system-message';

    let formatted = escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (chartUrl) {
        const cacheBust = `?cb=${Date.now()}`;
        formatted += `<br><img src="${chartUrl}${cacheBust}" class="chat-chart" alt="Generated Chart">`;
    }

    div.innerHTML = `
        <div class="avatar">AG</div>
        <div class="bubble${isError ? ' error-bubble' : ''}"></div>
    `;
    div.querySelector('.bubble').innerHTML = formatted;
    chatBox.appendChild(div);

    if (chartUrl) {
        const image = div.querySelector('.chat-chart');
        image.onload = scrollToBottom;
    } else {
        scrollToBottom();
    }

    return id;
}

function showTypingIndicator() {
    const id = `typing-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message system-message';
    div.innerHTML = `
        <div class="avatar">AG</div>
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    chatBox.appendChild(div);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const element = document.getElementById(id);
    if (element) element.remove();
}

function resetWorkspace() {
    conversationHistory = [];
    datasetSection.hidden = true;
    datasetMetrics.innerHTML = '';
    datasetColumnsList.innerHTML = '';
    statusMsg.textContent = '';
    fileInput.value = '';
    chatInput.value = '';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatBox.innerHTML = `
        <div class="message system-message">
            <div class="avatar">AG</div>
            <div class="bubble">Welcome. Upload a dataset to begin, and then ask questions about trends, summaries, comparisons, or charts.</div>
        </div>
    `;
}

function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderDatasetSummary(summary) {
    if (!summary) return;

    datasetSection.hidden = false;
    datasetMetrics.innerHTML = `
        <div class="dataset-metric-card">
            <span class="metric-label">Rows</span>
            <strong>${summary.rows.toLocaleString()}</strong>
        </div>
        <div class="dataset-metric-card">
            <span class="metric-label">Columns</span>
            <strong>${summary.columns}</strong>
        </div>
        <div class="dataset-metric-card">
            <span class="metric-label">Numeric</span>
            <strong>${summary.numeric_columns}</strong>
        </div>
        <div class="dataset-metric-card">
            <span class="metric-label">Missing</span>
            <strong>${summary.missing_values.toLocaleString()}</strong>
        </div>
    `;

    datasetColumnsList.innerHTML = summary.preview_columns
        .map((column) => `
            <div class="dataset-column-chip">
                <span>${escapeHtml(column.name)}</span>
                <small>${escapeHtml(column.dtype)}</small>
            </div>
        `)
        .join('');
}
