"""Let the autoplay bot (tests/bot.js) play N turns on a phone viewport; reports errors and outcome.
Usage: python3 tests/bot_run.py [turns]"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TURNS = int(sys.argv[1]) if len(sys.argv) > 1 else 25
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-component-update'])
        c = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pg = await c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'index.html')); await pg.wait_for_timeout(800)
        await pg.evaluate('window.__speed = 6')
        await pg.touchscreen.tap(195, 300); await pg.wait_for_timeout(300)
        await pg.evaluate('startMission()'); await pg.wait_for_timeout(500)
        await pg.evaluate(open(os.path.join(ROOT, 'tests', 'bot.js')).read())
        await pg.evaluate(f"() => {{ __bot({TURNS}).then(r => window.__botR = r).catch(e => window.__botR = 'BOT ERROR ' + e); return 1; }}")
        for _ in range(150):
            await asyncio.sleep(4)
            if await pg.evaluate('!!window.__botR'): break
        r = await pg.evaluate('window.__botR')
        print({k: v for k, v in r.items() if k != 'log'} if isinstance(r, dict) else r)
        print('errors:', errs or 'none')
        await b.close()
asyncio.run(main())
