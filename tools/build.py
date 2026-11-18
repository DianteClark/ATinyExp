"""Bundle src/ + assets/ into one self-contained index.html (plays offline, from file:// or GitHub Pages)."""
import base64, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()

IMG = {f[:-4]: 'data:image/png;base64,' + b64(os.path.join(A, 'img', f)) for f in sorted(os.listdir(os.path.join(A, 'img'))) if f.endswith('.png')}
AUD = {f[:-4]: b64(os.path.join(A, 'audio', f)) for f in sorted(os.listdir(os.path.join(A, 'audio'))) if f.endswith('.mp3')}
VOICE = json.load(open(os.path.join(A, 'voice.json')))
MUSIC = {f[:-5]: json.load(open(os.path.join(A, 'music', f))) for f in sorted(os.listdir(os.path.join(A, 'music'))) if f.endswith('.json')}

js = 'const IMG=' + json.dumps(IMG) + ';\nconst AUD=' + json.dumps(AUD) + ';\nconst VOICE=' + json.dumps(VOICE) + ';\nconst MUSIC=' + json.dumps(MUSIC, separators=(',', ':')) + ';\n'
for f in ['core.js', 'data.js', 'map.js', 'units.js', 'combat.js', 'game.js', 'missions.js', 'render.js', 'hud.js', 'screens.js', 'main.js']:
    js += '\n// ---- ' + f + ' ----\n' + open(os.path.join(ROOT, 'src', f)).read()

favicon = 'data:image/png;base64,' + b64(os.path.join(ROOT, 'icons', 'favicon-32.png'))
html = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Robot Warfare: Dead Signal</title>
<meta name="theme-color" content="#05061a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Robot Warfare">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="{favicon}">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<style>
html,body{{margin:0;height:100%;background:#05061a;overflow:hidden;touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}}
body{{display:flex;justify-content:center}}
canvas{{display:block;image-rendering:pixelated;image-rendering:crisp-edges;cursor:none}}
</style></head><body>
<canvas id="cv"></canvas>
<script>
{js}
</script>
</body></html>'''
open(os.path.join(ROOT, 'index.html'), 'w').write(html)
print('index.html', len(html) // 1024, 'KB')
