const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const statusMsg = document.getElementById('upload-status');
const datasetSection = document.getElementById('dataset-section');
const datasetMetrics = document.getElementById('dataset-metrics');
const datasetColumnsList = document.getElementById('dataset-columns-list');

const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');

// 1. File Upload Logic
uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

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
            
            // Enable chat
            chatInput.disabled = false;
            sendBtn.disabled = false;
            
            appendSystemMessage(`Dataset loaded: ${data.filename}. You can now ask for summaries, comparisons, trends, or charts.`);
        } else {
            statusMsg.textContent = data.error;
            statusMsg.style.color = "#ef4444"; // red
        }
    } catch (err) {
        statusMsg.textContent = "Upload failed.";
    }
});


// 2. Chat Logic
sendBtn.addEventListener('click', sendQuery);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendQuery();
});

// Clickable examples
document.querySelectorAll('.examples-section li').forEach(li => {
    li.addEventListener('click', () => {
        if(!chatInput.disabled) {
            chatInput.value = li.textContent.replace(/"/g, '');
            sendQuery();
        } else {
            alert("Upload a dataset first to activate analysis.");
        }
    });
});

async function sendQuery() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Display user message
    appendUserMessage(text);
    chatInput.value = "";
    
    // Temporarily disable input
    chatInput.disabled = true;
    sendBtn.disabled = true;

    // Add loading message
    const loadingId = appendSystemMessage("Working on your question...");

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        
        // Remove loading
        document.getElementById(loadingId).remove();
        
        if (response.ok) {
            appendSystemMessage(data.response, data.chart_url);
        } else {
            appendSystemMessage(data.response || "Server Error");
        }
    } catch (err) {
        document.getElementById(loadingId).remove();
        appendSystemMessage("Connection error.");
    }

    // Re-enable input
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
}

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

function appendSystemMessage(text, chartUrl = null) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = "message system-message";
    
    let bubbleContent = escapeHtml(text);
    if(chartUrl) {
        // Append an image tag bypassing escaping for the img construct
        // Add cache busting query to prevent browser from showing old chart
        const cb = "?cb=" + Date.now();
        bubbleContent += `<br><img src="${chartUrl}${cb}" class="chat-chart" alt="Generated Chart">`;
    }
    
    // Use innerHTML because we might inject an unescaped img tag immediately after escaped text
    div.innerHTML = `
        <div class="avatar">AG</div>
        <div class="bubble"></div>
    `;
    div.querySelector('.bubble').innerHTML = bubbleContent;
    
    chatBox.appendChild(div);
    
    // If it has an image, scroll after image loads
    if(chartUrl) {
        const img = div.querySelector('.chat-chart');
        img.onload = scrollToBottom;
    } else {
        scrollToBottom();
    }
    
    return id;
}

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
            <strong>${summary.rows}</strong>
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
            <strong>${summary.missing_values}</strong>
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
