import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

artifact_dir = r'C:\Users\91620\.gemini\antigravity\brain\7007fc8b-9f51-4955-9d83-99984e59caa3'
screen_path = 'C:/Users/91620/.gemini/antigravity/brain/7007fc8b-9f51-4955-9d83-99984e59caa3/.user_uploaded/media_1793151158771_bca9f602.png'
raw_backdrop_path = 'scratch/clayface_raw_backdrop.jpg'
logo_path = r'C:\Users\91620\AppData\Roaming\mycinema\poster_cache\title_logos\bcb278caeffff3a67ae8f59baa9fb1b08ec4556c.png'

screen = Image.open(screen_path).convert('RGBA')
raw = Image.open(raw_backdrop_path).convert('RGBA')
logo_raw = Image.open(logo_path).convert('RGBA')

W, H = screen.size # 1024, 575
HERO_X = 52
HERO_W = W - HERO_X # 972
HERO_H = 425
BG_COLOR = (241, 243, 246, 255)

# Scale raw hero image
scale = max(HERO_W / raw.width, HERO_H / raw.height)
new_w, new_h = int(raw.width * scale), int(raw.height * scale)
scaled = raw.resize((new_w, new_h), Image.Resampling.LANCZOS)
left = (new_w - HERO_W) // 2
top = int((new_h - HERO_H) * 0.28)
hero_raw = scaled.crop((left, top, left + HERO_W, top + HERO_H))

# Scale logo
logo_w = 135
logo_h = int(logo_raw.height * (logo_w / logo_raw.width))
logo = logo_raw.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# UI Elements from screen
sidebar = screen.crop((0, 0, 52, H))
bottom_rail = screen.crop((0, 420, W, H))
greeting = screen.crop((52, 0, 380, 80))
search_btn = screen.crop((925, 0, W, 80))
resume_btn = screen.crop((92, 335, 195, 370))
nav_controls = screen.crop((800, 340, 990, 410))

# Fonts
font_sm = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 11)
font_sm_bold = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 11)

def render_user_custom():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    hero = hero_raw.copy()

    # 1. NO TOP SHADE (clean, clear artwork at the top!)

    # 2. SLIGHT LEFT SCRIM (for text readability, fading out by 38% width)
    # rgba(241, 243, 246, 0.72) 0% -> 0.48 at 14% -> 0.18 at 26% -> 0.03 at 34% -> transparent 40%
    scrim_left = Image.new('RGBA', (HERO_W, HERO_H), (0, 0, 0, 0))
    draw_sl = ImageDraw.Draw(scrim_left)
    left_width = int(HERO_W * 0.40) # ~388px
    for x in range(left_width):
        t = x / float(left_width)
        # Smooth cubic ease
        alpha = int(255 * (0.72 * (1.0 - t)**2.2))
        draw_sl.line([(x, 0), (x, HERO_H)], fill=(241, 243, 246, alpha))
    hero.paste(scrim_left, (0, 0), scrim_left)

    # 3. KEEP BOTTOM (smooth natural baseline fade into #f1f3f6, 30% height)
    # y from 300 to 425
    bottom_mask = Image.new('L', (HERO_W, HERO_H), 255)
    draw_bm = ImageDraw.Draw(bottom_mask)
    fade_start = 310
    fade_end = 425
    for y in range(fade_start, fade_end):
        t = (y - fade_start) / float(fade_end - fade_start)
        # smooth ease out
        alpha = int(255 * (1.0 - (t ** 1.8)))
        draw_bm.line([(0, y), (HERO_W, y)], fill=alpha)
    draw_bm.rectangle([(0, fade_end), (HERO_W, HERO_H)], fill=0)

    base.paste(hero, (HERO_X, 0), bottom_mask)

    # Add UI elements
    base.paste(logo, (96, 225), logo)

    # Text content (dark crisp text with subtle light halo)
    draw = ImageDraw.Draw(base)
    x = 96
    y = 267
    draw.text((x, y), "2026", font=font_sm_bold, fill=(31, 41, 55, 255))
    x += 35
    draw.text((x, y), "•", font=font_sm_bold, fill=(156, 163, 175, 255))
    x += 12
    draw.text((x, y), "MOVIE", font=font_sm_bold, fill=(31, 41, 55, 255))
    x += 46
    draw.text((x, y), "•", font=font_sm_bold, fill=(156, 163, 175, 255))
    x += 12
    draw.text((x, y), "★ 7.5", font=font_sm_bold, fill=(217, 119, 6, 255))
    x += 38
    draw.text((x, y), "•", font=font_sm_bold, fill=(156, 163, 175, 255))
    x += 12
    draw.text((x, y), "0% WATCHED", font=font_sm_bold, fill=(220, 38, 38, 255))

    desc_lines = [
        "Matt Hagen's meteoric rise from Gotham street kid to Hollywood leading man is",
        "tragically cut short when a local crime boss's actions leave him horribly",
        "disfigured. Abandoned by his team and with nothing left, Matt seeks out a cuttin..."
    ]
    dy = 286
    for line in desc_lines:
        draw.text((96, dy), line, font=font_sm, fill=(55, 65, 81, 255))
        dy += 15

    base.paste(resume_btn, (92, 335), resume_btn)
    base.paste(nav_controls, (800, 340), nav_controls)

    # Frame
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))

    return base

out = render_user_custom()
out_path = os.path.join(artifact_dir, 'selected_custom_fog_style.png')
out.save(out_path, quality=95)
print('Generated selected_custom_fog_style.png!')
