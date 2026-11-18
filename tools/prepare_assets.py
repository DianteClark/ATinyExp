"""Turn the raw asset packs into the trimmed files the game ships with (assets/).

Usage: python3 tools/prepare_assets.py /path/to/raw
where raw/ contains the unzipped packs:
  Robot Warfare Asset Pack 22-11-24/, Super Dialogue Audio Pack v1/,
  400_Sounds_Pack/, 96_Extra_SFX/, Midi files/
The raw packs are not committed (they are large); assets/ is.
"""
import json, os, shutil, subprocess, sys
import mido
from PIL import Image, ImageFont, ImageDraw

RAW = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
PACK = os.path.join(RAW, 'Robot Warfare Asset Pack 22-11-24') + '/'
VOX = os.path.join(RAW, 'Super Dialogue Audio Pack v1', 'Step 2 - Audio Files') + '/'
S400 = os.path.join(RAW, '400_Sounds_Pack') + '/'
SX = os.path.join(RAW, '96_Extra_SFX') + '/'
MID = os.path.join(RAW, 'Midi files') + '/'

sprites = {
  'tiles': 'Tileset/tileset_compressed.png', 'tilesA': 'Tileset/tileset_arranged.png',
  'obj': 'Obstacles and Objects/obstacles-and-objects.png',
  'leader': 'Soldiers/SquadLeader.png', 'gunner': 'Soldiers/MachineGunner-Class.png',
  'grenadier': 'Soldiers/Grenadier-Class.png', 'sniper': 'Soldiers/Sniper-Class.png',
  'radio': 'Soldiers/RadioOperator-Class.png', 'assault': 'Soldiers/Assault-Class.png',
  'spider': 'Robots/Spider.png', 'scarab': 'Robots/Scarab.png', 'hornet': 'Robots/Hornet.png',
  'wasp': 'Robots/Wasp.png', 'centipede': 'Robots/Centipede.png',
  'bigexp': 'Effects/big-explosion.png', 'bigfrag': 'Effects/big-fragments.png',
  'impact': 'Effects/bullet-impacts.png', 'sparks': 'Effects/hit-sparks.png',
  'spatter': 'Effects/hit-spatters.png', 'laser': 'Effects/laser-flash.png',
  'muzzle': 'Effects/muzzle-flashes.png', 'smallexp': 'Effects/small-explosion.png',
  'smallfrag': 'Effects/small-fragments.png', 'smoke': 'Effects/smoke.png',
  'grenade': 'Projectiles/Grenade.png', 'bullets': 'Projectiles/bullets+plasma.png',
  'rangegrid': 'UI/range-grid.png', 'selcircle': 'UI/selection-circles.png',
  'selcursor': 'UI/selection-cursor.png', 'tgtcursor': 'UI/target-cursor.png',
  'flag': 'UI/objective-flag.png', 'pulse': 'UI/objective-pulse.png',
  'icons': 'UI/icon-set.png', 'insignia': 'UI/squad-insignia.png',
  'terrain': 'UI/terrain-icons.png', 'numbers': 'UI/numbers.png',
  'arrows': 'UI/solid-arrows-thick.png', 'pointer': 'UI/mouse-pointer.png',
  'overheadbars': 'UI/overhead-health-bars.png', 'healthbars': 'UI/health-bars.png',
}
for k, v in sprites.items():
    shutil.copy(PACK + v, f'{A}/img/{k}.png')

# 6x11 bitmap font atlas (ASCII 32..126) from Pillow's built-in bitmap font
f = ImageFont.load_default_imagefont()
chars = ''.join(chr(c) for c in range(32, 127))
atlas = Image.new('RGBA', (6 * len(chars), 11), (0, 0, 0, 0))
d = ImageDraw.Draw(atlas)
for i, ch in enumerate(chars):
    d.text((i * 6, 0), ch, font=f, fill=(255, 255, 255, 255))
atlas.save(f'{A}/img/font.png')

