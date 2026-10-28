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

# Fonts
font_xs = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 10)
font_sm = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 11)
font_sm_bold = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 11)
font_md = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 13)
font_md_bold = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 13)
font_badge = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 14)
font_title = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 18)
font_big_title = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 24)

# Scale logo to ~135x26
logo_w = 135
logo_h = int(logo_raw.height * (logo_w / logo_raw.width))
logo = logo_raw.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# UI components from original screen
sidebar = screen.crop((0, 0, 52, H))
bottom_rail = screen.crop((0, 420, W, H))
greeting = screen.crop((52, 0, 380, 80))
search_btn = screen.crop((925, 0, W, 80))
resume_btn = screen.crop((92, 335, 195, 370))
nav_controls = screen.crop((800, 340, 990, 410))

def draw_text_content(draw, is_dark_bg=False, base_x=96, base_y=267):
    text_color = (255, 255, 255, 240) if is_dark_bg else (31, 41, 55, 255)
    dot_color = (255, 255, 255, 130) if is_dark_bg else (156, 163, 175, 255)
    star_color = (245, 158, 11, 255)
    watched_color = (239, 68, 68, 255)
    desc_color = (255, 255, 255, 200) if is_dark_bg else (75, 85, 99, 255)

    x = base_x
    y = base_y
    draw.text((x, y), "2026", font=font_sm_bold, fill=text_color)
    x += 35
    draw.text((x, y), "•", font=font_sm_bold, fill=dot_color)
    x += 12
    draw.text((x, y), "MOVIE", font=font_sm_bold, fill=text_color)
    x += 46
    draw.text((x, y), "•", font=font_sm_bold, fill=dot_color)
    x += 12
    draw.text((x, y), "★ 7.5", font=font_sm_bold, fill=star_color)
    x += 38
    draw.text((x, y), "•", font=font_sm_bold, fill=dot_color)
    x += 12
    draw.text((x, y), "0% WATCHED", font=font_sm_bold, fill=watched_color)

    desc_lines = [
        "Matt Hagen's meteoric rise from Gotham street kid to Hollywood leading man is",
        "tragically cut short when a local crime boss's actions leave him horribly",
        "disfigured. Abandoned by his team and with nothing left, Matt seeks out a cuttin..."
    ]
    dy = base_y + 19
    for line in desc_lines:
        draw.text((base_x, dy), line, font=font_sm, fill=desc_color)
        dy += 15

# ==============================================================================
# OPTION 1: "Crisp Bottom Feather" (Clean Minimal Fade, Zero Milky Fog)
# ==============================================================================
def render_option_1():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    # Paste raw hero image with NO top/left fog
    hero_canvas = hero_raw.copy()
    
    # Apply tight bottom gradient: only from y=365 to 425 (height 60px)
    mask = Image.new('L', (HERO_W, HERO_H), 255)
    draw_m = ImageDraw.Draw(mask)
    fade_start = 365
    fade_end = 425
    for y in range(fade_start, fade_end):
        ratio = (y - fade_start) / (fade_end - fade_start)
        # Smooth cubic ease-in
        alpha = int(255 * (1.0 - (ratio ** 2.2)))
        draw_m.line([(0, y), (HERO_W, y)], fill=alpha)
    draw_m.rectangle([(0, fade_end), (HERO_W, HERO_H)], fill=0)

    # Subtle contrast scrim behind text on the left (so text is razor-sharp)
    scrim = Image.new('RGBA', (HERO_W, HERO_H), (0, 0, 0, 0))
    draw_s = ImageDraw.Draw(scrim)
    for x in range(0, 480):
        # subtle dark scrim on left, fading to transparent
        ratio = x / 480.0
        alpha = int(90 * (1.0 - ratio))
        draw_s.line([(x, 150), (x, 380)], fill=(0, 0, 0, alpha))
    
    hero_canvas.paste(scrim, (0, 0), scrim)
    base.paste(hero_canvas, (HERO_X, 0), mask)

    # Draw logo, text, buttons
    base.paste(logo, (96, 225), logo)
    draw = ImageDraw.Draw(base)
    draw_text_content(draw, is_dark_bg=True) # Text over subtle dark scrim has white/amber punch
    base.paste(resume_btn, (92, 335), resume_btn)
    base.paste(nav_controls, (800, 340), nav_controls)

    # Frame elements
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))

    return base

