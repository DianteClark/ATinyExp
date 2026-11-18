"""Headless smoke test: phone portrait (tap/pinch/move/fire), phone landscape (rotate screen), desktop.
Usage: python3 tests/smoke.py OUT_DIR   (needs playwright + Chrome)"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'index.html')
ARGS = ['--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-component-update']

async def phone(b):
    c = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = await c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(900)
    await pg.screenshot(path=f'{OUT}/p_title.png')
    await pg.touchscreen.tap(195, 422); await pg.wait_for_timeout(2600)
    await pg.screenshot(path=f'{OUT}/p_dialog.png')
    sk = await pg.evaluate("(() => { const b = hud.find(h => h.id === 'skip'); return [(b.x + 5) * SCALE, (b.y + 5) * SCALE]; })()")
    await pg.touchscreen.tap(*sk)
    await pg.evaluate("window.__speed = 5"); await pg.wait_for_timeout(1500); await pg.evaluate("window.__speed = 1"); await pg.wait_for_timeout(1200)
    print('phone', await pg.evaluate("JSON.stringify({state: G.state, HS, WS, VW, VH, WVW: Math.round(WVW)})"))
    await pg.screenshot(path=f'{OUT}/p_play.png')
    tile = lambda tx, ty: pg.evaluate(f"[(({tx}*16+8) - cam.x) * WS / DPR, (({ty}*16+8) - cam.y) * WS / DPR]")
    x, y = await tile(3, 20); await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(900)
    x, y = await tile(6, 18); await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(400)
    await pg.screenshot(path=f'{OUT}/p_preview.png')
    await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(1800)
    print(' reyes moved to', await pg.evaluate("[byKey('reyes').x, byKey('reyes').y]"))
    # pinch out with two fingers via CDP
    cdp = await c.new_cdp_session(pg)
    z0 = await pg.evaluate('WS')
    pts = lambda d: [{'x': 195 - d, 'y': 400, 'id': 1}, {'x': 195 + d, 'y': 400, 'id': 2}]
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(40)})
    for d in range(40, 110, 10):
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(d)}); await pg.wait_for_timeout(30)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(400)
    print(' pinch zoom', z0, '->', await pg.evaluate('WS'))
    await pg.screenshot(path=f'{OUT}/p_zoomed.png')
    zo = await pg.evaluate("(() => { const b = hud.find(h => h.id === 'zoomout'); return [(b.x + 10) * SCALE, (b.y + 10) * SCALE]; })()")
    for _ in range(4): await pg.touchscreen.tap(*zo); await pg.wait_for_timeout(120)
    print(' zoom-out button ->', await pg.evaluate('WS'))
    await pg.screenshot(path=f'{OUT}/p_zoomout.png')
    # contact + fire
    await pg.evaluate("""() => { const r = byKey('reyes'); r.x = 13; r.y = 17; const o = byKey('okafor'); o.x = 12; o.y = 18; const h = byKey('haas'); h.x = 11; h.y = 17; const l = byKey('lin'); l.x = 12; l.y = 16; G.flags.firstContact = true; computeVis(); G.tip = null; setZoom(HS + 2); selectUnit(byKey('reyes'), true); }""")
    await pg.wait_for_timeout(1200)
    t = (await pg.evaluate("enemies().filter(e => e.visible && canTarget(byKey('reyes'), e)).map(e => [e.x, e.y])"))[0]
    x, y = await tile(*t); await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(400)
    await pg.screenshot(path=f'{OUT}/p_target.png')
    await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(350)
    await pg.screenshot(path=f'{OUT}/p_fire.png')
    await pg.wait_for_timeout(1500)
    print(' reyes acted', await pg.evaluate("byKey('reyes').acted"))
    print(' errors:', errs or 'none'); await c.close()

async def landscape(b):
    c = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = await c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(900)
    print('landscape ROTATE =', await pg.evaluate('ROTATE'))
    await pg.screenshot(path=f'{OUT}/l_rotate.png')
    print(' errors:', errs or 'none'); await c.close()

async def desktop(b):
    pg = await b.new_page(viewport={'width': 1280, 'height': 720}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(900)
    await pg.mouse.click(640, 360); await pg.wait_for_timeout(500)
    await pg.keyboard.press('Escape'); await pg.evaluate("window.__speed = 5"); await pg.wait_for_timeout(1500); await pg.evaluate("window.__speed = 1"); await pg.wait_for_timeout(1200)
    await pg.mouse.move(640, 300)
    await pg.screenshot(path=f'{OUT}/d_play.png')
    print('desktop', await pg.evaluate("JSON.stringify({state: G.state, HS, WS, VW, VH})"), 'errors:', errs or 'none')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        await phone(b); await landscape(b); await desktop(b)
        await b.close()
asyncio.run(main())
