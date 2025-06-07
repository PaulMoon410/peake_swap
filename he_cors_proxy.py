from flask import Flask, request, Response, make_response
import requests
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)  # Allow all origins

HIVE_ENGINE_API = 'https://api.hive-engine.com/rpc'

@app.route('/he-proxy', methods=['POST', 'OPTIONS'])
def he_proxy():
    if request.method == 'OPTIONS':
        response = make_response('', 204)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS'
        response.headers['Access-Control-Max-Age'] = '86400'
        return response
    # Forward the POST request to Hive Engine API
    try:
        resp = requests.post(HIVE_ENGINE_API, data=request.data, headers={'Content-Type': 'application/json'})
        proxy_response = make_response(resp.content, resp.status_code)
        proxy_response.headers['Content-Type'] = resp.headers.get('Content-Type', 'application/json')
        proxy_response.headers['Access-Control-Allow-Origin'] = '*'
        proxy_response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        proxy_response.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS'
        proxy_response.headers['Access-Control-Max-Age'] = '86400'
        return proxy_response
    except Exception as e:
        error_response = make_response({'error': str(e)}, 500)
        error_response.headers['Access-Control-Allow-Origin'] = '*'
        error_response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        error_response.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS'
        error_response.headers['Access-Control-Max-Age'] = '86400'
        return error_response

@app.route('/')
def home():
    return {'msg': 'Hive Engine CORS Proxy running!'}

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