# ==============================================================================
# OPTION 2: "Cinematic Floating Card" (Framed Hero Stage with Ambient Shadow)
# ==============================================================================
def render_option_2():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    
    # Inset card coordinates: x in [72, 1008], y in [12, 412], radius 20
    card_x0, card_y0 = 72, 14
    card_x1, card_y1 = 1008, 412
    card_w = card_x1 - card_x0
    card_h = card_y1 - card_y0
    corner_r = 22

    # Create shadow
    shadow_pad = 28
    shadow_img = Image.new('RGBA', (card_w + shadow_pad*2, card_h + shadow_pad*2), (0, 0, 0, 0))
    draw_shadow = ImageDraw.Draw(shadow_img)
    draw_shadow.rounded_rectangle(
        [(shadow_pad, shadow_pad + 6), (card_w + shadow_pad, card_h + shadow_pad + 6)],
        radius=corner_r,
        fill=(0, 0, 0, 65)
    )
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(14))
    base.paste(shadow_img, (card_x0 - shadow_pad, card_y0 - shadow_pad), shadow_img)

    # Card content: hero image cropped to card size
    card_hero = scaled.crop((left + 20, top + 14, left + 20 + card_w, top + 14 + card_h))
    
    # Add cinematic dark scrim on left of card
    scrim = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    draw_scrim = ImageDraw.Draw(scrim)
    for x in range(0, 520):
        ratio = x / 520.0
        alpha = int(190 * (1.0 - (ratio ** 1.3)))
        draw_scrim.line([(x, 0), (x, card_h)], fill=(5, 8, 13, alpha))
    # subtle top scrim for header
    for y in range(0, 90):
        ratio = y / 90.0
        alpha = int(120 * (1.0 - ratio))
        draw_scrim.line([(0, y), (card_w, y)], fill=(5, 8, 13, alpha))
    card_hero.paste(scrim, (0, 0), scrim)

    # Create card mask with rounded corners
    card_mask = Image.new('L', (card_w, card_h), 0)
    draw_cm = ImageDraw.Draw(card_mask)
    draw_cm.rounded_rectangle([(0, 0), (card_w, card_h)], radius=corner_r, fill=255)

    base.paste(card_hero, (card_x0, card_y0), card_mask)

    # Border on card
    card_border = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    draw_cb = ImageDraw.Draw(card_border)
    draw_cb.rounded_rectangle([(0, 0), (card_w - 1, card_h - 1)], radius=corner_r, outline=(255, 255, 255, 45), width=1)
    base.paste(card_border, (card_x0, card_y0), card_border)

    # Inside card: greeting, search button, logo, text, controls
    # Greeting on dark card:
    draw_ui = ImageDraw.Draw(base)
    draw_ui.text((card_x0 + 26, card_y0 + 20), "GOOD MORNING, VIGOROUS", font=font_xs, fill=(239, 68, 68, 255))
    draw_ui.text((card_x0 + 26, card_y0 + 34), "Continue Watching", font=font_big_title, fill=(255, 255, 255, 255))

    # Search button inside card top right
    search_card = search_btn.crop((20, 16, 68, 64))
    base.paste(search_card, (card_x1 - 58, card_y0 + 16), search_card)

    # Logo, text, controls inside card
    base.paste(logo, (card_x0 + 26, 225), logo)
    draw_text_content(draw_ui, is_dark_bg=True, base_x=card_x0 + 26, base_y=267)
    base.paste(resume_btn, (card_x0 + 22, 335), resume_btn)

    # Nav controls inside card
    base.paste(nav_controls, (card_x1 - 200, 340), nav_controls)

    # Frame elements outside
    base.paste(sidebar, (0, 0))
    base.paste(bottom_rail, (0, 420))

    return base

