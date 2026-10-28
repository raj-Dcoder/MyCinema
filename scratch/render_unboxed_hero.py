import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

artifact_dir = r'C:\Users\91620\.gemini\antigravity\brain\7007fc8b-9f51-4955-9d83-99984e59caa3'
backdrop_path = 'scratch/holmes_backdrop.jpg'
screen_path = 'C:/Users/91620/.gemini/antigravity/brain/7007fc8b-9f51-4955-9d83-99984e59caa3/.user_uploaded/media_1793151158771_bca9f602.png'

screen = Image.open(screen_path).convert('RGBA')
raw = Image.open(backdrop_path).convert('RGBA')
W, H = 1024, 575
HERO_X = 52
HERO_W = W - HERO_X
HERO_H = 425
BG_COLOR = (241, 243, 246, 255)

scale = max(HERO_W / raw.width, HERO_H / raw.height)
new_w, new_h = int(raw.width * scale), int(raw.height * scale)
scaled = raw.resize((new_w, new_h), Image.Resampling.LANCZOS)
left = (new_w - HERO_W) // 2
top = int((new_h - HERO_H) * 0.28)
hero_raw = scaled.crop((left, top, left + HERO_W, top + HERO_H))

font_xs = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 11)
font_sm = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 12)
font_sm_bold = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 12)
font_title = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 24)

sidebar = screen.crop((0, 0, 52, H))
bottom_rail = screen.crop((0, 420, W, H))
greeting = screen.crop((52, 0, 380, 80))
search_btn = screen.crop((925, 0, W, 80))
resume_btn = screen.crop((92, 335, 195, 370))
nav_controls = screen.crop((800, 340, 990, 410))

def render_unboxed_solution():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    hero = hero_raw.copy()

    # Left scrim covering text zone gracefully: 0 to 58%
    scrim_left = Image.new('RGBA', (HERO_W, HERO_H), (0, 0, 0, 0))
    draw_sl = ImageDraw.Draw(scrim_left)
    scrim_w = int(HERO_W * 0.58)
    for x in range(scrim_w):
        t = x / float(scrim_w)
        # 0.90 at left down to 0 at 58%
        alpha = int(255 * (0.90 * (1.0 - t)**1.9))
        draw_sl.line([(x, 0), (x, HERO_H)], fill=(241, 243, 246, alpha))
    hero.paste(scrim_left, (0, 0), scrim_left)

    # Bottom baseline fade (y from 320 to 425)
    b_mask = Image.new('L', (HERO_W, HERO_H), 255)
    draw_bm = ImageDraw.Draw(b_mask)
    for y in range(320, 425):
        t = (y - 320) / (425.0 - 320.0)
        alpha = int(255 * (1.0 - (t ** 1.8)))
        draw_bm.line([(0, y), (HERO_W, y)], fill=alpha)
    draw_bm.rectangle([(0, 425), (HERO_W, HERO_H)], fill=0)
    base.paste(hero, (HERO_X, 0), b_mask)

    draw = ImageDraw.Draw(base)
    # Title
    draw.text((96, 216), "YOU CAN SEE EVERYTHING", font=font_title, fill=(15, 23, 42, 255))

    # Clean unboxed metadata
    x = 96
    y = 262
    # Year
    draw.text((x, y), "2026", font=font_sm_bold, fill=(15, 23, 42, 255))
    x += 38
    # Dot
    draw.ellipse([(x + 2, y + 6), (x + 5, y + 9)], fill=(100, 116, 139, 200))
    x += 16
    # Media
    draw.text((x, y), "MOVIE", font=font_sm_bold, fill=(30, 41, 59, 255))
    x += 50
    # Dot
    draw.ellipse([(x + 2, y + 6), (x + 5, y + 9)], fill=(100, 116, 139, 200))
    x += 16
    # Rating: rich golden amber
    draw.text((x, y), "★ 9.1", font=font_sm_bold, fill=(180, 83, 9, 255))
    x += 44
    # Dot
    draw.ellipse([(x + 2, y + 6), (x + 5, y + 9)], fill=(100, 116, 139, 200))
    x += 16
    # Watched: bold crimson
    draw.text((x, y), "18% WATCHED", font=font_sm_bold, fill=(220, 38, 38, 255))

    # Description (clean, natural, unboxed)
    desc_lines = [
        "Thirty-four days before she's sent to prison, notorious Silicon Valley founder",
        "Elizabeth Holmes invites a skeptical film crew to document her every move. What",
        "begins as an intimate portrait of an enigmatic felon becomes a mind-bending..."
    ]
    dy = 286
    for line in desc_lines:
        # Subtle light shadow for crisp contrast over any backdrop texture
        for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1), (0, 2)]:
            draw.text((96 + ox, dy + oy), line, font=font_sm, fill=(255, 255, 255, 140))
        draw.text((96, dy), line, font=font_sm, fill=(30, 41, 59, 255))
        dy += 16

    base.paste(resume_btn, (92, 345), resume_btn)
    base.paste(nav_controls, (800, 340), nav_controls)
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))
    return base

img = render_unboxed_solution()
out_path = os.path.join(artifact_dir, 'unboxed_clean_hero_text.png')
img.save(out_path, quality=95)
print('Generated unboxed_clean_hero_text.png successfully!')
