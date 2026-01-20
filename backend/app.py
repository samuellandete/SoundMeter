from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__, static_folder=None)
CORS(app)

# Register blueprints
from routes.config import config_bp
app.register_blueprint(config_bp)
from routes.logs import logs_bp
app.register_blueprint(logs_bp)
from routes.export import export_bp
app.register_blueprint(export_bp)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

# Serve frontend - use absolute path for Docker compatibility
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'build'))

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