# ==============================================================================
# OPTION 3: "Frosted Glass Island" (Translucent Glassmorphism Dock)
# ==============================================================================
def render_option_3():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    
    # Hero backdrop with smooth bottom fade
    hero_canvas = hero_raw.copy()
    mask = Image.new('L', (HERO_W, HERO_H), 255)
    draw_m = ImageDraw.Draw(mask)
    fade_start = 350
    fade_end = 425
    for y in range(fade_start, fade_end):
        ratio = (y - fade_start) / (fade_end - fade_start)
        alpha = int(255 * (1.0 - (ratio ** 2)))
        draw_m.line([(0, y), (HERO_W, y)], fill=alpha)
    draw_m.rectangle([(0, fade_end), (HERO_W, HERO_H)], fill=0)
    base.paste(hero_canvas, (HERO_X, 0), mask)

    # Frosted glass panel behind hero content: x in [84, 550], y in [210, 385], radius 18
    dock_x0, dock_y0 = 84, 212
    dock_x1, dock_y1 = 548, 385
    dock_w = dock_x1 - dock_x0
    dock_h = dock_y1 - dock_y0
    corner_r = 18

    # Create blurred patch from hero for true backdrop-filter blur
    crop_bg = hero_canvas.crop((dock_x0 - HERO_X, dock_y0, dock_x1 - HERO_X, dock_y1))
    blur_bg = crop_bg.filter(ImageFilter.GaussianBlur(18))
    # Tint with white glass overlay (68% white)
    white_tint = Image.new('RGBA', (dock_w, dock_h), (255, 255, 255, 175))
    blur_bg.paste(white_tint, (0, 0), white_tint)

    # Soft dock shadow
    dock_shadow = Image.new('RGBA', (dock_w + 30, dock_h + 30), (0, 0, 0, 0))
    draw_ds = ImageDraw.Draw(dock_shadow)
    draw_ds.rounded_rectangle([(15, 17), (dock_w + 15, dock_h + 17)], radius=corner_r, fill=(0, 0, 0, 35))
    dock_shadow = dock_shadow.filter(ImageFilter.GaussianBlur(10))
    base.paste(dock_shadow, (dock_x0 - 15, dock_y0 - 15), dock_shadow)

    # Dock mask
    dock_mask = Image.new('L', (dock_w, dock_h), 0)
    draw_dm = ImageDraw.Draw(dock_mask)
    draw_dm.rounded_rectangle([(0, 0), (dock_w, dock_h)], radius=corner_r, fill=255)

    base.paste(blur_bg, (dock_x0, dock_y0), dock_mask)

    # Crisp glass border
    glass_border = Image.new('RGBA', (dock_w, dock_h), (0, 0, 0, 0))
    draw_gb = ImageDraw.Draw(glass_border)
    draw_gb.rounded_rectangle([(0, 0), (dock_w - 1, dock_h - 1)], radius=corner_r, outline=(255, 255, 255, 220), width=1)
    base.paste(glass_border, (dock_x0, dock_y0), glass_border)

    # Content on glass dock
    base.paste(logo, (dock_x0 + 18, dock_y0 + 14), logo)
    draw = ImageDraw.Draw(base)
    draw_text_content(draw, is_dark_bg=False, base_x=dock_x0 + 18, base_y=dock_y0 + 52)
    base.paste(resume_btn, (dock_x0 + 14, dock_y0 + 124), resume_btn)

    # Nav controls
    base.paste(nav_controls, (800, 340), nav_controls)

    # Frame elements
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))

    return base

# ==============================================================================
# OPTION 4: "Atmospheric Cinema Scrim" (Directional Shadow, Deep Contrast)
# ==============================================================================
def render_option_4():
    base = Image.new('RGBA', (W, H), BG_COLOR)
    
    hero_canvas = hero_raw.copy()
    
    # Left directional cinema scrim: 0..520 px (deep dark scrim for text readability)
    scrim = Image.new('RGBA', (HERO_W, HERO_H), (0, 0, 0, 0))
    draw_s = ImageDraw.Draw(scrim)
    for x in range(0, 540):
        ratio = x / 540.0
        # Smooth cosine falloff
        alpha = int(220 * (math.cos(ratio * math.pi / 2) ** 1.2))
        draw_s.line([(x, 0), (x, HERO_H)], fill=(7, 10, 16, alpha))
    hero_canvas.paste(scrim, (0, 0), scrim)

    # Very tight bottom ease-out: only last 40px (y: 385..425)
    mask = Image.new('L', (HERO_W, HERO_H), 255)
    draw_m = ImageDraw.Draw(mask)
    fade_start = 385
    fade_end = 425
    for y in range(fade_start, fade_end):
        ratio = (y - fade_start) / (fade_end - fade_start)
        alpha = int(255 * (1.0 - (ratio ** 2.5)))
        draw_m.line([(0, y), (HERO_W, y)], fill=alpha)
    draw_m.rectangle([(0, fade_end), (HERO_W, HERO_H)], fill=0)

    base.paste(hero_canvas, (HERO_X, 0), mask)

    # Logo, text, buttons
    base.paste(logo, (96, 225), logo)
    draw = ImageDraw.Draw(base)
    draw_text_content(draw, is_dark_bg=True)
    base.paste(resume_btn, (92, 335), resume_btn)
    base.paste(nav_controls, (800, 340), nav_controls)

    # Frame elements
    base.paste(sidebar, (0, 0))
    base.paste(greeting, (52, 0), greeting)
    base.paste(search_btn, (925, 0), search_btn)
    base.paste(bottom_rail, (0, 420))

    return base

