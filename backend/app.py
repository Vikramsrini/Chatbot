import os
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
from werkzeug.utils import secure_filename  # Fixed import (was werkzeug.security)
import tempfile
import PIL.Image
import PyPDF2

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__, template_folder='../frontend/templates', static_folder='../frontend/static')
CORS(app)

# Configuration
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'pdf', 'txt'}
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB limit (fixed typo in CONTENT_LENGTH)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Initialize Gemini with free models
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def get_model_for_request(is_multimodal=False):
    """Returns the appropriate free model based on request type"""
    return genai.GenerativeModel('gemini-1.5-pro' if is_multimodal else 'gemini-2.0-flash')

def process_image(filepath):
    """Process image files using the vision model"""
    img = PIL.Image.open(filepath)
    model = get_model_for_request(is_multimodal=True)
    response = model.generate_content(["Analyze this image", img])
    return response.text

def process_pdf(filepath):
    """Process PDF files by extracting text"""
    pdf_text = ""
    with open(filepath, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pdf_text += text + "\n"
    
    if not pdf_text.strip():
        raise ValueError("Could not extract text from PDF")
    
    model = get_model_for_request()
    response = model.generate_content(f"Extracted text from PDF:\n{pdf_text}\n\nAnalyze this content")
    return response.text

def process_text_file(filepath):
    """Process plain text files"""
    with open(filepath, 'r') as f:
        text = f.read()
    model = get_model_for_request()
    response = model.generate_content(text)
    return response.text

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/chat', methods=['POST'])
def chat():
    try:
        # Log request details for debugging
        app.logger.info(f"Request content type: {request.content_type}")
        app.logger.info(f"Request form: {request.form}")
        app.logger.info(f"Request files: {request.files}")

        # Initialize the model
        model = get_model_for_request(is_multimodal=('file' in request.files and request.files['file'].filename != ''))

        # Check if the request contains a file
        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({'error': 'No selected file'}), 400

            if not allowed_file(file.filename):
                return jsonify({'error': 'File type not allowed'}), 400

            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

            try:
                file.save(filepath)

                # Process image files
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    img = PIL.Image.open(filepath)
                    response = model.generate_content(["Analyze this image", img])
                    return jsonify({
                        'reply': response.text,
                        'file_url': f'/uploads/{filename}'
                    })

                # Process PDF files
                elif filename.lower().endswith('.pdf'):
                    pdf_text = ""
                    with open(filepath, 'rb') as f:
                        reader = PyPDF2.PdfReader(f)
                        for page in reader.pages:
                            text = page.extract_text()
                            if text:
                                pdf_text += text + "\n"

                    if not pdf_text.strip():
                        return jsonify({'error': 'Could not extract text from PDF'}), 400

                    response = model.generate_content(
                        f"Extracted text from PDF:\n{pdf_text}\n\nAnalyze this content"
                    )
                    return jsonify({
                        'reply': response.text,
                        'file_url': f'/uploads/{filename}'
                    })

                # Process text files
                elif filename.lower().endswith('.txt'):
                    with open(filepath, 'r') as f:
                        text = f.read()
                    response = model.generate_content(text)
                    return jsonify({
                        'reply': response.text,
                        'file_url': f'/uploads/{filename}'
                    })

                else:
                    return jsonify({'error': 'Unsupported file type'}), 400

            finally:
                try:
                    os.remove(filepath)
                except:
                    pass

        # Handle text messages sent as form data
        if 'message' in request.form:
            user_message = request.form.get('message', '').strip()
            if not user_message:
                return jsonify({'error': 'Empty message'}), 400

            response = model.generate_content(user_message)
            return jsonify({'reply': response.text})

        # Handle JSON data for text messages
        if request.is_json:
            data = request.get_json()
            user_message = data.get('message', '').strip()
            if not user_message:
                return jsonify({'error': 'Empty message'}), 400

            response = model.generate_content(user_message)
            return jsonify({'reply': response.text})

        # If no valid input is found
        return jsonify({'error': 'Invalid request format'}), 400

    except Exception as e:
        app.logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500
if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')