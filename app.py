import os
import uuid
import pandas as pd
from flask import Flask, render_template, request, jsonify, url_for, session
from werkzeug.utils import secure_filename
from agent import query_dataset

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key')

# Configure folders
UPLOAD_FOLDER = 'uploads'
CHARTS_FOLDER = 'static/charts'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CHARTS_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

ALLOWED_EXTENSIONS = {'csv', 'xlsx'}

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

@app.route('/')
def home():
    """Renders the main chat UI."""
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
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
    else:
        return jsonify({'error': 'Invalid file format. Please upload a CSV or XLSX.'}), 400

@app.route('/chat', methods=['POST'])
def chat():
    """Handles natural language queries sent from the UI."""
    data = request.get_json()
    user_message = data.get('message', '')
    history = data.get('history', [])

    active_file_path = session.get('active_file_path')
    if not active_file_path:
        return jsonify({'response': 'Please upload a dataset first before asking questions!'})
        
    if not user_message:
        return jsonify({'response': 'Please enter a valid question.'})

    try:
        # Pass the dataset path, question, and conversation history to the Agent
        answer = query_dataset(user_message, active_file_path, history)
        
        # Check if the AI generated a chart
        chart_url = None
        if "CHART_GENERATED:" in answer:
            # Parse chart filename out 
            parts = answer.split("CHART_GENERATED:")
            chart_filename = parts[1].strip()
            chart_url = url_for('static', filename=f'charts/{chart_filename}')
            # Keep text before the chart marker
            answer = parts[0].strip() or "Here is the chart you requested:"

        return jsonify({
            'response': answer,
            'chart_url': chart_url,
            'dataset_summary': session.get('dataset_summary')
        })
        
    except Exception as e:
        return jsonify({'response': f'Server Error: {str(e)}'}), 500

if __name__ == '__main__':
    # Run server locally
    app.run(debug=True, port=5000)
