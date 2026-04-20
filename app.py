import os
import sqlite3
import uuid
from functools import wraps

import pandas as pd
from flask import Flask, jsonify, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from agent import query_dataset

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key')

# Configure folders
UPLOAD_FOLDER = 'uploads'
CHARTS_FOLDER = 'static/charts'
DATABASE_PATH = 'users.db'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CHARTS_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

ALLOWED_EXTENSIONS = {'csv', 'xlsx'}


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
        'email': session.get('user_email')
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


def build_dataset_summary(file_path, filename):
    """Build a lightweight summary for the UI."""
    df = load_uploaded_dataframe(file_path)
    numeric_columns = df.select_dtypes(include='number').columns.tolist()
    missing_values = int(df.isna().sum().sum())

    preview_columns = []
    for column in df.columns[:6]:
        preview_columns.append({
            'name': column,
            'dtype': str(df[column].dtype)
        })

    return {
        'filename': filename,
        'rows': int(len(df)),
        'columns': int(len(df.columns)),
        'numeric_columns': int(len(numeric_columns)),
        'missing_values': missing_values,
        'preview_columns': preview_columns
    }


init_db()


@app.route('/')
def home():
    """Renders the main chat UI."""
    return render_template('index.html', user=current_user_payload())


@app.route('/auth/status')
def auth_status():
    """Returns the current authentication state."""
    return jsonify({'authenticated': bool(session.get('user_id')), 'user': current_user_payload()})


@app.route('/signup', methods=['POST'])
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
                (name, email, generate_password_hash(password))
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


@app.route('/login', methods=['POST'])
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
            (email,)
        ).fetchone()

    if user is None or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    session.clear()
    session['user_id'] = user['id']
    session['user_name'] = user['name']
    session['user_email'] = user['email']

    return jsonify({'message': 'Login successful.', 'user': current_user_payload()})


@app.route('/logout', methods=['POST'])
def logout():
    """Clear the current user session."""
    session.clear()
    return jsonify({'message': 'Logged out successfully.'})


@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    """Handles CSV/Excel file uploads."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)

        dataset_summary = build_dataset_summary(filepath, filename)
        session['active_file_path'] = filepath
        session['dataset_summary'] = dataset_summary

        return jsonify({
            'message': f'File {filename} successfully uploaded and loaded into context!',
            'filename': filename,
            'dataset_summary': dataset_summary
        })

    return jsonify({'error': 'Invalid file format. Please upload a CSV or XLSX.'}), 400


@app.route('/chat', methods=['POST'])
@login_required
def chat():
    """Handles natural language queries sent from the UI."""
    data = request.get_json() or {}
    user_message = data.get('message', '')
    history = data.get('history', [])

    active_file_path = session.get('active_file_path')
    if not active_file_path:
        return jsonify({'response': 'Please upload a dataset first before asking questions!'})

    if not user_message:
        return jsonify({'response': 'Please enter a valid question.'})

    try:
        answer = query_dataset(user_message, active_file_path, history)

        chart_url = None
        if "CHART_GENERATED:" in answer:
            parts = answer.split("CHART_GENERATED:")
            chart_filename = parts[1].strip()
            chart_url = url_for('static', filename=f'charts/{chart_filename}')
            answer = parts[0].strip() or "Here is the chart you requested:"

        return jsonify({
            'response': answer,
            'chart_url': chart_url,
            'dataset_summary': session.get('dataset_summary')
        })

    except Exception as error:
        return jsonify({'response': f'Server Error: {str(error)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
