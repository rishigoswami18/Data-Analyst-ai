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
let datasetLoaded = false;

setAuthMode('login'); bindAuthEvents(); initializeAuthState(); bindWorkspaceTabs(); bindUpload(); bindChat(); bindEDA(); bindPreprocessing(); bindHistory(); bindAutoML();

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`; toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3500);
}

function bindWorkspaceTabs() {
    document.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.workspace-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
        });
    });
}

function bindUpload() {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0]; if (!file) return;
        statusMsg.textContent = 'Uploading dataset...'; statusMsg.style.color = '#ccc';
        const formData = new FormData(); formData.append('file', file);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok) {
                statusMsg.textContent = 'Dataset ready'; statusMsg.style.color = '#4ade80';
                renderDatasetSummary(data.dataset_summary);
                datasetLoaded = true; chatInput.disabled = false; sendBtn.disabled = false;
                document.getElementById('run-eda-btn').disabled = false;
                document.getElementById('run-preprocess-btn').disabled = false;
                document.getElementById('run-automl-btn').disabled = false;
                document.getElementById('export-pdf-btn').style.display = 'inline-flex';
                populateAutoMLDropdown(data.dataset_summary.preview_columns);
                conversationHistory = [];
                appendSystemMessage(`Dataset loaded: **${data.filename}**\n${data.dataset_summary.rows} rows · ${data.dataset_summary.columns} columns.\n\nUse the tabs to run AutoML, EDA, or ask a question below!`);
                showToast(`${data.filename} uploaded!`, 'success');
                fetchProfileData(); // Fetches anomalies
            } else { statusMsg.textContent = data.error; statusMsg.style.color = '#ef4444'; showToast(data.error, 'error'); }
        } catch (e) { statusMsg.textContent = 'Upload failed.'; statusMsg.style.color = '#ef4444'; }
    });
}

async function fetchProfileData() {
    try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        if (res.ok && data.profile.anomalies) {
            const an = data.profile.anomalies;
            if (an.count > 0) {
                const metricDiv = document.createElement('div');
                metricDiv.className = 'dataset-metric-card';
                metricDiv.style.borderColor = '#ef4444';
                metricDiv.innerHTML = `<span class="metric-label" style="color:#ef4444;">Anomalies (ML)</span><strong style="color:#f87171;">${an.count} (${an.percentage}%)</strong>`;
                datasetMetrics.appendChild(metricDiv);
                showToast(`Isolation Forest detected ${an.count} anomalous rows!`, 'error');
            }
        }
    } catch (e) {}
}

function bindChat() {
    sendBtn.addEventListener('click', sendQuery);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendQuery(); });
    document.querySelectorAll('.examples-section li').forEach(item => {
        item.addEventListener('click', () => {
            if (!chatInput.disabled) { chatInput.value = item.textContent.replace(/"/g, ''); document.getElementById('tab-chat').click(); sendQuery(); }
            else { showToast('Upload a dataset first', 'error'); }
        });
    });
}

// Global function for follow-up chips
window.triggerFollowUp = function(question) {
    chatInput.value = question;
    sendQuery();
};

async function sendQuery() {
    const text = chatInput.value.trim(); if (!text) return;
    appendUserMessage(text); chatInput.value = ''; chatInput.disabled = true; sendBtn.disabled = true;
    const loadingId = showTypingIndicator();
    try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: conversationHistory }) });
        const data = await res.json(); removeTypingIndicator(loadingId);
        if (res.ok) {
            appendSystemMessage(data.response, data.chart_json, false, data.follow_ups);
            conversationHistory.push({ role: 'user', content: text }, { role: 'assistant', content: data.response });
            if (conversationHistory.length > MAX_HISTORY * 2) conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
            fetch('/api/history/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text, response: data.response }) });
            updateHistoryPanel();
        } else if (res.status === 401) { resetWorkspace(); renderAuthState(null); setAuthMode('login'); setAuthMessage(data.error || 'Please log in.', true); }
        else { appendSystemMessage(data.error || 'An unexpected error occurred.', null, true); }
    } catch (e) { removeTypingIndicator(loadingId); appendSystemMessage('Connection error.', null, true); }
    if (!appContainer.hidden) { chatInput.disabled = false; sendBtn.disabled = false; chatInput.focus(); }
}

function bindEDA() { document.getElementById('run-eda-btn').addEventListener('click', runEDA); }

async function runEDA() {
    const btn = document.getElementById('run-eda-btn'); const spinner = document.getElementById('eda-spinner');
    btn.disabled = true; document.getElementById('eda-btn-text').textContent = 'Analyzing...'; spinner.hidden = false;
    const resultsDiv = document.getElementById('eda-results');
    resultsDiv.innerHTML = '<div class="eda-loading"><div class="spinner large"></div><p>Running comprehensive EDA...</p></div>';
    try {
        const res = await fetch('/api/eda', { method: 'POST' }); const data = await res.json();
        if (res.ok) { renderEDAResults(data.eda); showToast('EDA report generated!', 'success'); }
        else { resultsDiv.innerHTML = `<div class="eda-placeholder"><div class="eda-placeholder-icon">⚠️</div><h2>EDA Failed</h2><p>${escapeHtml(data.error)}</p></div>`; showToast(data.error, 'error'); }
    } catch (e) { resultsDiv.innerHTML = '<div class="eda-placeholder"><div class="eda-placeholder-icon">⚠️</div><h2>Connection Error</h2></div>'; }
    btn.disabled = false; document.getElementById('eda-btn-text').textContent = 'Run Full EDA'; spinner.hidden = true;
}

function renderEDAResults(eda) {
    const r = document.getElementById('eda-results'); let html = '';
    html += `<div class="eda-kpis">
        <div class="eda-kpi"><span class="kpi-value">${eda.shape.rows.toLocaleString()}</span><span class="kpi-label">Rows</span></div>
        <div class="eda-kpi"><span class="kpi-value">${eda.shape.columns}</span><span class="kpi-label">Columns</span></div>
        <div class="eda-kpi"><span class="kpi-value">${eda.memory_usage}</span><span class="kpi-label">Memory</span></div>
        <div class="eda-kpi"><span class="kpi-value">${eda.dtype_counts.numeric}</span><span class="kpi-label">Numeric</span></div>
        <div class="eda-kpi"><span class="kpi-value">${eda.dtype_counts.categorical}</span><span class="kpi-label">Categorical</span></div>
        <div class="eda-kpi"><span class="kpi-value">${eda.dtype_counts.datetime}</span><span class="kpi-label">Datetime</span></div>
    </div>`;
    
    if (eda.statistical_summary.length) {
        html += `<div class="eda-section"><h3>📐 Statistical Summary</h3><div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Column</th><th>Count</th><th>Mean</th><th>Std</th><th>Min</th><th>Q1</th><th>Median</th><th>Q3</th><th>Max</th><th>Skew</th><th>Kurt</th><th>Miss%</th></tr></thead><tbody>`;
        eda.statistical_summary.forEach(s => { html += `<tr><td><strong>${escapeHtml(s.column)}</strong></td><td>${s.count}</td><td>${s.mean}</td><td>${s.std}</td><td>${s.min}</td><td>${s.q1}</td><td>${s.median}</td><td>${s.q3}</td><td>${s.max}</td><td>${s.skewness}</td><td>${s.kurtosis}</td><td>${s.missing_pct}%</td></tr>`; });
        html += '</tbody></table></div></div>';
    }
    
    if (eda.distribution_chart) html += `<div class="eda-section"><h3>📊 Distributions</h3><img src="${eda.distribution_chart}&cb=${Date.now()}" class="eda-chart" alt="Distributions"></div>`;
    if (eda.correlation_chart) html += `<div class="eda-section"><h3>🔗 Correlation Matrix</h3><img src="${eda.correlation_chart}&cb=${Date.now()}" class="eda-chart" alt="Correlation"></div>`;
    
    html += `<div class="eda-section"><h3>❓ Missing Values</h3>`;
    if (eda.missing_chart) html += `<img src="${eda.missing_chart}&cb=${Date.now()}" class="eda-chart" alt="Missing Values">`;
    const hasMissing = eda.missing_analysis.some(m => m.missing_count > 0);
    if (hasMissing) {
        html += '<div class="table-wrapper"><table class="data-table"><thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>%</th></tr></thead><tbody>';
        eda.missing_analysis.filter(m => m.missing_count > 0).forEach(m => {
            const pctClass = m.missing_pct > 30 ? 'pct-high' : m.missing_pct > 10 ? 'pct-med' : 'pct-low';
            html += `<tr><td>${escapeHtml(m.column)}</td><td>${m.dtype}</td><td>${m.missing_count}</td><td><span class="pct-badge ${pctClass}">${m.missing_pct}%</span></td></tr>`;
        });
        html += '</tbody></table></div>';
    } else {
        html += '<p class="eda-note" style="color: #4ade80; margin-top: 10px;">✅ No missing values detected!</p>';
    }
    html += '</div>';

    if (eda.outliers && eda.outliers.length) {
        const hasOutliers = eda.outliers.some(o => o.outlier_count > 0);
        if (hasOutliers) {
            html += '<div class="eda-section"><h3>🎯 Outlier Detection (IQR)</h3><div class="table-wrapper"><table class="data-table"><thead><tr><th>Column</th><th>Outliers</th><th>%</th><th>Lower Bound</th><th>Upper Bound</th></tr></thead><tbody>';
            eda.outliers.filter(o => o.outlier_count > 0).forEach(o => {
                html += `<tr><td>${escapeHtml(o.column)}</td><td>${o.outlier_count}</td><td>${o.outlier_pct}%</td><td>${o.lower_bound}</td><td>${o.upper_bound}</td></tr>`;
            });
            html += '</tbody></table></div></div>';
        }
    }

    if (eda.categorical_summary && eda.categorical_summary.length) {
        html += '<div class="eda-section"><h3>🏷️ Categorical Columns</h3><div class="cat-grid">';
        eda.categorical_summary.forEach(c => {
            html += `<div class="cat-card"><h4>${escapeHtml(c.column)}</h4><span class="cat-meta">${c.unique_count} unique · ${c.missing_count} missing</span><div class="cat-bars">`;
            c.top_values.slice(0, 5).forEach(v => {
                const maxCount = c.top_values[0].count;
                const pct = maxCount > 0 ? (v.count / maxCount * 100) : 0;
                html += `<div class="cat-bar-row"><span class="cat-val" title="${escapeHtml(v.value)}">${escapeHtml(v.value)}</span><div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div><span class="cat-count">${v.count}</span></div>`;
            });
            html += '</div></div>';
        });
        html += '</div></div>';
    }

    r.innerHTML = html;
}

function bindPreprocessing() { document.getElementById('run-preprocess-btn').addEventListener('click', runPreprocessing); }
async function runPreprocessing() {
    const checkboxes = document.querySelectorAll('.step-checkbox:checked');
    if (!checkboxes.length) { showToast('Select a step', 'error'); return; }
    const steps = Array.from(checkboxes).map(cb => { const s = { action: cb.value }; if (cb.value === 'fill_missing') s.strategy = document.getElementById('fill-strategy').value; return s; });
    const btn = document.getElementById('run-preprocess-btn'); const spinner = document.getElementById('preprocess-spinner');
    btn.disabled = true; spinner.hidden = false;
    try {
        const res = await fetch('/api/preprocess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ steps }) });
        const data = await res.json();
        if (res.ok) {
            renderPreprocessResults(data); if (data.dataset_summary) { renderDatasetSummary(data.dataset_summary); populateAutoMLDropdown(data.columns.map(c => ({name: c}))); }
            showToast('Pipeline applied!', 'success'); fetchProfileData();
        } else showToast(data.error, 'error');
    } catch (e) { showToast('Error', 'error'); }
    btn.disabled = false; spinner.hidden = true;
}

function renderPreprocessResults(data) {
    const r = document.getElementById('preprocess-results'); let html = '';
    html += `<div class="shape-compare"><div class="shape-card"><span class="shape-label">Before</span><strong>${data.original_shape.rows} × ${data.original_shape.columns}</strong></div><div class="shape-arrow">→</div><div class="shape-card after"><span class="shape-label">After</span><strong>${data.new_shape.rows} × ${data.new_shape.columns}</strong></div></div>`;
    html += '<div class="preprocess-log"><h3>Log</h3><ul>' + data.log.map(l => `<li class="log-entry">✅ ${escapeHtml(l)}</li>`).join('') + '</ul></div>';
    if (data.download_id) html += `<div class="preprocess-download"><a href="/api/download/${data.download_id}" class="primary-btn download-btn">📥 Download CSV</a></div>`;
    r.innerHTML = html;
}

function populateAutoMLDropdown(columns) {
    const select = document.getElementById('automl-target'); select.innerHTML = '';
    columns.forEach(col => { const opt = document.createElement('option'); opt.value = col.name; opt.textContent = col.name; select.appendChild(opt); });
}

function bindAutoML() { document.getElementById('run-automl-btn').addEventListener('click', runAutoML); }
async function runAutoML() {
    const target = document.getElementById('automl-target').value;
    if (!target) { showToast('Select a target', 'error'); return; }
    const btn = document.getElementById('run-automl-btn'); const spinner = document.getElementById('automl-spinner');
    btn.disabled = true; spinner.hidden = false; document.getElementById('automl-results').innerHTML = '<div class="eda-loading"><div class="spinner large"></div><p>Training models...</p></div>';
    try {
        const res = await fetch('/api/automl', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({target}) });
        const data = await res.json();
        if (res.ok) {
            let html = `<h2 style="margin-bottom: 20px;">🏆 Leaderboard (${data.model_type})</h2><div style="display: flex; flex-direction: column; gap: 20px;">`;
            
            data.leaderboard.forEach((model, index) => {
                const isWinner = index === 0;
                html += `<div style="background: rgba(15,23,42,${isWinner ? '0.8' : '0.4'}); padding: 25px; border-radius: 16px; border: 1px solid ${isWinner ? 'rgba(16,185,129,0.5)' : 'var(--border-color)'}; box-shadow: ${isWinner ? '0 0 15px rgba(16,185,129,0.1)' : 'none'}; position: relative;">
                    ${isWinner ? '<div style="position: absolute; top: -12px; right: 20px; background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">🏅 BEST MODEL</div>' : ''}
                    <span class="hero-tag" style="background: rgba(255,255,255,0.1); border-color: transparent; color: var(--text-primary);">${model.name}</span>
                    
                    <div style="display: flex; gap: 30px; margin: 15px 0;">
                        <div>
                            <span style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Train ${data.metric_name}</span>
                            <div style="font-size: 1.4rem; font-weight: bold; color: var(--text-primary);">${(model.train_score * 100).toFixed(1)}%</div>
                        </div>
                        <div>
                            <span style="font-size: 0.85rem; color: ${isWinner ? '#a7f3d0' : 'var(--text-secondary)'}; text-transform: uppercase; font-weight: bold;">Test ${data.metric_name}</span>
                            <div style="font-size: 2rem; font-weight: bold; color: ${isWinner ? '#10b981' : 'var(--text-primary)'}; line-height: 1;">${(model.test_score * 100).toFixed(1)}%</div>
                        </div>
                    </div>
                    
                    <h4 style="margin-top: 20px; color: var(--text-secondary); font-size: 0.9rem;">Top Feature Importances</h4>
                    <div style="margin-top: 10px; display: grid; gap: 8px;">`;
                
                model.feature_importance.forEach(f => {
                    const maxVal = model.feature_importance[0].importance || 1;
                    const pct = (f.importance / maxVal) * 100;
                    html += `<div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span>${escapeHtml(f.feature)}</span><strong>${f.importance.toFixed(4)}</strong></div>
                             <div style="background: rgba(255,255,255,0.1); height: 5px; border-radius: 3px; overflow: hidden;"><div style="background: var(--accent-gradient); height: 100%; width: ${pct}%;"></div></div>`;
                });
                
                html += `</div></div>`;
            });
            
            html += `</div>`;
            document.getElementById('automl-results').innerHTML = html;
            showToast('Leaderboard generated!', 'success');
        } else { document.getElementById('automl-results').innerHTML = `<p style="color:#ef4444;">${escapeHtml(data.error)}</p>`; showToast(data.error, 'error'); }
    } catch (e) { document.getElementById('automl-results').innerHTML = '<p>Error training models.</p>'; }
    btn.disabled = false; spinner.hidden = true;
}

function bindHistory() {
    document.getElementById('history-toggle').addEventListener('click', () => { document.getElementById('history-list').classList.toggle('expanded'); });
    updateHistoryPanel();
}
async function updateHistoryPanel() {
    try {
        const res = await fetch('/api/history'); const data = await res.json();
        const list = document.getElementById('history-list'); const history = data.history || [];
        document.getElementById('history-count').textContent = history.length;
        if (!history.length) { list.innerHTML = '<p class="history-empty">No queries yet</p>'; return; }
        list.innerHTML = history.slice().reverse().slice(0, 20).map(h => `<div class="history-item"><span class="history-query">${escapeHtml(h.query)}</span><span class="history-time">${new Date(h.timestamp).toLocaleTimeString()}</span></div>`).join('');
        document.querySelectorAll('.history-item').forEach(item => { item.addEventListener('click', () => { chatInput.value = item.querySelector('.history-query').textContent; document.getElementById('tab-chat').click(); chatInput.focus(); }); });
    } catch (e) {}
}

function bindAuthEvents() {
    showLoginBtn.addEventListener('click', () => setAuthMode('login')); showSignupBtn.addEventListener('click', () => setAuthMode('signup'));
    loginForm.addEventListener('submit', async (e) => { e.preventDefault(); await submitAuth('/api/login', { email: document.getElementById('login-email').value.trim(), password: document.getElementById('login-password').value }); });
    signupForm.addEventListener('submit', async (e) => { e.preventDefault(); await submitAuth('/api/signup', { name: document.getElementById('signup-name').value.trim(), email: document.getElementById('signup-email').value.trim(), password: document.getElementById('signup-password').value }); });
    logoutBtn.addEventListener('click', async () => { try { await fetch('/api/logout', { method: 'POST' }); } finally { resetWorkspace(); renderAuthState(null); setAuthMode('login'); setAuthMessage('Logged out', false); } });
}

async function initializeAuthState() { try { const res = await fetch('/api/auth/status'); const data = await res.json(); renderAuthState(data.authenticated ? data.user : null); } catch (e) { renderAuthState(null); } }
function setAuthMode(mode) { const isL = mode === 'login'; showLoginBtn.classList.toggle('active', isL); showSignupBtn.classList.toggle('active', !isL); loginForm.hidden = !isL; signupForm.hidden = isL; setAuthMessage(''); }
async function submitAuth(url, payload) {
    setAuthMessage('Processing...', false);
    try { const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await res.json(); if (!res.ok) { setAuthMessage(data.error, true); return; } resetWorkspace(); renderAuthState(data.user); loginForm.reset(); signupForm.reset(); setAuthMessage(''); } catch (e) { setAuthMessage('Error', true); }
}
function renderAuthState(user) { const isA = Boolean(user); authShell.hidden = isA; appContainer.hidden = !isA; if (!isA) return; accountName.textContent = user.name; accountEmail.textContent = user.email; }
function setAuthMessage(msg, isErr = false) { authStatus.textContent = msg; authStatus.style.color = isErr ? '#fca5a5' : '#86efac'; }

function appendUserMessage(text) {
    const div = document.createElement('div'); div.className = 'message user-message';
    div.innerHTML = `<div class="avatar">You</div><div class="bubble">${escapeHtml(text)}</div>`;
    chatBox.appendChild(div); scrollToBottom();
}

function appendSystemMessage(text, chartJson = null, isError = false, followUps = []) {
    const id = `msg-${Date.now()}`; const div = document.createElement('div'); div.id = id; div.className = 'message system-message';
    let formatted = escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = `<div class="avatar">AG</div><div class="bubble${isError ? ' error-bubble' : ''}" style="width: 100%; min-width: 300px;"><div class="msg-text">${formatted}</div></div>`;
    chatBox.appendChild(div);
    
    const bubble = div.querySelector('.bubble');
    if (chartJson) {
        try {
            const chartData = JSON.parse(chartJson);
            const plotDiv = document.createElement('div'); plotDiv.style.marginTop = '15px'; plotDiv.style.width = '100%'; plotDiv.style.height = '400px';
            bubble.appendChild(plotDiv);
            Plotly.newPlot(plotDiv, chartData.data, chartData.layout, {responsive: true});
        } catch(e) { console.error('Plotly parsing failed', e); }
    }
    
    if (followUps && followUps.length > 0) {
        const fuDiv = document.createElement('div');
        fuDiv.style.marginTop = '15px'; fuDiv.style.display = 'flex'; fuDiv.style.flexWrap = 'wrap'; fuDiv.style.gap = '8px';
        followUps.forEach(fu => {
            const btn = document.createElement('button');
            btn.textContent = fu;
            btn.style.padding = '8px 12px'; btn.style.background = 'rgba(16,185,129,0.15)'; btn.style.border = '1px solid rgba(16,185,129,0.3)'; btn.style.borderRadius = '20px'; btn.style.color = '#a7f3d0'; btn.style.cursor = 'pointer'; btn.style.fontSize = '0.85rem'; btn.style.transition = 'all 0.2s';
            btn.onmouseover = () => { btn.style.background = 'rgba(16,185,129,0.25)'; };
            btn.onmouseout = () => { btn.style.background = 'rgba(16,185,129,0.15)'; };
            btn.onclick = () => window.triggerFollowUp(fu);
            fuDiv.appendChild(btn);
        });
        bubble.appendChild(fuDiv);
    }
    scrollToBottom(); return id;
}

function showTypingIndicator() { const id = `typing-${Date.now()}`; const div = document.createElement('div'); div.id = id; div.className = 'message system-message'; div.innerHTML = `<div class="avatar">AG</div><div class="typing-indicator"><span></span><span></span><span></span></div>`; chatBox.appendChild(div); scrollToBottom(); return id; }
function removeTypingIndicator(id) { const el = document.getElementById(id); if (el) el.remove(); }
function resetWorkspace() { /* reset code */ }
function scrollToBottom() { chatBox.scrollTop = chatBox.scrollHeight; }
function escapeHtml(u) { return String(u).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function renderDatasetSummary(s) { if (!s) return; datasetSection.hidden = false; datasetMetrics.innerHTML = `<div class="dataset-metric-card"><span class="metric-label">Rows</span><strong>${s.rows.toLocaleString()}</strong></div><div class="dataset-metric-card"><span class="metric-label">Columns</span><strong>${s.columns}</strong></div><div class="dataset-metric-card"><span class="metric-label">Numeric</span><strong>${s.numeric_columns}</strong></div><div class="dataset-metric-card"><span class="metric-label">Missing</span><strong>${s.missing_values.toLocaleString()}</strong></div>`; datasetColumnsList.innerHTML = s.preview_columns.map(c => `<div class="dataset-column-chip"><span>${escapeHtml(c.name)}</span><small>${escapeHtml(c.dtype)}</small></div>`).join(''); }
