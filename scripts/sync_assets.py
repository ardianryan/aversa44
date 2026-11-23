import os
import re
import io
import base64
import shutil
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = "/Users/ardianryan/Documents/aversa44"
BRAND_ROOT = "/Users/ardianryan/Documents/diesnat44project/assets"
REF_SVG_DIR = os.path.join(PROJECT_ROOT, "referensi desain")
PUBLIC_ASSETS = os.path.join(PROJECT_ROOT, "public", "assets")

def ensure_dir(p):
    os.makedirs(p, exist_ok=True)

def copy_file(src, dst):
    ensure_dir(os.path.dirname(dst))
    shutil.copy2(src, dst)

def sync_official_assets():
    files_to_copy = [
        # Core SVG logos
        ("svg/logo-symbol-color.svg", "svg/logo-symbol-color.svg"),
        ("svg/logo-symbol-tight.svg", "svg/logo-symbol-tight.svg"),
        ("svg/logo-horizontal-color.svg", "svg/logo-horizontal-color.svg"),
        ("svg/logo-monochrome-white.svg", "svg/logo-monochrome-white.svg"),
        ("svg/aversa-standalone-color.svg", "svg/aversa-standalone-color.svg"),
        ("svg/aversa-logotype-horizontal.svg", "svg/aversa-logotype-horizontal.svg"),
        ("svg/aversa-logotype-vertical.svg", "svg/aversa-logotype-vertical.svg"),
        ("svg/aversa-brand-combination.svg", "svg/aversa-brand-combination.svg"),
        ("svg/dies-natalis-44-lockup.svg", "svg/dies-natalis-44-lockup.svg"),
        ("svg/svc-standalone-color.svg", "svg/svc-standalone-color.svg"),
        # Core PNGs
        ("png/logo-symbol-color.png", "png/logo-symbol-color.png"),
        ("png/logo-symbol-tight.png", "png/logo-symbol-tight.png"),
        ("png/logo-color-2048.png", "png/logo-color-2048.png"),
        ("png/aversa-brand-combination.png", "png/aversa-brand-combination.png"),
        ("png/aversa-logotype-horizontal.png", "png/aversa-logotype-horizontal.png"),
        ("png/aversa-standalone-color.png", "png/aversa-standalone-color.png"),
        ("png/svc-mascot-standalone.png", "png/svc-mascot-standalone.png"),
        # Brandkit Elements SVG
        ("brandkit_elements/svg/theater-curtain-drape-premium.svg", "brandkit/theater-curtain-drape-premium.svg"),
        ("brandkit_elements/svg/theater-curtain-drape.svg", "brandkit/theater-curtain-drape.svg"),
        ("brandkit_elements/svg/hypnotic-swirl-disc.svg", "brandkit/hypnotic-swirl-disc.svg"),
        ("brandkit_elements/svg/cotton-candy-clouds.svg", "brandkit/cotton-candy-clouds.svg"),
        ("brandkit_elements/svg/magic-burst-rays.svg", "brandkit/magic-burst-rays.svg"),
        ("brandkit_elements/svg/floating-magic-ribbons.svg", "brandkit/floating-magic-ribbons.svg"),
        ("brandkit_elements/svg/confectionery-swirl-badge.svg", "brandkit/confectionery-swirl-badge.svg"),
        ("brandkit_elements/svg/magic-sparkles-cluster.svg", "brandkit/magic-sparkles-cluster.svg"),
        ("brandkit_elements/svg/item-magic-top-hat.svg", "brandkit/item-magic-top-hat.svg"),
        ("brandkit_elements/svg/item-golden-ticket-badge.svg", "brandkit/item-golden-ticket-badge.svg"),
        ("brandkit_elements/svg/item-golden-cane.svg", "brandkit/item-golden-cane.svg"),
        ("brandkit_elements/svg/item-swirl-lollipop.svg", "brandkit/item-swirl-lollipop.svg"),
        ("brandkit_elements/svg/item-wrapped-bonbon-pink.svg", "brandkit/item-wrapped-bonbon-pink.svg"),
        ("brandkit_elements/svg/item-confectionery-rose.svg", "brandkit/item-confectionery-rose.svg"),
        ("brandkit_elements/svg/item-golden-chocolate-bar.svg", "brandkit/item-golden-chocolate-bar.svg"),
        ("brandkit_elements/svg/item-ornate-corner-filigree.svg", "brandkit/item-ornate-corner-filigree.svg"),
        ("brandkit_elements/svg/item-golden-ribbon-banner.svg", "brandkit/item-golden-ribbon-banner.svg"),
        ("brandkit_elements/svg/item-stardust-sparkle-stars.svg", "brandkit/item-stardust-sparkle-stars.svg"),
        # Brandkit PNG & Backgrounds
        ("brandkit_elements/png/watermark-arcs-gold.png", "brandkit/watermark-arcs-gold.png"),
        ("brandkit_elements/png/golden-stardust-arc-swoosh.png", "brandkit/golden-stardust-arc-swoosh.png"),
        ("brandkit_elements/png/brand-color-palette-guide.png", "brandkit/brand-color-palette-guide.png"),
        ("brandkit_elements/backgrounds/bg-imperial-velvet-stardust.png", "backgrounds/bg-imperial-velvet-stardust.png"),
        ("brandkit_elements/backgrounds/bg-theatrical-pinwheel-mint.png", "backgrounds/bg-theatrical-pinwheel-mint.png"),
        ("brandkit_elements/backgrounds/bg-golden-ticket-gala.png", "backgrounds/bg-golden-ticket-gala.png"),
        # Anatomy Diagrams
        ("anatomy/diagram_anatomi_lengkap.png", "anatomy/diagram_anatomi_lengkap.png"),
        ("anatomy/fokus_01_figur_kembar_angka_44.png", "anatomy/fokus_01_figur_kembar_angka_44.png"),
        ("anatomy/fokus_02_tatapan_burung_rajawali.png", "anatomy/fokus_02_tatapan_burung_rajawali.png"),
        ("anatomy/fokus_03_kobaran_lidah_api_abadi.png", "anatomy/fokus_03_kobaran_lidah_api_abadi.png"),
        ("anatomy/fokus_04_sayap_melesat_aerodinamis.png", "anatomy/fokus_04_sayap_melesat_aerodinamis.png"),
        ("anatomy/fokus_05_garis_tengah_simetris.png", "anatomy/fokus_05_garis_tengah_simetris.png"),
        # Mockups
        ("mockups/mockup_kaos_polo.jpg", "mockups/mockup_kaos_polo.jpg"),
        ("mockups/mockup_tumbler.jpg", "mockups/mockup_tumbler.jpg"),
        ("mockups/mockup_lanyard_idcard.jpg", "mockups/mockup_lanyard_idcard.jpg"),
        ("mockups/mockup_totebag_pin.jpg", "mockups/mockup_totebag_pin.jpg"),
        # Fonts
        ("fonts/cinzel/Cinzel-Variable.ttf", "fonts/Cinzel-Variable.ttf"),
        ("fonts/playfair-display/ttf/PlayfairDisplay-Variable.ttf", "fonts/PlayfairDisplay-Variable.ttf"),
        ("fonts/plus-jakarta-sans/ttf/PlusJakartaSans-Regular.ttf", "fonts/PlusJakartaSans-Regular.ttf"),
        ("fonts/plus-jakarta-sans/ttf/PlusJakartaSans-Medium.ttf", "fonts/PlusJakartaSans-Medium.ttf"),
        ("fonts/plus-jakarta-sans/ttf/PlusJakartaSans-SemiBold.ttf", "fonts/PlusJakartaSans-SemiBold.ttf"),
        ("fonts/plus-jakarta-sans/ttf/PlusJakartaSans-Bold.ttf", "fonts/PlusJakartaSans-Bold.ttf"),
        ("fonts/plus-jakarta-sans/ttf/PlusJakartaSans-ExtraBold.ttf", "fonts/PlusJakartaSans-ExtraBold.ttf"),
        ("fonts/DynaPuff.ttf", "fonts/DynaPuff.ttf"),
    ]
    for rel_src, rel_dst in files_to_copy:
        src = os.path.join(BRAND_ROOT, rel_src)
        dst = os.path.join(PUBLIC_ASSETS, rel_dst)
        if not os.path.exists(src):
            raise FileNotFoundError(f"Missing official asset: {src}")
        copy_file(src, dst)

    # Preserve tight transparent trim on horizontal logotype for crisp Hero layout
    logo_horiz_path = os.path.join(PUBLIC_ASSETS, "png", "aversa-logotype-horizontal.png")
    lh = Image.open(logo_horiz_path).convert("RGBA")
    lh_bbox = lh.getbbox()
    if lh_bbox:
        lh.crop(lh_bbox).save(logo_horiz_path, optimize=True)

    # Crop official AVERSA 44 symbol tightly and center on square 1024x1024 transparent canvas
    sym_path = os.path.join(PUBLIC_ASSETS, "png", "logo-symbol-color.png")
    sym = Image.open(sym_path).convert("RGBA")
    sym_bbox = sym.getbbox()
    if sym_bbox:
        sym_cropped = sym.crop(sym_bbox)
        target = 1024
        inner_max = int(target * 0.92)  # 4% padding each side
        sym_cropped.thumbnail((inner_max, inner_max), Image.Resampling.LANCZOS)
        sym_canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
        sym_canvas.paste(
            sym_cropped,
            ((target - sym_cropped.width) // 2, (target - sym_cropped.height) // 2),
            sym_cropped,
        )
        sym_canvas.save(sym_path, optimize=True)

    # Copy the authentic school crest directly from the original.
    ext_dir = os.path.join(PUBLIC_ASSETS, "extracted")
    ensure_dir(ext_dir)
    for src_img, out_img in [
        ("/Users/ardianryan/Documents/logo_smansage.png", os.path.join(ext_dir, "logo-sman1gedeg.png")),
    ]:
        if not os.path.exists(src_img):
            raise FileNotFoundError(f"Missing official crest: {src_img}")
        crest = Image.open(src_img).convert("RGBA")
        cbbox = crest.getbbox()
        if cbbox:
            crest = crest.crop(cbbox)
        crest.thumbnail((512, 512), Image.Resampling.LANCZOS)
        crest.save(out_img, optimize=True)

    print(f"Copied {len(files_to_copy)} official brand kit files and the school crest.")

def extract_from_svgs():
    ext_dir = os.path.join(PUBLIC_ASSETS, "extracted")
    ensure_dir(ext_dir)

    def load_matches(svg_name):
        with open(os.path.join(REF_SVG_DIR, svg_name), "r", encoding="utf-8", errors="ignore") as f:
            c = f.read()
        return re.findall(r'xlink:href="data:image/(png|jpeg);base64,([^"]+)"', c)

    def save_rgba(matches, rgb_idx, mask_idx, out_name, max_dim=1000):
        rgb = Image.open(io.BytesIO(base64.b64decode(matches[rgb_idx][1]))).convert("RGBA")
        if mask_idx is not None:
            m = Image.open(io.BytesIO(base64.b64decode(matches[mask_idx][1]))).convert("L")
            if m.size != rgb.size:
                m = m.resize(rgb.size, Image.Resampling.LANCZOS)
            rgb.putalpha(m)

        bbox = rgb.getbbox()
        if bbox:
            rgb = rgb.crop(bbox)
        rgb.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        rgb.save(os.path.join(ext_dir, out_name), optimize=True)

    m1 = load_matches("1.svg")
    save_rgba(m1, 48, 22, "aversa-tophat-2026.png", 1024)

    m3 = load_matches("3.svg")
    save_rgba(m3, 52, 15, "guest-niken-salindry.png", 900)
    save_rgba(m3, 53, 16, "guest-kembange-jagad.png", 1200)
    save_rgba(m3, 47, 11, "guest-kembange-jagad-lead.png", 800)
    save_rgba(m3, 64, 27, "guest-title-gold.png", 900)

    print("Extracted guest star & crest PNGs from reference SVGs.")

def generate_social_banners():
    public_dir = os.path.join(PROJECT_ROOT, "public")
    ensure_dir(public_dir)

    # Create 1200x630 OpenGraph Banner using official background + brand combination + guest stars
    bg_path = os.path.join(PUBLIC_ASSETS, "backgrounds", "bg-imperial-velvet-stardust.png")
    bg = Image.open(bg_path).convert("RGBA").resize((1200, 1200), Image.Resampling.LANCZOS)
    # Crop centered 1200x630 stage view
    top = (1200 - 630) // 2
    canvas = bg.crop((0, top, 1200, top + 630))

    # Overlay dark subtle left scrim for razor-sharp typography legibility
    overlay = Image.new("RGBA", (1200, 630), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    odraw.rectangle([0, 0, 1200, 630], fill=(26, 2, 29, 90))
    odraw.rectangle([28, 28, 1172, 602], outline=(245, 197, 56, 180), width=3)
    odraw.rectangle([38, 38, 1162, 592], outline=(245, 197, 56, 80), width=1)
    canvas = Image.alpha_composite(canvas, overlay)

    # Place Brand Combination on right-center
    combo = Image.open(os.path.join(PUBLIC_ASSETS, "png", "aversa-brand-combination.png")).convert("RGBA")
    combo.thumbnail((460, 460), Image.Resampling.LANCZOS)
    canvas.paste(combo, (700, (630 - combo.height) // 2), combo)

    # Place Top Hat small accent or school crest top-left
    school = Image.open(os.path.join(PUBLIC_ASSETS, "extracted", "logo-sman1gedeg.png")).convert("RGBA")
    school.thumbnail((68, 68), Image.Resampling.LANCZOS)
    canvas.paste(school, (68, 62), school)

    draw = ImageDraw.Draw(canvas)
    font_bold = ImageFont.truetype(os.path.join(PUBLIC_ASSETS, "fonts", "PlusJakartaSans-ExtraBold.ttf"), 48)
    font_med = ImageFont.truetype(os.path.join(PUBLIC_ASSETS, "fonts", "PlusJakartaSans-SemiBold.ttf"), 24)
    font_sm = ImageFont.truetype(os.path.join(PUBLIC_ASSETS, "fonts", "PlusJakartaSans-Medium.ttf"), 20)
    font_cinzel = ImageFont.truetype(os.path.join(PUBLIC_ASSETS, "fonts", "Cinzel-Variable.ttf"), 22)

    draw.text((152, 74), "SMA NEGERI 1 GEDEG", font=font_cinzel, fill=(247, 209, 96, 255))
    draw.text((152, 104), "KABUPATEN MOJOKERTO • 1982 - 2026", font=font_sm, fill=(255, 245, 214, 220))

    draw.text((68, 185), "DIES NATALIS KE-44", font=font_bold, fill=(253, 243, 157, 255))
    draw.text((68, 245), "AVERSA FESTIVAL & GALA", font=font_bold, fill=(245, 197, 56, 255))

    draw.text((68, 330), "Puncak Acara: 17 Desember 2026", font=font_med, fill=(255, 255, 255, 255))
    draw.text((68, 368), "Bintang Tamu: Niken Salindry & Kembange Jagad", font=font_med, fill=(160, 217, 202, 255))
    draw.text((68, 432), "E-Ticketing Resmi • Official Merch Store", font=font_sm, fill=(245, 184, 203, 255))
    draw.text((68, 520), "aversa44.sman1gedeg.sch.id", font=font_med, fill=(247, 209, 96, 255))

    rgb_out = canvas.convert("RGB")
    rgb_out.save(os.path.join(public_dir, "og-banner-aversa44.png"), quality=92, optimize=True)
    rgb_out.save(os.path.join(public_dir, "twitter-banner-aversa44.png"), quality=92, optimize=True)

    # Favicon / Multi-size & SVG & Apple Touch Icon from official AVERSA 44 unclipped symbol
    with open(os.path.join(PUBLIC_ASSETS, "svg", "logo-symbol-tight.svg"), "r", encoding="utf-8") as sf:
        svg_txt = sf.read()
    svg_fav = svg_txt.replace(
        'viewBox="340 60 1370 1745" width="1370" height="1745"',
        'viewBox="340 350 1320 1460" width="64" height="64"',
    )
    with open(os.path.join(public_dir, "favicon.svg"), "w", encoding="utf-8") as sf_out:
        sf_out.write(svg_fav)

    fav_sym = Image.open(os.path.join(PUBLIC_ASSETS, "png", "logo-symbol-color.png")).convert("RGBA")
    fav_sym.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "favicon.png"), optimize=True)
    fav_sym.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "favicon-32x32.png"), optimize=True)
    fav_sym.save(
        os.path.join(public_dir, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # Apple touch icon (180x180 RGBA with subtle imperial plum canvas so iOS never fills transparent black)
    bg_apple = Image.new("RGBA", (180, 180), (54, 5, 56, 255))
    apple_sym = fav_sym.copy()
    apple_sym.thumbnail((148, 148), Image.Resampling.LANCZOS)
    bg_apple.paste(
        apple_sym,
        ((180 - apple_sym.width) // 2, (180 - apple_sym.height) // 2),
        apple_sym,
    )
    bg_apple.save(os.path.join(public_dir, "apple-touch-icon.png"), optimize=True)
    print("Generated OpenGraph 1200x630 Social Banner and transparent AVERSA 44 Favicons.")

if __name__ == "__main__":
    sync_official_assets()
    extract_from_svgs()
    generate_social_banners()
