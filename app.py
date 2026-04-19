import os
from flask import Flask, render_template, request, jsonify, url_for
from werkzeug.utils import secure_filename
from agent import query_dataset

app = Flask(__name__)

# Configure folders
UPLOAD_FOLDER = 'uploads'
CHARTS_FOLDER = 'static/charts'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CHARTS_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Global variable to track active file context
# In a production app, use Sessions or a Database!
session_state = {
    'active_file_path': None
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
        
    if file and (file.filename.endswith('.csv') or file.filename.endswith('.xlsx')):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Set file to active context
        session_state['active_file_path'] = filepath
        
        return jsonify({
            'message': f'File {filename} successfully uploaded and loaded into context!',
            'filename': filename
        })
    else:
        return jsonify({'error': 'Invalid file format. Please upload a CSV or XLSX.'}), 400

@app.route('/chat', methods=['POST'])
def chat():
    """Handles natural language queries sent from the UI."""
    data = request.get_json()
    user_message = data.get('message', '')
    
    if not session_state['active_file_path']:
        return jsonify({'response': 'Please upload a dataset first before asking questions!'})
        
    if not user_message:
        return jsonify({'response': 'Please enter a valid question.'})

    try:
        # Pass the dataset path and question to the Agent
        answer = query_dataset(user_message, session_state['active_file_path'])
        
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
            'chart_url': chart_url
        })
        
    except Exception as e:
        return jsonify({'response': f'Server Error: {str(e)}'}), 500

if __name__ == '__main__':
    # Run server locally
    app.run(debug=True, port=5000)