# Generate and save all 4 individual images
print('Rendering Option 1...')
im_opt1 = render_option_1()
opt1_path = os.path.join(artifact_dir, 'option_1_crisp_feather.png')
im_opt1.save(opt1_path, quality=95)

print('Rendering Option 2...')
im_opt2 = render_option_2()
opt2_path = os.path.join(artifact_dir, 'option_2_floating_card.png')
im_opt2.save(opt2_path, quality=95)

print('Rendering Option 3...')
im_opt3 = render_option_3()
opt3_path = os.path.join(artifact_dir, 'option_3_frosted_glass.png')
im_opt3.save(opt3_path, quality=95)

print('Rendering Option 4...')
im_opt4 = render_option_4()
opt4_path = os.path.join(artifact_dir, 'option_4_atmospheric_cinematic.png')
im_opt4.save(opt4_path, quality=95)

# ==============================================================================
# 2x2 COMPARISON GRID BOARD
# ==============================================================================
print('Rendering 2x2 Comparison Grid Board...')
GRID_W = 2100
GRID_H = 1360
GRID_BG = (235, 238, 242, 255) # Sleek studio slate grey background
grid = Image.new('RGBA', (GRID_W, GRID_H), GRID_BG)
draw_grid = ImageDraw.Draw(grid)

# Top Banner on Grid
draw_grid.rectangle([(0, 0), (GRID_W, 90)], fill=(17, 24, 39, 255))
font_grid_header = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 28)
font_grid_sub = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 14)
draw_grid.text((40, 20), "MYCINEMA — LIGHT THEME HERO FOG & OVERLAY OPTIONS", font=font_grid_header, fill=(255, 255, 255, 255))
draw_grid.text((40, 56), "Comparing 4 modern alternatives to eliminate milky fog and restore razor-sharp artwork contrast", font=font_grid_sub, fill=(156, 163, 175, 255))

# Position 4 cards:
# Card size: 980 x 550 (scaled from 1024x575)
scaled_w = 980
scaled_h = int(H * (scaled_w / W)) # ~550

options = [
    (im_opt1, "OPTION 1: CRISP BOTTOM FEATHER", "Zero milky haze • Ultra-tight 12% baseline ease • Natural poster contrast & punch", 45, 120),
    (im_opt2, "OPTION 2: CINEMATIC FLOATING CARD", "Framed hero stage • Soft ambient drop shadow • Clean separation from library rail", 1075, 120),
    (im_opt3, "OPTION 3: FROSTED GLASS ISLAND", "visionOS / macOS glass dock • True backdrop blur • Zero washed-out paint on face", 45, 735),
    (im_opt4, "OPTION 4: ATMOSPHERIC CINEMA SCRIM", "Directional theatre shadow on left • 100% white/amber text contrast • Tight baseline", 1075, 735),
]

font_card_title = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 16)
font_card_desc = ImageFont.truetype(r'C:\Windows\Fonts\segoeui.ttf', 12)

for img, title, desc, cx, cy in options:
    # Card container with shadow
    draw_grid.rounded_rectangle([(cx - 2, cy - 2), (cx + scaled_w + 2, cy + scaled_h + 38)], radius=14, fill=(255, 255, 255, 255))
    
    # Label header
    draw_grid.text((cx + 16, cy + 8), title, font=font_card_title, fill=(17, 24, 39, 255))
    draw_grid.text((cx + 360, cy + 11), desc, font=font_card_desc, fill=(107, 114, 128, 255))
    
    # Scaled preview
    scaled_prev = img.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
    grid.paste(scaled_prev, (cx, cy + 34))

grid_path = os.path.join(artifact_dir, 'fog_style_comparison_grid.png')
grid.save(grid_path, quality=95)

print('All 5 renders created successfully in artifact directory!')
