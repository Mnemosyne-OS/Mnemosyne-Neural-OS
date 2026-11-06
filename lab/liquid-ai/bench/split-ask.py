"""One timed question to a running llama-server.

Prints how fast the prompt was read, how fast the answer was written, and
when the first answer text arrived. The question is in French on purpose:
our users ask in French, and the answer language is part of the test.

usage: python split-ask.py <port> <document.txt>
"""
import json
import sys
import time
import urllib.request

port, ctx_file = sys.argv[1], sys.argv[2]
context = open(ctx_file, encoding='utf-8').read()[:6000]
body = {
    'messages': [
        {'role': 'system', 'content': 'Tu es une assistante. Réponds en français.'},
        {'role': 'user', 'content': f'{context}\n\nRésume ce document en trois phrases.'},
    ],
    'max_tokens': 256,
    'temperature': 0.2,
    'stream': True,
}
req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', data=json.dumps(body).encode(),
                             headers={'Content-Type': 'application/json'})
t0 = time.time()
first = None
timings = None
with urllib.request.urlopen(req, timeout=600) as r:
    for raw in r:
        line = raw.decode('utf-8', 'replace').strip()
        if not line.startswith('data:') or line == 'data: [DONE]':
            continue
        ev = json.loads(line[5:])
        if first is None and ev.get('choices') and (ev['choices'][0].get('delta') or {}).get('content'):
            first = time.time() - t0
        if ev.get('timings'):
            timings = ev['timings']
t = timings or {}
print(json.dumps({
    'first_text_s': round(first, 2) if first else None,
    'total_s': round(time.time() - t0, 2),
    'prompt_tokens': t.get('prompt_n'),
    'prompt_tok_s': round(t.get('prompt_per_second', 0), 1),
    'write_tokens': t.get('predicted_n'),
    'write_tok_s': round(t.get('predicted_per_second', 0), 1),
}))
