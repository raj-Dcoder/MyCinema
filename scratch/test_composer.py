import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Load source files
screen = Image.open('C:/Users/91620/.gemini/antigravity/brain/7007fc8b-9f51-4955-9d83-99984e59caa3/.user_uploaded/media_1793151158771_bca9f602.png').convert('RGBA')
raw_hero = Image.open('scratch/hero_cropped.png').convert('RGBA') # 972 x 425
logo_raw = Image.open(r'C:\Users\91620\AppData\Roaming\mycinema\poster_cache\title_logos\bcb278caeffff3a67ae8f59baa9fb1b08ec4556c.png').convert('RGBA')

# Target resolution 1024 x 575
W, H = screen.size
BG_COLOR = (241, 243, 246, 255)

# Extract UI components from screen:
# Sidebar: x: 0..52, y: 0..575
sidebar = screen.crop((0, 0, 52, H))

# Bottom rail: x: 0..W, y: 425..H
bottom_rail = screen.crop((0, 420, W, H))

# Header greeting: x: 52..400, y: 0..80
header_greeting = screen.crop((52, 0, 420, 80))

# Search button: x: 920..W, y: 0..80
search_btn = screen.crop((920, 0, W, 80))

# Resume button: x: 92..195, y: 335..370
resume_btn = screen.crop((92, 335, 195, 370))

# Nav controls: x: 800..990, y: 340..410
nav_controls = screen.crop((800, 340, 990, 410))

# Title logo in screen is positioned around x=95, y=220. Scale raw logo to match:
# In screen, logo is ~135 px wide, 26 px high
logo_scale = 135 / logo_raw.width
logo_w = int(logo_raw.width * logo_scale)
logo_h = int(logo_raw.height * logo_scale)
logo_scaled = logo_raw.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# Metadata and description from screen:
# In screen, metadata is at y=268, description at y=288..330
meta_desc = screen.crop((90, 265, 500, 335))

print('Extracted components ready!')
