"""Does a model put its reasoning into the answer on llama-server?

Start the server with the thought budget you want to check, for example
`--reasoning-format deepseek --reasoning-budget 0`, then run this. A clean
model returns its reasoning in `reasoning_content` and the answer alone in
`content`. A leak shows as reasoning text inside `content`, often closed by
a literal </think>.

usage: python leak-ask.py <port>
"""
import json
import re
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')
port = sys.argv[1]
questions = [
    "Explique en deux phrases ce qu'est une mémoire vectorielle.",
    'Quelle heure est-il à Tokyo quand il est midi à Paris ?',
]
for q in questions:
    body = {'messages': [{'role': 'system', 'content': 'Réponds en français, en une ou deux phrases.'},
                         {'role': 'user', 'content': q}],
            'max_tokens': 1200, 'temperature': 0.2}
    req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    msg = json.load(urllib.request.urlopen(req, timeout=300))['choices'][0]['message']
    content = msg.get('content') or ''
    # An empty <think></think> pair at the start is the template's own, not a leak.
    after_empty_pair = re.sub(r'^\s*<think>\s*</think>', '', content)
    print(json.dumps({'question': q[:40],
                      'reasoning_chars': len(msg.get('reasoning_content') or ''),
                      'close_think_in_answer': '</think>' in after_empty_pair,
                      'answer_start': content[:220]}, ensure_ascii=False))
