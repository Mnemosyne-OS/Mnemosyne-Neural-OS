"""Draws the test image used in these notes: 3000x2000, coloured lines, a red
block, and the words HELLO MNEMOSYNE in Pillow's default font (about 11 px
tall, the hard part to read). Also writes copies whose longest side is 2048,
1920, 1792, 1664, 1536 and 1024 px.

usage: python make-test-image.py   (needs Pillow)
"""
from PIL import Image, ImageDraw

im = Image.new('RGB', (3000, 2000), 'white')
d = ImageDraw.Draw(im)
for i in range(0, 3000, 60):
    d.line([(i, 0), (3000 - i, 2000)], fill=(i % 255, 80, 160), width=4)
d.rectangle([800, 600, 2200, 1400], fill=(200, 30, 30))
d.text((900, 700), 'HELLO MNEMOSYNE', fill='white')
im.save('test-3000.png')
for w in (2048, 1920, 1792, 1664, 1536, 1024):
    im.resize((w, w * 2 // 3), Image.LANCZOS).save(f'test-{w}.png')
print('wrote test-3000.png and six smaller copies')
