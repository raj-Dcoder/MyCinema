import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

artifact_dir = r'C:\Users\91620\.gemini\antigravity\brain\7007fc8b-9f51-4955-9d83-99984e59caa3'
backdrop_path = 'scratch/holmes_backdrop.jpg'
logo_path = r'C:\Users\91620\AppData\Roaming\mycinema\poster_cache\title_logos\8aa7078d72ff5017cf548cfa342e0e082dcb7436.png'
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
font_xs = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 10)
font_sm = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 11)
font_sm_bold = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 11)
font_title = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 24)

# Elements from screen
sidebar = screen.crop((0, 0, 52, H))
bottom_rail = screen.crop((0, 420, W, H))
greeting = screen.crop((52, 0, 380, 80))
search_btn = screen.crop((925, 0, W, 80))
resume_btn = screen.crop((92, 335, 195, 370))
nav_controls = screen.crop((800, 340, 990, 410))

# -------------------------------------------------------------
# BEFORE: Current low-contrast text on dark backdrop
# -------------------------------------------------------------
def render_before():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    hero = hero_raw.copy()

    # Left scrim (40% width)
    scrim_left = Image.new('RGBA', (HERO_W, HERO_H), (0, 0, 0, 0))
    draw_sl = ImageDraw.Draw(scrim_left)
    for x in range(int(HERO_W * 0.40)):
        t = x / float(HERO_W * 0.40)
        alpha = int(255 * (0.72 * (1.0 - t)**2.2))
        draw_sl.line([(x, 0), (x, HERO_H)], fill=(241, 243, 246, alpha))
    hero.paste(scrim_left, (0, 0), scrim_left)

    # Bottom fade
    b_mask = Image.new('L', (HERO_W, HERO_H), 255)
    draw_bm = ImageDraw.Draw(b_mask)
    for y in range(310, 425):
        t = (y - 310) / (425.0 - 310.0)
        alpha = int(255 * (1.0 - (t ** 1.8)))
        draw_bm.line([(0, y), (HERO_W, y)], fill=alpha)
    draw_bm.rectangle([(0, 425), (HERO_W, HERO_H)], fill=0)
    base.paste(hero, (HERO_X, 0), b_mask)

    # Title text
    draw = ImageDraw.Draw(base)
    draw.text((96, 220), "YOU CAN SEE EVERYTHING", font=font_title, fill=(17, 24, 39, 255))

    # Meta text (barely visible dark text & pastels)
    x = 96
    y = 267
    draw.text((x, y), "2026", font=font_sm_bold, fill=(31, 41, 55, 255))
    x += 35
    draw.text((x, y), "•", font=font_sm_bold, fill=(156, 163, 175, 255))
    x += 12
    draw.text((x, y), "MOVIE", font=font_sm_bold, fill=(55, 65, 81, 255))
    x += 46
    draw.text((x, y), "•", font=font_sm_bold, fill=(156, 163, 175, 255))
    x += 12
    draw.text((x, y), "★ 9.1", font=font_sm_bold, fill=(251, 191, 36, 255)) # amber-400
    x += 38
    draw.text((x, y), "•", font=font_sm_bold, fill=(156, 163, 175, 255))
    x += 12
    draw.text((x, y), "18% WATCHED", font=font_sm_bold, fill=(248, 113, 113, 255)) # red-400

    # Description (dark text on dark background without card)
    desc_lines = [
        "Thirty-four days before she's sent to prison, notorious Silicon Valley founder",
        "Elizabeth Holmes invites a skeptical film crew to document her every move. What",
        "begins as an intimate portrait of an enigmatic felon becomes a mind-bending..."
    ]
    dy = 288
    for line in desc_lines:
        draw.text((96, dy), line, font=font_sm, fill=(31, 41, 55, 255))
        dy += 16

    base.paste(resume_btn, (92, 345), resume_btn)
    base.paste(nav_controls, (800, 340), nav_controls)
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))
    return base

