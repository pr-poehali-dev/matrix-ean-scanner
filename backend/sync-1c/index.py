"""
Отправляет отсканированные штрихкоды в 1С через REST API и возвращает статус подтверждения.
Поддерживает одиночную отправку и батч. При ошибке возвращает details для переотправки.
"""

import json
import os
import urllib.request
import urllib.error

def handler(event: dict, context) -> dict:
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
        'Content-Type': 'application/json',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers, 'body': ''}

    if event.get('httpMethod') == 'GET':
        params = event.get('queryStringParameters') or {}
        server_ip = params.get('server_ip', '')
        server_port = params.get('server_port', '8080')
        api_path = params.get('api_path', '/api/v1/ping')

        if not server_ip:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'ok': False, 'error': 'server_ip required'}),
            }

        url = f'http://{server_ip}:{server_port}{api_path}'
        try:
            req = urllib.request.Request(url, method='GET')
            req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req, timeout=5) as resp:
                return {
                    'statusCode': 200,
                    'headers': cors_headers,
                    'body': json.dumps({'ok': True, 'message': 'connected'}),
                }
        except Exception as e:
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({'ok': False, 'error': str(e)}),
            }

    body = json.loads(event.get('body') or '{}')
    codes = body.get('codes', [])
    server_ip = body.get('server_ip', '')
    server_port = body.get('server_port', '8080')
    api_path = body.get('api_path', '/api/v1/scan')

    if not server_ip:
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'ok': False, 'error': 'server_ip required'}),
        }

    if not codes:
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'ok': False, 'error': 'codes array required'}),
        }

    url = f'http://{server_ip}:{server_port}{api_path}'
    payload = json.dumps({'codes': codes}).encode('utf-8')

    try:
        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_body = resp.read().decode('utf-8')
            resp_data = json.loads(resp_body) if resp_body else {}
            confirmed = resp_data.get('confirmed', [c['id'] for c in codes])
            rejected = resp_data.get('rejected', [])
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    'ok': True,
                    'confirmed': confirmed,
                    'rejected': rejected,
                }),
            }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8') if e.fp else ''
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'ok': False,
                'error': f'HTTP {e.code}',
                'details': err_body,
                'rejected': [c['id'] for c in codes],
            }),
        }
    except Exception as e:
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'ok': False,
                'error': str(e),
                'rejected': [c['id'] for c in codes],
            }),
        }
