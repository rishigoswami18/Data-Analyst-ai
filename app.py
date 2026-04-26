import io
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.ensemble import IsolationForest, RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.metrics import accuracy_score, r2_score
from sklearn.model_selection import train_test_split
from fpdf import FPDF
from flask import (
    Flask,
    jsonify,
    make_response,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from agent import query_dataset

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:  # pragma: no cover
    psycopg2 = None
    RealDictCursor = None

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / 'uploads'
CHARTS_FOLDER = BASE_DIR / 'static' / 'charts'
DATABASE_PATH = BASE_DIR / 'users.db'
FRONTEND_DIST = BASE_DIR / 'frontend' / 'dist'
DATABASE_URL = os.environ.get('DATABASE_URL')
USE_POSTGRES = bool(DATABASE_URL)
DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError,) + ((psycopg2.IntegrityError,) if psycopg2 else ())

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key')
app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)

UPLOAD_FOLDER.mkdir(exist_ok=True)
CHARTS_FOLDER.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {'csv', 'xlsx'}
MAX_RECENT_DATASETS = 5
PROCESSED_FOLDER = BASE_DIR / 'processed'
PROCESSED_FOLDER.mkdir(exist_ok=True)

if USE_POSTGRES and psycopg2 is None:
    raise RuntimeError('DATABASE_URL is set but psycopg2-binary is not installed.')


def normalize_database_url(database_url):
    """Normalize database URLs for drivers that prefer postgresql://."""
    if database_url and database_url.startswith('postgres://'):
        return database_url.replace('postgres://', 'postgresql://', 1)
    return database_url


def get_db_connection():
    """Create a database connection for auth data."""
    if USE_POSTGRES:
        return psycopg2.connect(normalize_database_url(DATABASE_URL))

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def fetch_one(query, params=()):
    """Fetch a single row as a dictionary."""
    with get_db_connection() as connection:
        if USE_POSTGRES:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params)
                row = cursor.fetchone()
                return dict(row) if row else None

        cursor = connection.execute(query, params)
        row = cursor.fetchone()
        return dict(row) if row else None


def execute_write(query, params=(), returning=False):
    """Run a write query and optionally return a dictionary result."""
    with get_db_connection() as connection:
        if USE_POSTGRES:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params)
                result = cursor.fetchone() if returning else None
            connection.commit()
            return dict(result) if result else None

        cursor = connection.execute(query, params)
        connection.commit()
        if returning:
            return {'id': cursor.lastrowid}
        return None


