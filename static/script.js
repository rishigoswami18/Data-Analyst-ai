const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const statusMsg = document.getElementById('upload-status');
const datasetSection = document.getElementById('dataset-section');
const datasetMetrics = document.getElementById('dataset-metrics');
const datasetColumnsList = document.getElementById('dataset-columns-list');

const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');

// Conversation history buffer (last 6 exchanges for follow-up context)
let conversationHistory = [];
const MAX_HISTORY = 6;

// ─── 1. File Upload ───
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    statusMsg.textContent = "Uploading dataset...";
    statusMsg.style.color = "#ccc";

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (response.ok) {
            statusMsg.textContent = "Dataset ready for analysis";
            statusMsg.style.color = "#4ade80";
            renderDatasetSummary(data.dataset_summary);

            chatInput.disabled = false;
            sendBtn.disabled = false;

            // Reset history when new dataset is uploaded
            conversationHistory = [];

            appendSystemMessage(`Dataset loaded: **${data.filename}**\n${data.dataset_summary.rows} rows · ${data.dataset_summary.columns} columns · ${data.dataset_summary.numeric_columns} numeric fields\n\nYou can now ask for summaries, comparisons, trends, or charts.`);
        } else {
            statusMsg.textContent = data.error;
            statusMsg.style.color = "#ef4444";
        }
    } catch (err) {
        statusMsg.textContent = "Upload failed. Please try again.";
        statusMsg.style.color = "#ef4444";
    }
});


// ─── 2. Chat Logic ───
sendBtn.addEventListener('click', sendQuery);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendQuery();
});

// Clickable example prompts
document.querySelectorAll('.examples-section li').forEach(li => {
    li.addEventListener('click', () => {
        if (!chatInput.disabled) {
            chatInput.value = li.textContent.replace(/"/g, '');
            sendQuery();
        } else {
            appendSystemMessage("Please upload a dataset first to enable analysis.", null, true);
        }
    });
});

async function sendQuery() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendUserMessage(text);
    chatInput.value = "";
    chatInput.disabled = true;
    sendBtn.disabled = true;

    // Show animated typing indicator
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

            // Update conversation history
            conversationHistory.push(
                { role: "user", content: text },
                { role: "assistant", content: data.response }
            );
            // Keep history buffer trimmed
            if (conversationHistory.length > MAX_HISTORY * 2) {
                conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
            }
        } else {
            appendSystemMessage(data.response || "An unexpected server error occurred.", null, true);
        }
    } catch (err) {
        removeTypingIndicator(loadingId);
        appendSystemMessage("Connection error. The server may be restarting. Please try again in a moment.", null, true);
    }

    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
}


// ─── 3. Message Builders ───

function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = "message user-message";
    div.innerHTML = `
        <div class="avatar">You</div>
        <div class="bubble">${escapeHtml(text)}</div>
    `;
    chatBox.appendChild(div);
    scrollToBottom();
}

function appendSystemMessage(text, chartUrl = null, isError = false) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = "message system-message";

    // Format text: bold markdown-like (**text**)
    let formatted = escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (chartUrl) {
        const cb = "?cb=" + Date.now();
        formatted += `<br><img src="${chartUrl}${cb}" class="chat-chart" alt="Generated Chart">`;
    }

    div.innerHTML = `
        <div class="avatar">AG</div>
        <div class="bubble${isError ? ' error-bubble' : ''}"></div>
    `;
    div.querySelector('.bubble').innerHTML = formatted;

    chatBox.appendChild(div);

    if (chartUrl) {
        const img = div.querySelector('.chat-chart');
        img.onload = scrollToBottom;
    } else {
        scrollToBottom();
    }

    return id;
}

function showTypingIndicator() {
    const id = "typing-" + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = "message system-message";
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
    const el = document.getElementById(id);
    if (el) el.remove();
}


// ─── 4. Utilities ───

function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
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
        .map(column => `
            <div class="dataset-column-chip">
                <span>${escapeHtml(column.name)}</span>
                <small>${escapeHtml(column.dtype)}</small>
            </div>
        `)
        .join('');
}
