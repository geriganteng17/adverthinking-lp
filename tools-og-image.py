# -*- coding: utf-8 -*-
"""
tools-og-image.py — generator og-image Adverthinking AI (100% lokal, nol biaya API).

Bikin 2 varian OG image 1200x630 + favicon.ico multi-size.
  A = produk-forward  : screenshot dashboard app dominan + headline pendek di kiri
  B = tipografi-forward: logo + headline besar di tengah, nol foto

Jalanin dari folder repo LP:
    python tools-og-image.py

Dependency: Pillow (sudah ada). Font: Montserrat dari C:\\Windows\\Fonts.

Aturan copy yang dikunci Bolo (jangan diubah tanpa alasan):
  - headline TANPA titik di akhir
  - BUKAN ALL CAPS (sentence case)
  - nol em dash, nol klaim income, nol scarcity palsu
"""
import sys, os
sys.stdout.reconfigure(encoding="utf-8")

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 630
JPEG_QUALITY = 85

# --- Palet brand (dicontek dari :root index.html) ---
BG        = (10, 10, 10)        # --bg-dark #0A0A0A
PRIMARY   = (255, 107, 53)      # --primary #FF6B35
SECONDARY = (245, 166, 35)      # --secondary #F5A623
TEXT      = (248, 250, 252)     # --text-light
MUTED     = (163, 163, 163)
ACCENT    = (255, 140, 90)      # #FF8C5A (aksen teks LP)

FONT_DIR = r"C:\Windows\Fonts"
FONT_CHAIN = {
    "black":    ["Montserrat-Black.ttf", "Montserrat-ExtraBold.ttf", "arialbd.ttf", "segoeuib.ttf"],
    "xbold":    ["Montserrat-ExtraBold.ttf", "Montserrat-Bold.ttf", "arialbd.ttf", "segoeuib.ttf"],
    "bold":     ["Montserrat-Bold.ttf", "arialbd.ttf", "segoeuib.ttf"],
    "semibold": ["Montserrat-SemiBold.ttf", "Montserrat-Bold.ttf", "arialbd.ttf", "segoeuib.ttf"],
    "medium":   ["Montserrat-Medium.ttf", "Montserrat-Regular.ttf", "arial.ttf", "segoeui.ttf"],
}
_font_cache = {}


def font(weight, size):
    """Ambil font. Kalau ketemu font VARIABLE, kunci ke instance yang bener
    (default variable font = Regular, hasilnya keliatan lemah/jelek)."""
    key = (weight, size)
    if key in _font_cache:
        return _font_cache[key]
    want = {"black": "ExtraBold", "xbold": "ExtraBold", "bold": "Bold",
            "semibold": "SemiBold", "medium": "Medium"}[weight]
    for name in FONT_CHAIN[weight]:
        path = os.path.join(FONT_DIR, name)
        if not os.path.exists(path):
            continue
        f = ImageFont.truetype(path, size)
        try:
            names = [n.decode() if isinstance(n, bytes) else n for n in f.get_variation_names()]
            if names:  # ini variable font -> WAJIB dikunci, jangan biarin default Regular
                pick = next((n for n in names if n.replace(" ", "").lower() == want.lower()), names[-1])
                f.set_variation_by_name(pick)
                print(f"   [var] {name} dikunci ke '{pick}'")
        except Exception:
            pass  # font statis -> normal, gak punya variation
        _font_cache[key] = f
        return f
    raise RuntimeError(f"Nol font ketemu buat weight '{weight}'")


# ---------------------------------------------------------------- helpers
def linear_gradient(size, c1, c2, horizontal=True):
    w, h = size
    base = Image.new("RGB", (w, h), c1)
    top = Image.new("RGB", (w, h), c2)
    n = w if horizontal else h
    mask = Image.new("L", (w, h))
    md = ImageDraw.Draw(mask)
    for i in range(n):
        v = int(255 * i / max(n - 1, 1))
        if horizontal:
            md.line([(i, 0), (i, h)], fill=v)
        else:
            md.line([(0, i), (w, i)], fill=v)
    return Image.composite(top, base, mask)


def glow(img, cx, cy, rx, ry, color, strength=0.55, blur=110):
    """Tempel cahaya radial lembut (additive) ke img RGB."""
    layer = Image.new("L", img.size, 0)
    ImageDraw.Draw(layer).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=int(255 * strength))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    tint = Image.new("RGB", img.size, color)
    tinted = Image.new("RGB", img.size, (0, 0, 0))
    tinted.paste(tint, (0, 0), layer)
    return ImageChops.add(img, tinted)