def enc(src, key, maxdur=None, br='48k', trim=True):
    out = f'{A}/audio/{key}.mp3'
    af = []
    if trim: af.append('silenceremove=start_periods=1:start_threshold=-50dB')
    if maxdur: af.append(f'atrim=0:{maxdur},afade=t=out:st={max(0, maxdur - 0.08)}:d=0.08')
    cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '22050']
    if af: cmd += ['-af', ','.join(af)]
    subprocess.run(cmd + ['-b:a', br, out], check=True)

sfx = {
  'select': S400 + 'UI/sci_fi_select.wav', 'confirm': S400 + 'UI/sci_fi_confirm.wav',
  'cancel': S400 + 'UI/sci_fi_cancel.wav', 'disallow': S400 + 'UI/sci_fi_disallow.wav',
  'hover': S400 + 'UI/sci_fi_hover.wav', 'warning': S400 + 'UI/synth_warning.wav',
  'complete': S400 + 'UI/synth_process_complete.wav', 'blip': S400 + 'Retro/menu_blip.wav',
  'toggle': S400 + 'UI/toggle_on.wav', 'selbig': S400 + 'UI/sci_fi_select_big.wav',
  'shot': S400 + 'Weapons/shot_muffled.wav', 'thud': S400 + 'Weapons/harsh_thud.wav',
  'equip': S400 + 'Weapons/weapon_equip_short.wav',
  'expL': S400 + 'Retro/explosion_large.wav', 'expM': S400 + 'Retro/explosion_medium.wav',
  'expS': S400 + 'Retro/explosion_small.wav', 'expQ': S400 + 'Retro/explosion_quick.wav',
  'throw': S400 + 'Retro/throw.wav', 'crunch': S400 + 'Combat and Gore/crunch.wav',
  'punch': S400 + 'Combat and Gore/punch_2.wav', 'splat': S400 + 'Combat and Gore/splat_quick.wav',
  'swipe': S400 + 'Combat and Gore/swipe.wav',
  'buzz': S400 + 'Machines/razor_buzz.wav', 'hydUp': S400 + 'Machines/hydraulic_up.wav',
  'hydDn': S400 + 'Machines/hydraulic_down.wav', 'drill': S400 + 'Machines/drill_whizz.wav',
  'step1': S400 + 'Footsteps/foley_footstep_concrete_1.wav', 'step2': S400 + 'Footsteps/foley_footstep_concrete_2.wav',
  'step3': S400 + 'Footsteps/foley_footstep_concrete_3.wav', 'step4': S400 + 'Footsteps/foley_footstep_concrete_4.wav',
  'wind': S400 + 'Environment/ambient_wind.wav', 'airburst': S400 + 'Environment/air_burst.wav',
  'clang': S400 + 'Materials/metal_clang.wav', 'tap': S400 + 'Materials/metal_blunt_tap.wav',
  'whoosh': S400 + 'Other/whoosh_1.wav', 'static': S400 + 'Other/white_noise_short.wav',
  'rumble': SX + 'stone_rumble.wav', 'heavy': SX + 'impact_heavy_dull.wav',
  'bricks': SX + 'bricks_drop.wav', 'plane': SX + 'aeroplane_drone.wav', 'crows': SX + 'crows_multiple.wav',
  'shuffle': SX + 'grass_shuffle.wav', 'dirt': SX + 'land_in_dirt.wav', 'clatter': SX + 'clattering_around.wav',
  'wet': SX + 'impact_wet.wav', 'doorbreak': SX + 'wooden_door_break.wav',
  'win': S400 + 'Musical Effects/brass_level_complete.wav', 'lose': S400 + 'Musical Effects/brass_defeated.wav',
  'start': S400 + 'Musical Effects/brass_level_start.wav', 'sting': S400 + 'Musical Effects/horror_sting.wav',
  'mystery': S400 + 'Musical Effects/8_bit_mystery.wav', 'chime': S400 + 'Musical Effects/brass_chime_positive.wav',
}
maxd = {'wind': 12, 'plane': 7, 'rumble': 4, 'crows': 4, 'buzz': 1.2, 'drill': 1.5, 'static': 0.6}
for k, p in sfx.items():
    enc(p, k, maxd.get(k), '48k', trim=(k != 'wind'))

