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

# Scale backdrop
scale = max(HERO_W / raw.width, HERO_H / raw.height)
new_w, new_h = int(raw.width * scale), int(raw.height * scale)
scaled = raw.resize((new_w, new_h), Image.Resampling.LANCZOS)
left = (new_w - HERO_W) // 2
top = int((new_h - HERO_H) * 0.28)
hero_raw = scaled.crop((left, top, left + HERO_W, top + HERO_H))

# Load fonts
font_xs = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 11)
font_sm = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 12)
font_sm_bold = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 12)
font_title = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 24)

# Elements from screen
sidebar = screen.crop((0, 0, 52, H))
bottom_rail = screen.crop((0, 420, W, H))
greeting = screen.crop((52, 0, 380, 80))
search_btn = screen.crop((925, 0, W, 80))
resume_btn = screen.crop((92, 335, 195, 370))
nav_controls = screen.crop((800, 340, 990, 410))

def render_natural_clean():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    hero = hero_raw.copy()

    # Smooth, natural left scrim covering the text area (0 to 55% width)
    # No boxes, no cards, just soft atmospheric studio scrim
    scrim_left = Image.new('RGBA', (HERO_W, HERO_H), (0, 0, 0, 0))
    draw_sl = ImageDraw.Draw(scrim_left)
    scrim_w = int(HERO_W * 0.54) # ~525px
    for x in range(scrim_w):
        t = x / float(scrim_w)
        # Smooth cubic ease: 0.90 at left, smoothly decaying to 0
        alpha = int(255 * (0.90 * (1.0 - t)**2.0))
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

    # Title text
    draw = ImageDraw.Draw(base)
    draw.text((96, 218), "YOU CAN SEE EVERYTHING", font=font_title, fill=(15, 23, 42, 255))

    # Clean INLINE metadata text (NO PILLS, NO BOXES)
    # Colors: rich navy/charcoal for year & movie, vibrant golden amber for rating, punchy crimson for watched
    x = 96
    y = 264
    # Year
    draw.text((x, y), "2026", font=font_sm_bold, fill=(15, 23, 42, 255))
    x += 36
    # Dot
    draw.text((x, y), "•", font=font_sm_bold, fill=(100, 116, 139, 255)) # slate-500
    x += 14
    # Media label
    draw.text((x, y), "MOVIE", font=font_sm_bold, fill=(30, 41, 59, 255))
    x += 48
    # Dot
    draw.text((x, y), "•", font=font_sm_bold, fill=(100, 116, 139, 255))
    x += 14
    # Rating - rich golden amber (amber-700)
    draw.text((x, y), "★ 9.1", font=font_sm_bold, fill=(180, 83, 9, 255))
    x += 42
    # Dot
    draw.text((x, y), "•", font=font_sm_bold, fill=(100, 116, 139, 255))
    x += 14
    # Watched - bold crimson (red-600)
    draw.text((x, y), "18% WATCHED", font=font_sm_bold, fill=(220, 38, 38, 255))

    # Description (clean text, NO BOX, NO PILL)
    # Rendered in crisp slate-800 with relaxed line spacing and light halo for 100% legibility
    desc_lines = [
        "Thirty-four days before she's sent to prison, notorious Silicon Valley founder",
        "Elizabeth Holmes invites a skeptical film crew to document her every move. What",
        "begins as an intimate portrait of an enigmatic felon becomes a mind-bending..."
    ]
    dy = 288
    for line in desc_lines:
        # Subtle light halo under text
        for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            draw.text((96 + ox, dy + oy), line, font=font_sm, fill=(255, 255, 255, 120))
        draw.text((96, dy), line, font=font_sm, fill=(30, 41, 59, 255))
        dy += 16

    base.paste(resume_btn, (92, 345), resume_btn)
    base.paste(nav_controls, (800, 340), nav_controls)
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))
    return base

img = render_natural_clean()
out_path = os.path.join(artifact_dir, 'clean_unboxed_natural_style.png')
img.save(out_path, quality=95)
print('Generated clean_unboxed_natural_style.png!')