def rounded_mask(size, radius):
    # radius WAJIB diclamp: Pillow bikin bentuk elips kalau radius > setengah sisi terpendek
    radius = min(radius, min(size) // 2)
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def vignette(img, strength=0.55):
    """Gelapin pinggir biar tengahnya nonjol + latar balik ke nuansa gelap brand."""
    w, h = img.size
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).ellipse([-w * 0.28, -h * 0.42, w * 1.28, h * 1.42], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(140)).point(lambda v: int(255 - (255 - v) * strength))
    return Image.composite(img, Image.new("RGB", (w, h), (4, 4, 4)), m)


def text_size(draw, s, f):
    b = draw.textbbox((0, 0), s, font=f)
    return b[2] - b[0], b[3] - b[1]


def draw_gradient_text(img, xy, text, f, c1, c2, anchor="la"):
    """Teks berisi gradient oranye (bukan flat) — biar senada sama .text-gradient di LP."""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=f, fill=255, anchor=anchor)
    bbox = mask.getbbox()
    if not bbox:
        return
    grad = linear_gradient(img.size, c1, c2, horizontal=True)
    img.paste(grad, (0, 0), mask)


def pill(img, x, y, text, f, pad_x=28, pad_y=15,
         fill=None, gradient=None, fg=(255, 255, 255), border=None):
    """Kapsul (sudut bener-bener setengah lingkaran, bukan elips)."""
    d = ImageDraw.Draw(img)
    b = d.textbbox((0, 0), text, font=f)
    tw, th = b[2] - b[0], b[3] - b[1]
    bw, bh = tw + pad_x * 2, th + pad_y * 2
    r = bh // 2
    box = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    if gradient:
        g = linear_gradient((bw, bh), gradient[0], gradient[1]).convert("RGBA")
        box.paste(g, (0, 0), rounded_mask((bw, bh), r))
    elif fill:
        ImageDraw.Draw(box).rounded_rectangle([0, 0, bw - 1, bh - 1], radius=r, fill=fill,
                                              outline=border, width=2 if border else 0)
    img.paste(box, (x, y), box)
    d.text((x + pad_x - b[0], y + pad_y - b[1]), text, font=f, fill=fg)
    return bw, bh


def logo_parts():
    """Pecah logo-adverthinking.png (bulb + wordmark di bawahnya) jadi 2 potong RGBA.
    Logo aslinya RGB di atas latar hitam, jadi luminance dipakai sebagai alpha."""
    src = Image.open(os.path.join(ROOT, "images", "logo-adverthinking.png")).convert("RGB")
    lum = src.convert("L")
    alpha = lum.point(lambda v: 0 if v < 14 else min(255, int((v - 14) * 1.35)))
    rgba = src.convert("RGBA")
    rgba.putalpha(alpha)

    # profil baris -> cari celah kosong antara bulb dan wordmark
    w, h = lum.size
    rows = [max(alpha.crop((0, y, w, y + 1)).getdata()) for y in range(h)]
    filled = [y for y, v in enumerate(rows) if v > 20]
    top, bot = filled[0], filled[-1]
    gaps, run = [], None
    for y in range(top, bot + 1):
        if rows[y] <= 20:
            run = y if run is None else run
        else:
            if run is not None and y - run > 12:
                gaps.append((run, y))
            run = None
    split = gaps[-1][0] if gaps else bot  # celah terakhir = pemisah bulb / wordmark
    bulb = rgba.crop((0, top, w, split))
    mark = rgba.crop((0, split, w, bot + 1))
    return bulb.crop(bulb.getbbox()), mark.crop(mark.getbbox())


def fit(im, box_w, box_h):
    r = min(box_w / im.width, box_h / im.height)
    return im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)