# voice barks: same line index = same words for every actor
actors = {'meghan': 'Female/Meghan Christian', 'ian': 'Male/Ian Lampert', 'sean': 'Male/Sean Lenhart',
          'karen': 'Female/Karen Cenon', 'alex': 'Male/Alex Brodie'}
lines = {
  'sel': ('2 - Confirmation', 'confirmation', [1, 2, 3]),       # yeah / okay / yes
  'go': ('2 - Confirmation', 'confirmation', [4, 5, 7, 10]),    # you got it / on my way / let's go / on it
  'no': ('5 - Refusal', 'refusal', [5, 6]),                      # can't do that / negative
  'spot': ('6 - Miscellaneous', 'miscellaneous', [7]),           # enemy spotted
  'attacked': ('6 - Miscellaneous', 'miscellaneous', [6]),       # we're under attack
  'low': ('6 - Miscellaneous', 'miscellaneous', [5]),            # low on health
  'ready': ('6 - Miscellaneous', 'miscellaneous', [8]),          # get ready
  'count': ('6 - Miscellaneous', 'miscellaneous', [9]),          # three two one go
  'dmg': ('7 - Damage', 'damage', [1, 2, 3, 4, 5]),
  'death': ('8 - Death', 'death', [1, 2]),
  'grunt': ('9 - Grunting', 'grunting', [1, 2, 3]),
  'obj': ('1 - Completion', 'completion', [8]),                  # objective complete
  'luck': ('4 - Farewell', 'farewell', [9]),                     # good luck
}
VOICE = {}
for a, sub in actors.items():
    for ln, (folder, stem, idxs) in lines.items():
        for i in idxs:
            key = f'v_{a}_{ln}_{i}'
            enc(f'{VOX}{folder}/{sub}/{stem}_{i}_{a}.wav', key, 3.5, '40k')
            VOICE.setdefault(a, {}).setdefault(ln, []).append(key)
json.dump(VOICE, open(f'{A}/voice.json', 'w'), indent=1)

# MIDI -> compact note lists [time, dur, note, vel, instrumentClass] for the in-game chiptune synth
def inst_class(ch, prog):
    if ch == 9: return 0
    if 32 <= prog <= 39: return 1
    if prog == 47: return 5
    if 40 <= prog <= 55 or 88 <= prog <= 95: return 2
    if 56 <= prog <= 87: return 3
    return 4
tracks = {'brief': '20. Military Base MIDI.mid', 'explore': '25. Dark Factory MIDI.mid',
          'battle': '01. Battle Theme MIDI.mid', 'boss': '27. The Evil One MIDI.mid',
          'title': '21. Malicious Scheme MIDI.mid'}
for key, fn in tracks.items():
    m = mido.MidiFile(MID + fn)
    t = 0.0; prog = {}; on = {}; notes = []
    for msg in m:
        t += msg.time
        if msg.type == 'program_change': prog[msg.channel] = msg.program
        elif msg.type == 'note_on' and msg.velocity > 0: on[(msg.channel, msg.note)] = (t, msg.velocity)
        elif msg.type in ('note_off', 'note_on'):
            k = (msg.channel, msg.note)
            if k in on:
                st, vel = on.pop(k)
                notes.append([round(st, 3), round(max(0.03, t - st), 3), msg.note, vel, inst_class(msg.channel, prog.get(msg.channel, 0))])
    notes.sort()
    json.dump({'len': round(m.length, 3), 'n': [x for n in notes for x in n]}, open(f'{A}/music/{key}.json', 'w'), separators=(',', ':'))
print('assets prepared')
