"""One image to a llama-server started with --mmproj, timed.

usage: python vl-ask.py <port> <image.png> [text the description must contain]

The third argument checks the reading: with the image from make-test-image.py,
pass "HELLO MNEMOSYNE" (the small text drawn in it).
"""
import base64
import json
import sys
import time
import urllib.request

port, image = sys.argv[1], sys.argv[2]
expected = sys.argv[3] if len(sys.argv) > 3 else None
data = base64.b64encode(open(image, 'rb').read()).decode()
prompt = ('Describe this image precisely: what it shows, the people, objects and setting, '
          'and copy any visible text exactly. Plain text, no preamble.')
body = {'messages': [{'role': 'user', 'content': [
    {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{data}'}},
    {'type': 'text', 'text': prompt}]}],
    'max_tokens': 512, 'temperature': 0.1, 'top_k': 50, 'repeat_penalty': 1.1}
t0 = time.time()
req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', data=json.dumps(body).encode(),
                             headers={'Content-Type': 'application/json'})
out = json.load(urllib.request.urlopen(req, timeout=600))
text = out['choices'][0]['message'].get('content') or ''
t = out.get('timings', {})
result = {'total_s': round(time.time() - t0, 1), 'prompt_ms': round(t.get('prompt_ms', 0)),
          'write_tok_s': round(t.get('predicted_per_second', 0), 1), 'chars': len(text)}
if expected:
    result['text_found'] = expected in text
print(json.dumps(result))
