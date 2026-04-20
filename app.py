import os
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import pandas as pd
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

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = BASE_DIR / 'uploads'
CHARTS_FOLDER = BASE_DIR / 'static' / 'charts'
DATABASE_PATH = BASE_DIR / 'users.db'
FRONTEND_DIST = BASE_DIR / 'frontend' / 'dist'

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key')
app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)

UPLOAD_FOLDER.mkdir(exist_ok=True)
CHARTS_FOLDER.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {'csv', 'xlsx'}
MAX_RECENT_DATASETS = 5


def get_db_connection():
    """Create a SQLite connection for auth data."""
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    """Create the users table if it does not exist."""
    with get_db_connection() as connection:
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


def current_dataset_payload():
    """Expose the active dataset summary for the frontend."""
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
        with get_db_connection() as connection:
            cursor = connection.execute(
                'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                (name, email, generate_password_hash(password)),
            )
            connection.commit()
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
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

    with get_db_connection() as connection:
        user = connection.execute(
            'SELECT id, name, email, password_hash FROM users WHERE email = ?',
            (email,),
        ).fetchone()

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

    if not user_message:
        return jsonify({'error': 'Please enter a valid question.'}), 400

    try:
        answer = query_dataset(user_message, active_file_path, history)

        chart_url = None
        if 'CHART_GENERATED:' in answer:
            parts = answer.split('CHART_GENERATED:')
            chart_filename = parts[1].strip()
            chart_path = CHARTS_FOLDER / chart_filename
            cache_bust = int(chart_path.stat().st_mtime_ns) if chart_path.exists() else uuid.uuid4().hex
            chart_url = f"{url_for('static', filename=f'charts/{chart_filename}')}?v={cache_bust}"
            answer = parts[0].strip() or 'Here is the chart you requested:'

        return jsonify({
            'response': answer,
            'chart_url': chart_url,
            'dataset_summary': session.get('dataset_summary'),
        })
    except Exception as error:
        return jsonify({'error': f'Server Error: {str(error)}'}), 500


@app.get('/', defaults={'path': ''})
@app.get('/<path:path>')
def serve_frontend(path):
    """Serve the built React app in production."""
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404

    if FRONTEND_DIST.exists():
        requested_path = FRONTEND_DIST / path
        if path and requested_path.exists() and requested_path.is_file():
            return send_from_directory(FRONTEND_DIST, path)
        return send_from_directory(FRONTEND_DIST, 'index.html')

    return frontend_placeholder()


if __name__ == '__main__':
    app.run(debug=True, port=5000)