def save_jpg(img, name):
    p = os.path.join(ROOT, name)
    img.convert("RGB").save(p, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return p


# ---------------------------------------------------------------- VARIAN A
def build_a():
    """Produk-forward: screenshot dashboard app dominan di kanan, headline pendek di kiri."""
    img = Image.new("RGB", (W, H), BG)
    # cahaya tipis aja — latar HARUS tetap gelap (identitas LP), bukan coklat
    img = glow(img, 210, 90, 300, 220, (74, 26, 6), 0.5, 120)
    img = glow(img, 900, 330, 340, 260, (66, 32, 4), 0.45, 130)
    img = vignette(img, 0.5)

    # --- kartu screenshot (16:9 utuh, nol crop; miring dikit + bleed keluar kanan) ---
    shot = Image.open(os.path.join(ROOT, "images", "app-dashboard.jpg")).convert("RGB")
    cw, ch = 736, 414                      # 1.777 = 16:9, sama persis sama sumbernya
    shot = shot.resize((cw, ch), Image.LANCZOS)

    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    card.paste(shot, (0, 0), rounded_mask((cw, ch), 18))
    ImageDraw.Draw(card).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=18,
                                           outline=(255, 107, 53, 165), width=3)
    card = card.rotate(-5, expand=True, resample=Image.BICUBIC)

    cx, cy = 596, 112
    shadow = Image.new("L", img.size, 0)
    shadow.paste(card.split()[3], (cx - 6, cy + 30))
    shadow = shadow.filter(ImageFilter.GaussianBlur(38))
    img.paste(Image.new("RGB", img.size, (0, 0, 0)), (0, 0), shadow.point(lambda v: int(v * 0.9)))
    img = glow(img, cx + card.width // 2, cy + card.height // 2,
               card.width // 2 - 40, card.height // 2 - 30, (96, 34, 6), 0.42, 80)
    img.paste(card, (cx, cy), card)

    d = ImageDraw.Draw(img)
    X = 62

    # --- lockup logo ---
    bulb, mark = logo_parts()
    b = fit(bulb, 50, 50)
    img.paste(b, (X, 60), b)
    d.text((X + b.width + 13, 60 + b.height // 2), "Adverthinking AI",
           font=font("bold", 24), fill=TEXT, anchor="lm")

    # --- headline (sentence case, nol titik di akhir) ---
    f_h = font("black", 50)
    y = 154
    for line, grad in [("20 tools AI", False), ("marketing dalam", False), ("1 studio", True)]:
        if grad:
            draw_gradient_text(img, (X, y), line, f_h, PRIMARY, SECONDARY)
        else:
            d.text((X, y), line, font=f_h, fill=TEXT)
        y += 60

    # --- sub ---
    f_s = font("medium", 19)
    y += 18
    for line in ["Copy iklan, foto produk, banner,", "thumbnail, sampai landing page"]:
        d.text((X, y), line, font=f_s, fill=MUTED)
        y += 28

    # --- chip harga ---
    pill(img, X, y + 24, "Rp100.000 sekali bayar, akses selamanya",
         font("bold", 18), pad_x=24, pad_y=13, gradient=(PRIMARY, SECONDARY), fg=(26, 12, 4))

    return save_jpg(img, "og-image-a.jpg")


# ---------------------------------------------------------------- VARIAN B
def build_b():
    """Tipografi-forward: nol foto. Logo + headline besar di tengah."""
    img = Image.new("RGB", (W, H), BG)

    # grid garis tipis (tekstur, bukan tempelan)
    d = ImageDraw.Draw(img)
    for gx in range(0, W, 48):
        d.line([(gx, 0), (gx, H)], fill=(21, 18, 16))
    for gy in range(0, H, 48):
        d.line([(0, gy), (W, gy)], fill=(21, 18, 16))

    img = glow(img, 600, 300, 400, 260, (78, 28, 6), 0.55, 150)
    img = glow(img, 600, 44, 300, 130, (96, 40, 8), 0.4, 110)
    img = vignette(img, 0.72)
    d = ImageDraw.Draw(img)

    # --- logo bulb + wordmark ---
    bulb, _mark = logo_parts()
    b = fit(bulb, 84, 84)
    img.paste(b, (W // 2 - b.width // 2, 56), b)
    d.text((W // 2, 168), "Adverthinking AI", font=font("semibold", 21),
           fill=ACCENT, anchor="mm")

    # --- headline besar (sentence case, nol titik di akhir) ---
    f_h = font("black", 62)
    d.text((W // 2, 256), "Bikin materi iklan sendiri", font=f_h, fill=TEXT, anchor="mm")
    draw_gradient_text(img, (W // 2, 332), "tanpa perlu desainer", f_h, PRIMARY, SECONDARY, anchor="mm")

    # --- garis aksen ---
    bar = linear_gradient((260, 4), PRIMARY, SECONDARY)
    img.paste(bar, (W // 2 - 130, 392), rounded_mask((260, 4), 2))

    # --- sub ---
    d.text((W // 2, 434), "20 tools AI marketing dalam 1 studio",
           font=font("medium", 24), fill=MUTED, anchor="mm")

    # --- chip harga (di tengah) ---
    f_p = font("bold", 20)
    txt = "Sekali bayar Rp100.000, akses selamanya"
    bb = d.textbbox((0, 0), txt, font=f_p)
    bw = (bb[2] - bb[0]) + 28 * 2
    pill(img, W // 2 - bw // 2, 500, txt, f_p, pad_x=28, pad_y=15,
         gradient=(PRIMARY, SECONDARY), fg=(26, 12, 4))

    return save_jpg(img, "og-image-b.jpg")


# ---------------------------------------------------------------- favicon
def build_favicon():
    src = Image.open(os.path.join(ROOT, "favicon.png")).convert("RGBA")
    out = os.path.join(ROOT, "favicon.ico")
    src.save(out, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    return out


if __name__ == "__main__":
    print("Generate og-image Adverthinking (lokal, nol API berbayar)")
    for fn in (build_a, build_b, build_favicon):
        p = fn()
        im = Image.open(p)
        print(f"  OK  {os.path.basename(p):16s}  {os.path.getsize(p):>7,d} B  {im.size}  {im.format}")