def init_db():
    """Create the users table if it does not exist."""
    with get_db_connection() as connection:
        if USE_POSTGRES:
            with connection.cursor() as cursor:
                cursor.execute(
                    '''
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                    )
                    '''
                )
            connection.commit()
            return

        connection.execute(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            '''
        )
        connection.commit()


def login_required(route_handler):
    """Ensure the current session belongs to an authenticated user."""
    @wraps(route_handler)
    def wrapped(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({'error': 'Please log in to continue.'}), 401
        return route_handler(*args, **kwargs)
    return wrapped


def current_user_payload():
    """Small user payload for the UI."""
    user_id = session.get('user_id')
    if not user_id:
        return None

    return {
        'id': user_id,
        'name': session.get('user_name'),
        'email': session.get('user_email'),
    }


def allowed_file(filename):
    """Checks whether the uploaded file format is supported."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def load_uploaded_dataframe(file_path):
    """Load uploaded file into a DataFrame."""
    if file_path.lower().endswith('.xlsx'):
        return pd.read_excel(file_path)

    try:
        return pd.read_csv(file_path, encoding='utf-8')
    except UnicodeDecodeError:
        return pd.read_csv(file_path, encoding='ISO-8859-1')


def build_dataset_summary(file_path, filename, dataset_id):
    """Build a lightweight summary for the UI."""
    df = load_uploaded_dataframe(file_path)
    numeric_columns = df.select_dtypes(include='number').columns.tolist()
    missing_values = int(df.isna().sum().sum())

    preview_columns = []
    for column in df.columns[:6]:
        preview_columns.append({
            'name': column,
            'dtype': str(df[column].dtype),
        })

    return {
        'id': dataset_id,
        'filename': filename,
        'rows': int(len(df)),
        'columns': int(len(df.columns)),
        'numeric_columns': int(len(numeric_columns)),
        'missing_values': missing_values,
        'preview_columns': preview_columns,
        'uploaded_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    }


def update_recent_datasets(dataset_summary):
    """Persist a short recent dataset list in the session."""
    recent_datasets = session.get('recent_datasets', [])
    filtered = [item for item in recent_datasets if item.get('id') != dataset_summary['id']]
    session['recent_datasets'] = [dataset_summary, *filtered][:MAX_RECENT_DATASETS]


def clear_active_dataset():
    """Remove the currently selected dataset from the session."""
    session.pop('active_file_path', None)
    session.pop('dataset_summary', None)


def active_dataset_exists():
    """Check whether the current dataset file still exists on disk."""
    active_file_path = session.get('active_file_path')
    return bool(active_file_path and Path(active_file_path).exists())


def current_dataset_payload():
    """Expose the active dataset summary for the frontend."""
    if session.get('active_file_path') and not active_dataset_exists():
        clear_active_dataset()

    dataset_summary = session.get('dataset_summary')
    if not dataset_summary:
        return None

    return dataset_summary


def frontend_placeholder():
    """Fallback UI shown when the React bundle has not been built yet."""
    html = '''
    <!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>AI Data Analysis Assistant</title>
            <style>
                body {
                    margin: 0;
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    font-family: Inter, Arial, sans-serif;
                    background: linear-gradient(180deg, #09111f 0%, #0b1324 100%);
                    color: #e2e8f0;
                }
                .card {
                    width: min(640px, calc(100vw - 32px));
                    padding: 32px;
                    border-radius: 24px;
                    background: rgba(15, 23, 42, 0.85);
                    border: 1px solid rgba(148, 163, 184, 0.16);
                    box-shadow: 0 24px 60px rgba(2, 6, 23, 0.35);
                }
                h1 { margin: 0 0 12px; font-size: 2rem; }
                p { color: #94a3b8; line-height: 1.7; }
                code {
                    display: block;
                    margin-top: 20px;
                    padding: 14px 16px;
                    border-radius: 14px;
                    background: rgba(2, 6, 23, 0.85);
                    color: #99f6e4;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Frontend bundle not found</h1>
                <p>The Flask API is ready, but the new React frontend has not been built yet.</p>
                <code>cd frontend && npm install && npm run build</code>
            </div>
        </body>
    </html>
    '''
    return make_response(html, 200)


init_db()


@app.get('/api/auth/status')
def auth_status():
    """Returns the current authentication state."""
    return jsonify({
        'authenticated': bool(session.get('user_id')),
        'user': current_user_payload(),
    })


@app.post('/api/signup')
def signup():
    """Create a new user account and start a session."""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if len(name) < 2:
        return jsonify({'error': 'Please enter a name with at least 2 characters.'}), 400
    if '@' not in email or '.' not in email:
        return jsonify({'error': 'Please enter a valid email address.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters long.'}), 400

    try:
        if USE_POSTGRES:
            user = execute_write(
                'INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s) RETURNING id',
                (name, email, generate_password_hash(password)),
                returning=True,
            )
        else:
            user = execute_write(
                'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                (name, email, generate_password_hash(password)),
                returning=True,
            )
        user_id = user['id']
    except DB_INTEGRITY_ERRORS:
        return jsonify({'error': 'An account with that email already exists.'}), 409

    session.clear()
    session['user_id'] = user_id
    session['user_name'] = name
    session['user_email'] = email

    return jsonify({'message': 'Signup successful.', 'user': current_user_payload()})


@app.post('/api/login')
def login():
    """Authenticate an existing user."""
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    query = (
        'SELECT id, name, email, password_hash FROM users WHERE email = %s'
        if USE_POSTGRES
        else 'SELECT id, name, email, password_hash FROM users WHERE email = ?'
    )
    user = fetch_one(query, (email,))

    if user is None or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    session.clear()
    session['user_id'] = user['id']
    session['user_name'] = user['name']
    session['user_email'] = user['email']

    return jsonify({'message': 'Login successful.', 'user': current_user_payload()})


@app.post('/api/logout')
def logout():
    """Clear the current user session."""
    session.clear()
    return jsonify({'message': 'Logged out successfully.'})


@app.get('/api/datasets/current')
@login_required
def current_dataset():
    """Get the currently selected dataset."""
    return jsonify({'dataset': current_dataset_payload()})


@app.get('/api/datasets/recent')
@login_required
def recent_datasets():
    """Return recent uploaded datasets for the dashboard."""
    return jsonify({'datasets': session.get('recent_datasets', [])})


@app.post('/api/upload')
@login_required
def upload_file():
    """Handles CSV/Excel file uploads."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if not (file and allowed_file(file.filename)):
        return jsonify({'error': 'Invalid file format. Please upload a CSV or XLSX.'}), 400

    original_filename = secure_filename(file.filename)
    dataset_id = uuid.uuid4().hex
    stored_filename = f'{dataset_id}_{original_filename}'
    filepath = UPLOAD_FOLDER / stored_filename
    file.save(filepath)

    dataset_summary = build_dataset_summary(str(filepath), original_filename, dataset_id)
    session['active_file_path'] = str(filepath)
    session['dataset_summary'] = dataset_summary
    update_recent_datasets(dataset_summary)

    return jsonify({
        'message': f'File {original_filename} successfully uploaded and loaded into context!',
        'filename': original_filename,
        'dataset_summary': dataset_summary,
        'recent_datasets': session.get('recent_datasets', []),
    })


@app.post('/api/chat')
@login_required
def chat():
    """Handles natural language queries sent from the UI."""
    data = request.get_json() or {}
    user_message = data.get('message', '')
    history = data.get('history', [])

    active_file_path = session.get('active_file_path')
    if not active_file_path:
        return jsonify({'error': 'Please upload a dataset first before asking questions!'}), 400

    if not active_dataset_exists():
        clear_active_dataset()
        return jsonify({
            'error': 'Your uploaded dataset is no longer available on the server. Please re-upload it to continue analysis.',
            'dataset_missing': True,
        }), 410

    if not user_message:
        return jsonify({'error': 'Please enter a valid question.'}), 400

    try:
        result = query_dataset(user_message, active_file_path, history)

        return jsonify({
            'response': result.get('response', ''),
            'chart_json': result.get('chart_json'),
            'follow_ups': result.get('follow_ups', []),
            'dataset_summary': session.get('dataset_summary'),
        })
    except Exception as error:
        return jsonify({'error': f'Server Error: {str(error)}'}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  EDA — Automated Exploratory Data Analysis
# ─────────────────────────────────────────────────────────────────────────────

def _eda_statistical_summary(df):
    """Compute descriptive statistics for all numeric columns."""
    numeric_df = df.select_dtypes(include='number')
    if numeric_df.empty:
        return []

    stats = numeric_df.describe().T
    stats['median'] = numeric_df.median()
    stats['skewness'] = numeric_df.skew()
    stats['kurtosis'] = numeric_df.kurtosis()
    stats['missing'] = numeric_df.isna().sum()
    stats['missing_pct'] = (numeric_df.isna().sum() / len(df) * 100).round(2)

    result = []
    for col in stats.index:
        row = stats.loc[col]
        result.append({
            'column': col,
            'count': int(row['count']),
            'mean': round(float(row['mean']), 4),
            'std': round(float(row['std']), 4),
            'min': round(float(row['min']), 4),
            'q1': round(float(row['25%']), 4),
            'median': round(float(row['median']), 4),
            'q3': round(float(row['75%']), 4),
            'max': round(float(row['max']), 4),
            'skewness': round(float(row['skewness']), 4),
            'kurtosis': round(float(row['kurtosis']), 4),
            'missing': int(row['missing']),
            'missing_pct': float(row['missing_pct']),
        })
    return result


def _eda_missing_values(df):
    """Analyze missing values per column."""
    total = len(df)
    missing = df.isna().sum()
    result = []
    for col in df.columns:
        count = int(missing[col])
        result.append({
            'column': col,
            'missing_count': count,
            'missing_pct': round(count / total * 100, 2) if total > 0 else 0,
            'dtype': str(df[col].dtype),
        })
    return result


def _eda_correlation_matrix(df):
    """Compute correlation matrix and generate a heatmap chart."""
    numeric_df = df.select_dtypes(include='number')
    if numeric_df.shape[1] < 2:
        return None, None

    corr = numeric_df.corr()
    corr_data = []
    for col_a in corr.columns:
        for col_b in corr.columns:
            corr_data.append({
                'col_a': col_a,
                'col_b': col_b,
                'value': round(float(corr.loc[col_a, col_b]), 4),
            })

    # Generate heatmap
    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(max(8, numeric_df.shape[1] * 0.9), max(6, numeric_df.shape[1] * 0.7)))
    fig.patch.set_facecolor('#1e293b')
    ax.set_facecolor('#1e293b')
    sns.heatmap(
        corr,
        annot=True,
        fmt='.2f',
        cmap='RdYlGn',
        center=0,
        square=True,
        linewidths=0.5,
        linecolor='#334155',
        cbar_kws={'shrink': 0.8},
        ax=ax,
    )
    ax.set_title('Correlation Matrix', fontsize=14, color='#e2e8f0', pad=16)
    plt.tight_layout()
    chart_filename = 'eda_correlation.png'
    fig.savefig(CHARTS_FOLDER / chart_filename, dpi=150, bbox_inches='tight', facecolor='#1e293b')
    plt.close(fig)

    cache_bust = int((CHARTS_FOLDER / chart_filename).stat().st_mtime_ns)
    chart_url = f"/static/charts/{chart_filename}?v={cache_bust}"
    return corr_data, chart_url


def _eda_missing_chart(df):
    """Generate a missing values bar chart."""
    missing = df.isna().sum()
    missing = missing[missing > 0].sort_values(ascending=False)
    if missing.empty:
        return None

    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(max(8, len(missing) * 0.6), 5))
    fig.patch.set_facecolor('#1e293b')
    ax.set_facecolor('#1e293b')
    bars = ax.barh(missing.index.astype(str), missing.values, color='#f87171', edgecolor='#991b1b', height=0.6)
    ax.set_xlabel('Missing Count', color='#94a3b8')
    ax.set_title('Missing Values by Column', fontsize=14, color='#e2e8f0', pad=16)
    ax.invert_yaxis()
    for bar, val in zip(bars, missing.values):
        ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                f'{int(val)}', va='center', color='#e2e8f0', fontsize=10)
    plt.tight_layout()
    chart_filename = 'eda_missing_values.png'
    fig.savefig(CHARTS_FOLDER / chart_filename, dpi=150, bbox_inches='tight', facecolor='#1e293b')
    plt.close(fig)

    cache_bust = int((CHARTS_FOLDER / chart_filename).stat().st_mtime_ns)
    return f"/static/charts/{chart_filename}?v={cache_bust}"


def _eda_distribution_chart(df):
    """Generate distribution histograms for numeric columns."""
    numeric_cols = df.select_dtypes(include='number').columns.tolist()[:8]
    if not numeric_cols:
        return None

    n = len(numeric_cols)
    cols = min(n, 4)
    rows = (n + cols - 1) // cols

    plt.style.use('dark_background')
    fig, axes = plt.subplots(rows, cols, figsize=(4 * cols, 3.5 * rows))
    fig.patch.set_facecolor('#1e293b')

    axes_flat = np.array(axes).flatten() if n > 1 else [axes]
    for i, col in enumerate(numeric_cols):
        ax = axes_flat[i]
        ax.set_facecolor('#1e293b')
        data = df[col].dropna()
        ax.hist(data, bins=30, color='#3b82f6', edgecolor='#1e40af', alpha=0.85)
        ax.set_title(col, fontsize=10, color='#e2e8f0')
        ax.tick_params(colors='#94a3b8', labelsize=8)
    for j in range(n, len(axes_flat)):
        axes_flat[j].set_visible(False)

    fig.suptitle('Numeric Distributions', fontsize=14, color='#e2e8f0', y=1.02)
    plt.tight_layout()
    chart_filename = 'eda_distributions.png'
    fig.savefig(CHARTS_FOLDER / chart_filename, dpi=150, bbox_inches='tight', facecolor='#1e293b')
    plt.close(fig)

    cache_bust = int((CHARTS_FOLDER / chart_filename).stat().st_mtime_ns)
    return f"/static/charts/{chart_filename}?v={cache_bust}"


def _eda_outliers(df):
    """Detect outliers using IQR method for numeric columns."""
    numeric_df = df.select_dtypes(include='number')
    outliers = []
    for col in numeric_df.columns:
        q1 = numeric_df[col].quantile(0.25)
        q3 = numeric_df[col].quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        count = int(((numeric_df[col] < lower) | (numeric_df[col] > upper)).sum())
        outliers.append({
            'column': col,
            'outlier_count': count,
            'outlier_pct': round(count / len(df) * 100, 2) if len(df) > 0 else 0,
            'lower_bound': round(float(lower), 4),
            'upper_bound': round(float(upper), 4),
        })
    return outliers


def _eda_categorical_summary(df):
    """Summarize categorical columns."""
    cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
    result = []
    for col in cat_cols:
        value_counts = df[col].value_counts().head(10)
        result.append({
            'column': col,
            'unique_count': int(df[col].nunique()),
            'missing_count': int(df[col].isna().sum()),
            'top_values': [
                {'value': str(k), 'count': int(v)}
                for k, v in value_counts.items()
            ],
        })
    return result


@app.post('/api/eda')
@login_required
def run_eda():
    """Run automated Exploratory Data Analysis on the active dataset."""
    active_file_path = session.get('active_file_path')
    if not active_file_path or not active_dataset_exists():
        return jsonify({'error': 'No dataset loaded. Please upload one first.'}), 400

    try:
        df = load_uploaded_dataframe(active_file_path)

        stats_summary = _eda_statistical_summary(df)
        missing_analysis = _eda_missing_values(df)
        corr_data, corr_chart = _eda_correlation_matrix(df)
        missing_chart = _eda_missing_chart(df)
        dist_chart = _eda_distribution_chart(df)
        outliers = _eda_outliers(df)
        categorical = _eda_categorical_summary(df)

        # Data type breakdown
        dtype_counts = {
            'numeric': int(len(df.select_dtypes(include='number').columns)),
            'categorical': int(len(df.select_dtypes(include=['object', 'category']).columns)),
            'datetime': int(len(df.select_dtypes(include='datetime').columns)),
            'boolean': int(len(df.select_dtypes(include='bool').columns)),
        }

        # Memory usage
        memory_usage_bytes = int(df.memory_usage(deep=True).sum())
        if memory_usage_bytes > 1_048_576:
            memory_display = f"{memory_usage_bytes / 1_048_576:.2f} MB"
        else:
            memory_display = f"{memory_usage_bytes / 1024:.2f} KB"

        return jsonify({
            'eda': {
                'shape': {'rows': int(len(df)), 'columns': int(len(df.columns))},
                'dtype_counts': dtype_counts,
                'memory_usage': memory_display,
                'statistical_summary': stats_summary,
                'missing_analysis': missing_analysis,
                'correlation': corr_data,
                'correlation_chart': corr_chart,
                'missing_chart': missing_chart,
                'distribution_chart': dist_chart,
                'outliers': outliers,
                'categorical_summary': categorical,
            }
        })
    except Exception as error:
        return jsonify({'error': f'EDA failed: {str(error)}'}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  Data Preprocessing
# ─────────────────────────────────────────────────────────────────────────────

@app.post('/api/preprocess')
@login_required
def preprocess_data():
    """Apply selected preprocessing steps and return a summary of changes."""
    active_file_path = session.get('active_file_path')
    if not active_file_path or not active_dataset_exists():
        return jsonify({'error': 'No dataset loaded. Please upload one first.'}), 400

    data = request.get_json() or {}
    steps = data.get('steps', [])

    if not steps:
        return jsonify({'error': 'No preprocessing steps selected.'}), 400

    try:
        df = load_uploaded_dataframe(active_file_path)
        original_shape = df.shape
        log = []

        for step in steps:
            action = step.get('action')

            if action == 'drop_missing':
                before = len(df)
                df = df.dropna()
                removed = before - len(df)
                log.append(f'Dropped {removed} rows with missing values.')

            elif action == 'fill_missing':
                strategy = step.get('strategy', 'mean')
                columns = step.get('columns', [])
                target_cols = columns if columns else df.select_dtypes(include='number').columns.tolist()
                for col in target_cols:
                    if col not in df.columns:
                        continue
                    if strategy == 'mean' and pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].mean())
                    elif strategy == 'median' and pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].median())
                    elif strategy == 'mode':
                        mode_val = df[col].mode()
                        if not mode_val.empty:
                            df[col] = df[col].fillna(mode_val.iloc[0])
                    elif strategy == 'zero':
                        df[col] = df[col].fillna(0)
                    elif strategy == 'ffill':
                        df[col] = df[col].ffill()
                log.append(f'Filled missing values using {strategy} strategy on {len(target_cols)} column(s).')

            elif action == 'drop_duplicates':
                before = len(df)
                df = df.drop_duplicates()
                removed = before - len(df)
                log.append(f'Removed {removed} duplicate rows.')

            elif action == 'drop_columns':
                columns = step.get('columns', [])
                existing = [c for c in columns if c in df.columns]
                df = df.drop(columns=existing)
                log.append(f'Dropped {len(existing)} column(s): {existing}')

            elif action == 'encode_labels':
                from sklearn.preprocessing import LabelEncoder
                columns = step.get('columns', [])
                target_cols = columns if columns else df.select_dtypes(include=['object', 'category']).columns.tolist()
                le = LabelEncoder()
                for col in target_cols:
                    if col in df.columns:
                        df[col] = df[col].astype(str)
                        df[col] = le.fit_transform(df[col])
                log.append(f'Label-encoded {len(target_cols)} column(s).')

            elif action == 'onehot_encode':
                columns = step.get('columns', [])
                target_cols = columns if columns else df.select_dtypes(include=['object', 'category']).columns.tolist()[:5]
                df = pd.get_dummies(df, columns=target_cols, drop_first=True)
                log.append(f'One-hot encoded {len(target_cols)} column(s). New shape: {df.shape}')

            elif action == 'scale_standard':
                from sklearn.preprocessing import StandardScaler
                columns = step.get('columns', [])
                target_cols = columns if columns else df.select_dtypes(include='number').columns.tolist()
                existing = [c for c in target_cols if c in df.columns]
                if existing:
                    scaler = StandardScaler()
                    df[existing] = scaler.fit_transform(df[existing])
                    log.append(f'StandardScaler applied to {len(existing)} column(s).')

            elif action == 'scale_minmax':
                from sklearn.preprocessing import MinMaxScaler
                columns = step.get('columns', [])
                target_cols = columns if columns else df.select_dtypes(include='number').columns.tolist()
                existing = [c for c in target_cols if c in df.columns]
                if existing:
                    scaler = MinMaxScaler()
                    df[existing] = scaler.fit_transform(df[existing])
                    log.append(f'MinMaxScaler applied to {len(existing)} column(s).')

            elif action == 'remove_outliers':
                columns = step.get('columns', [])
                target_cols = columns if columns else df.select_dtypes(include='number').columns.tolist()
                before = len(df)
                for col in target_cols:
                    if col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
                        q1 = df[col].quantile(0.25)
                        q3 = df[col].quantile(0.75)
                        iqr = q3 - q1
                        df = df[(df[col] >= q1 - 1.5 * iqr) & (df[col] <= q3 + 1.5 * iqr)]
                removed = before - len(df)
                log.append(f'Removed {removed} outlier rows using IQR method.')

        # Save processed file
        processed_id = uuid.uuid4().hex[:12]
        processed_filename = f'processed_{processed_id}.csv'
        processed_path = PROCESSED_FOLDER / processed_filename
        df.to_csv(processed_path, index=False)

        # Update session with processed dataset
        dataset_summary = build_dataset_summary(str(processed_path), 'processed_dataset.csv', processed_id)
        session['active_file_path'] = str(processed_path)
        session['dataset_summary'] = dataset_summary

        # Preview of the processed data
        preview_rows = df.head(5).to_dict(orient='records')
        # Clean NaN values from preview
        for row in preview_rows:
            for key in row:
                if isinstance(row[key], float) and (np.isnan(row[key]) or np.isinf(row[key])):
                    row[key] = None

        return jsonify({
            'message': 'Preprocessing complete.',
            'log': log,
            'original_shape': {'rows': int(original_shape[0]), 'columns': int(original_shape[1])},
            'new_shape': {'rows': int(len(df)), 'columns': int(len(df.columns))},
            'preview': preview_rows,
            'columns': df.columns.tolist(),
            'download_id': processed_id,
            'dataset_summary': dataset_summary,
        })
    except Exception as error:
        return jsonify({'error': f'Preprocessing failed: {str(error)}'}), 500


@app.get('/api/download/<download_id>')
@login_required
def download_processed(download_id):
    """Download a processed CSV file."""
    processed_filename = f'processed_{download_id}.csv'
    processed_path = PROCESSED_FOLDER / processed_filename

    if not processed_path.exists():
        return jsonify({'error': 'Processed file not found.'}), 404

    return send_from_directory(PROCESSED_FOLDER, processed_filename,
                               as_attachment=True,
                               download_name='cleaned_dataset.csv')


@app.get('/api/profile')
@login_required
def data_profile():
    """Return an enhanced data profile for the active dataset."""
    active_file_path = session.get('active_file_path')
    if not active_file_path or not active_dataset_exists():
        return jsonify({'error': 'No dataset loaded.'}), 400

    try:
        df = load_uploaded_dataframe(active_file_path)
        total_rows = len(df)

        # Column-level profiling
        column_profiles = []
        for col in df.columns:
            non_null = int(df[col].notna().sum())
            unique = int(df[col].nunique())
            samples = df[col].dropna().head(3).astype(str).tolist()
            quality_score = round(non_null / total_rows * 100, 1) if total_rows > 0 else 0

            profile = {
                'name': col,
                'dtype': str(df[col].dtype),
                'non_null': non_null,
                'null_count': int(df[col].isna().sum()),
                'unique': unique,
                'unique_ratio': round(unique / total_rows * 100, 1) if total_rows > 0 else 0,
                'quality_score': quality_score,
                'samples': samples,
            }

            if pd.api.types.is_numeric_dtype(df[col]):
                profile['min'] = round(float(df[col].min()), 4) if not df[col].isna().all() else None
                profile['max'] = round(float(df[col].max()), 4) if not df[col].isna().all() else None
                profile['mean'] = round(float(df[col].mean()), 4) if not df[col].isna().all() else None

            column_profiles.append(profile)

        # Memory usage
        mem_bytes = int(df.memory_usage(deep=True).sum())
        if mem_bytes > 1_048_576:
            mem_display = f"{mem_bytes / 1_048_576:.2f} MB"
        else:
            mem_display = f"{mem_bytes / 1024:.2f} KB"

        # Overall data quality
        total_cells = total_rows * len(df.columns)
        total_missing = int(df.isna().sum().sum())
        overall_quality = round((1 - total_missing / total_cells) * 100, 1) if total_cells > 0 else 100

        # Duplicate info
        duplicate_count = int(df.duplicated().sum())

        # Anomaly Detection (Isolation Forest)
        anomalies = []
        numeric_df = df.select_dtypes(include='number').dropna()
        if not numeric_df.empty and len(numeric_df) > 50:
            iso_forest = IsolationForest(contamination=0.05, random_state=42)
            preds = iso_forest.fit_predict(numeric_df)
            anomaly_indices = numeric_df[preds == -1].index
            anomaly_count = len(anomaly_indices)
            anomalies = {
                'count': anomaly_count,
                'percentage': round(anomaly_count / total_rows * 100, 2),
                'sample_indices': anomaly_indices[:5].tolist()
            }
        else:
            anomalies = {'count': 0, 'percentage': 0, 'sample_indices': []}

        return jsonify({
            'profile': {
                'rows': total_rows,
                'columns': int(len(df.columns)),
                'memory_usage': mem_display,
                'overall_quality': overall_quality,
                'total_missing': total_missing,
                'duplicate_rows': duplicate_count,
                'anomalies': anomalies,
                'column_profiles': column_profiles,
            }
        })
    except Exception as error:
        return jsonify({'error': f'Profiling failed: {str(error)}'}), 500


@app.post('/api/history/add')
@login_required
def add_to_history():
    """Add a query-response pair to the session history."""
    data = request.get_json() or {}
    query = data.get('query', '')
    response_text = data.get('response', '')

    if not query:
        return jsonify({'error': 'No query provided.'}), 400

    history = session.get('query_history', [])
    history.append({
        'query': query[:500],
        'response': response_text[:1000],
        'timestamp': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    })
    session['query_history'] = history[-50:]  # Keep last 50 entries
    return jsonify({'message': 'Saved.', 'count': len(session['query_history'])})


@app.get('/api/history')
@login_required
def get_history():
    """Return the query history for the current session."""
    return jsonify({'history': session.get('query_history', [])})


# ─────────────────────────────────────────────────────────────────────────────
#  AutoML & Export
# ─────────────────────────────────────────────────────────────────────────────

@app.post('/api/automl')
@login_required
def run_automl():
    """Train multiple models on a selected target variable and return a leaderboard."""
    active_file_path = session.get('active_file_path')
    if not active_file_path or not active_dataset_exists():
        return jsonify({'error': 'No dataset loaded.'}), 400

    data = request.get_json() or {}
    target_col = data.get('target')

    if not target_col:
        return jsonify({'error': 'Target column not specified.'}), 400

    try:
        df = load_uploaded_dataframe(active_file_path).dropna()
        if target_col not in df.columns:
            return jsonify({'error': 'Target column not found.'}), 400
        
        y = df[target_col]
        X = df.drop(columns=[target_col], errors='ignore')
        
        # Automatic Categorical Encoding
        # Keep numeric columns
        numeric_cols = X.select_dtypes(include='number').columns.tolist()
        
        # Keep low-cardinality object/categorical columns
        cat_cols = [col for col in X.select_dtypes(exclude='number').columns 
                   if X[col].nunique() < 10]
        
        X = X[numeric_cols + cat_cols]
        if not cat_cols and not numeric_cols:
            return jsonify({'error': 'No usable features available to predict target.'}), 400
            
        # Apply One-Hot Encoding
        X = pd.get_dummies(X, columns=cat_cols, drop_first=True)
        
        if X.empty:
            return jsonify({'error': 'No numeric features available after encoding.'}), 400

        leaderboard = []

        if pd.api.types.is_numeric_dtype(y) and y.nunique() > 10:
            model_type = 'Regression'
            metric_name = 'R² Score'
            
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            
            models = {
                'Random Forest Regressor': RandomForestRegressor(n_estimators=50, random_state=42),
                'Linear Regression': LinearRegression(),
                'Decision Tree Regressor': DecisionTreeRegressor(random_state=42)
            }
            
            for name, model in models.items():
                model.fit(X_train, y_train)
                train_score = r2_score(y_train, model.predict(X_train))
                test_score = r2_score(y_test, model.predict(X_test))
                
                if hasattr(model, 'feature_importances_'):
                    importances = model.feature_importances_
                elif hasattr(model, 'coef_'):
                    importances = abs(model.coef_)
                else:
                    importances = [0] * len(X.columns)
                    
                top_features = sorted(zip(X.columns, importances), key=lambda x: x[1], reverse=True)[:5]
                leaderboard.append({
                    'name': name,
                    'train_score': round(float(train_score), 4),
                    'test_score': round(float(test_score), 4),
                    'score': round(float(test_score), 4), # for backwards compatibility in sorting
                    'feature_importance': [{'feature': f, 'importance': round(float(i), 4)} for f, i in top_features]
                })

        else:
            model_type = 'Classification'
            metric_name = 'Accuracy'
            y = y.astype(str)
            
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            
            models = {
                'Random Forest Classifier': RandomForestClassifier(n_estimators=50, random_state=42),
                'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42),
                'Decision Tree Classifier': DecisionTreeClassifier(random_state=42)
            }
            
            for name, model in models.items():
                model.fit(X_train, y_train)
                train_score = accuracy_score(y_train, model.predict(X_train))
                test_score = accuracy_score(y_test, model.predict(X_test))
                
                if hasattr(model, 'feature_importances_'):
                    importances = model.feature_importances_
                elif hasattr(model, 'coef_'):
                    importances = abs(model.coef_[0])
                else:
                    importances = [0] * len(X.columns)
                    
                top_features = sorted(zip(X.columns, importances), key=lambda x: x[1], reverse=True)[:5]
                leaderboard.append({
                    'name': name,
                    'train_score': round(float(train_score), 4),
                    'test_score': round(float(test_score), 4),
                    'score': round(float(test_score), 4),
                    'feature_importance': [{'feature': f, 'importance': round(float(i), 4)} for f, i in top_features]
                })

        # Sort leaderboard descending by test score
        leaderboard.sort(key=lambda x: x['test_score'], reverse=True)

        return jsonify({
            'model_type': model_type,
            'metric_name': metric_name,
            'leaderboard': leaderboard
        })

    except Exception as error:
        return jsonify({'error': f'AutoML failed: {str(error)}'}), 500


@app.get('/api/export_pdf')
@login_required
def export_pdf():
    """Generate a PDF report combining dataset summary."""
    active_file_path = session.get('active_file_path')
    if not active_file_path or not active_dataset_exists():
        return jsonify({'error': 'No dataset loaded.'}), 400

    try:
        df = load_uploaded_dataframe(active_file_path)
        
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=16, style='B')
        pdf.cell(200, 10, txt="Automated Data Analysis Report", ln=True, align='C')
        
        pdf.set_font("Arial", size=12)
        pdf.ln(10)
        pdf.cell(200, 10, txt=f"Total Rows: {len(df)}", ln=True)
        pdf.cell(200, 10, txt=f"Total Columns: {len(df.columns)}", ln=True)
        pdf.cell(200, 10, txt=f"Missing Values: {df.isna().sum().sum()}", ln=True)
        
        pdf.ln(10)
        pdf.set_font("Arial", size=14, style='B')
        pdf.cell(200, 10, txt="Columns:", ln=True)
        pdf.set_font("Arial", size=10)
        for col in df.columns[:20]:
            pdf.cell(200, 8, txt=f"- {col} ({df[col].dtype})", ln=True)

        if len(df.columns) > 20:
            pdf.cell(200, 8, txt=f"... and {len(df.columns)-20} more", ln=True)
            
        pdf_filename = f"report_{uuid.uuid4().hex[:8]}.pdf"
        pdf_path = PROCESSED_FOLDER / pdf_filename
        pdf.output(str(pdf_path))
        
        return send_from_directory(PROCESSED_FOLDER, pdf_filename, as_attachment=True)

    except Exception as error:
        return jsonify({'error': f'PDF generation failed: {str(error)}'}), 500


from flask import render_template

@app.route('/')
def index():
    """Serve the Jinja frontend."""
    return render_template('index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve the built React app as fallback or static files if needed."""
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    
    # Just in case, if they request anything else, we can fallback
    return jsonify({'error': 'Not found'}), 404


if __name__ == '__main__':
    app.run(debug=True, port=5000)