# -------------------------------------------------------------
# AFTER: Pill Badges + Frosted Glass Description Card
# -------------------------------------------------------------
def render_after():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    hero = hero_raw.copy()

    # Left scrim (slightly wider: 44% width, smooth)
    scrim_left = Image.new('RGBA', (HERO_W, HERO_H), (0, 0, 0, 0))
    draw_sl = ImageDraw.Draw(scrim_left)
    for x in range(int(HERO_W * 0.44)):
        t = x / float(HERO_W * 0.44)
        alpha = int(255 * (0.70 * (1.0 - t)**2.0))
        draw_sl.line([(x, 0), (x, HERO_H)], fill=(241, 243, 246, alpha))
    hero.paste(scrim_left, (0, 0), scrim_left)

    # Bottom fade
    b_mask = Image.new('L', (HERO_W, HERO_H), 255)
    draw_bm = ImageDraw.Draw(b_mask)
    for y in range(310, 425):
        t = (y - 310) / (425.0 - 310.0)
        alpha = int(255 * (1.0 - (t ** 1.8)))
        draw_bm.line([(0, y), (HERO_W, y)], fill=alpha)
    draw_bm.rectangle([(0, 425), (HERO_W, HERO_H)], fill=0)
    base.paste(hero, (HERO_X, 0), b_mask)

    # Title text
    draw = ImageDraw.Draw(base)
    draw.text((96, 212), "YOU CAN SEE EVERYTHING", font=font_title, fill=(15, 23, 42, 255))

    # PILL BADGES FOR METADATA
    y_pill = 250
    h_pill = 22

    # 1. Year Pill [ 2026 ]
    x_cur = 96
    w_pill = 42
    draw.rounded_rectangle([(x_cur, y_pill), (x_cur + w_pill, y_pill + h_pill)], radius=11, fill=(255, 255, 255, 220), outline=(203, 213, 225, 200), width=1)
    draw.text((x_cur + 8, y_pill + 4), "2026", font=font_xs, fill=(15, 23, 42, 255))

    # 2. Media Type [ MOVIE ]
    x_cur += w_pill + 6
    w_pill = 50
    draw.rounded_rectangle([(x_cur, y_pill), (x_cur + w_pill, y_pill + h_pill)], radius=11, fill=(255, 255, 255, 220), outline=(203, 213, 225, 200), width=1)
    draw.text((x_cur + 8, y_pill + 4), "MOVIE", font=font_xs, fill=(30, 41, 59, 255))

    # 3. Rating [ ★ 9.1 ]
    x_cur += w_pill + 6
    w_pill = 48
    draw.rounded_rectangle([(x_cur, y_pill), (x_cur + w_pill, y_pill + h_pill)], radius=11, fill=(254, 243, 199, 230), outline=(245, 158, 11, 100), width=1)
    draw.text((x_cur + 8, y_pill + 4), "★ 9.1", font=font_xs, fill=(180, 83, 9, 255)) # amber-700

    # 4. Watched [ 18% WATCHED ]
    x_cur += w_pill + 6
    w_pill = 94
    draw.rounded_rectangle([(x_cur, y_pill), (x_cur + w_pill, y_pill + h_pill)], radius=11, fill=(254, 226, 226, 230), outline=(239, 68, 68, 100), width=1)
    draw.text((x_cur + 8, y_pill + 4), "18% WATCHED", font=font_xs, fill=(220, 38, 38, 255)) # red-600

    # FROSTED GLASS CARD FOR DESCRIPTION
    desc_x0, desc_y0 = 96, 280
    desc_w, desc_h = 515, 52
    
    # Backdrop blur patch for description
    crop_desc = base.crop((desc_x0, desc_y0, desc_x0 + desc_w, desc_y0 + desc_h))
    blur_desc = crop_desc.filter(ImageFilter.GaussianBlur(12))
    # Soft translucent white tint
    tint = Image.new('RGBA', (desc_w, desc_h), (255, 255, 255, 185))
    blur_desc.paste(tint, (0, 0), tint)
    
    # Mask rounded rectangle
    d_mask = Image.new('L', (desc_w, desc_h), 0)
    draw_dm = ImageDraw.Draw(d_mask)
    draw_dm.rounded_rectangle([(0, 0), (desc_w, desc_h)], radius=12, fill=255)
    base.paste(blur_desc, (desc_x0, desc_y0), d_mask)

    # Subtle border & shadow
    draw.rounded_rectangle([(desc_x0, desc_y0), (desc_x0 + desc_w, desc_y0 + desc_h)], radius=12, outline=(255, 255, 255, 240), width=1)

    # Description text inside frosted card
    desc_lines = [
        "Thirty-four days before she's sent to prison, notorious Silicon Valley founder",
        "Elizabeth Holmes invites a skeptical film crew to document her every move. What",
        "begins as an intimate portrait of an enigmatic felon becomes a mind-bending..."
    ]
    dy = desc_y0 + 7
    for line in desc_lines:
        draw.text((desc_x0 + 10, dy), line, font=font_xs, fill=(15, 23, 42, 255))
        dy += 14

    base.paste(resume_btn, (92, 345), resume_btn)
    base.paste(nav_controls, (800, 340), nav_controls)
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))
    return base

im_before = render_before()
im_after = render_after()

# Comparison board
comp = Image.new('RGBA', (1024 * 2 + 30, 575 + 80), (235, 238, 242, 255))
draw_c = ImageDraw.Draw(comp)
draw_c.rectangle([(0, 0), (1024 * 2 + 30, 60)], fill=(15, 23, 42, 255))
font_h = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 20)
font_s = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 12)
draw_c.text((20, 10), "LIGHT THEME HERO TEXT VISIBILITY & DESCRIPTION ENHANCEMENT", font=font_h, fill=(255, 255, 255, 255))
draw_c.text((20, 36), "Before (barely visible dark text on dark backdrop) vs After (vivid pill badges + frosted glass description card)", font=font_s, fill=(148, 163, 184, 255))

draw_c.text((20, 66), "BEFORE (Low contrast text & pastels on photo backdrop)", font=font_s, fill=(220, 38, 38, 255))
draw_c.text((1054, 66), "AFTER (Crisp frosted pill badges & frosted glass description card)", font=font_s, fill=(22, 163, 74, 255))

comp.paste(im_before, (10, 85))
comp.paste(im_after, (1044, 85))

comp_path = os.path.join(artifact_dir, 'meta_desc_visibility_comparison.png')
comp.save(comp_path, quality=95)

im_after_path = os.path.join(artifact_dir, 'enhanced_meta_desc_preview.png')
im_after.save(im_after_path, quality=95)

print('Generated visual comparisons!')
