from flask import Flask, request, Response
import requests
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow all origins

HIVE_ENGINE_API = 'https://api.hive-engine.com/rpc'

@app.route('/he-proxy', methods=['POST', 'OPTIONS'])
def he_proxy():
    # Forward the POST request to Hive Engine API
    try:
        resp = requests.post(HIVE_ENGINE_API, data=request.data, headers={'Content-Type': 'application/json'})
        return Response(resp.content, status=resp.status_code, content_type=resp.headers.get('Content-Type', 'application/json'))
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/')
def home():
    return {'msg': 'Hive Engine CORS Proxy running!'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
