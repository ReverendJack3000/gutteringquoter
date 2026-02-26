#!/usr/bin/env python3
"""Generate optimized panel thumbnail PNGs from local Marley SVG assets.

This script renders SVGs through headless Chromium (Puppeteer), then quantizes
PNGs for panel use. It avoids native cairo dependencies so it runs in the
project's existing Node test/tooling environment.

Usage:
  python3 scripts/generate_panel_thumbs.py
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate panel thumbnail PNG assets from Marley SVG files.")
    parser.add_argument(
        "--input-dir",
        default="frontend/assets/marley",
        help="Directory containing source Marley SVG files (default: frontend/assets/marley)",
    )
    parser.add_argument(
        "--output-dir",
        default="frontend/assets/marley/thumbs",
        help="Directory to write generated PNG thumbnails (default: frontend/assets/marley/thumbs)",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=220,
        help="Output thumbnail width in px (default: 220)",
    )
    parser.add_argument(
        "--colors",
        type=int,
        default=64,
        help="Palette color count for PNG quantization (default: 64)",
    )
    return parser.parse_args()


def ensure_python_deps() -> tuple[object, object]:
    try:
        from PIL import Image  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Missing dependency 'Pillow'. Install with: pip install pillow") from exc
    return Image, __import__("io")


def is_thumb_source(svg_path: Path) -> bool:
    if svg_path.name.startswith("."):
        return False
    if svg_path.parent.name == "thumbs":
        return False
    return True


def render_with_puppeteer(jobs: list[dict[str, str]], width_px: int) -> None:
    node_script = r"""
const fs = require('fs');
const puppeteer = require('puppeteer');

const jobs = JSON.parse(process.argv[1]);
const widthPx = parseInt(process.argv[2], 10) || 220;

function injectThumbStyle(svgText) {
  if (typeof svgText !== 'string') return svgText;
  const style = '<style>path, ellipse, circle, rect, polygon, polyline { fill: #5a5a5a !important; stroke: #333 !important; }</style>';
  const svgIdx = svgText.indexOf('<svg');
  if (svgIdx === -1) return svgText;
  const closeIdx = svgText.indexOf('>', svgIdx);
  if (closeIdx === -1) return svgText;
  return svgText.slice(0, closeIdx + 1) + style + svgText.slice(closeIdx + 1);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: Math.max(320, widthPx + 80), height: 1200, deviceScaleFactor: 1 });

  for (const job of jobs) {
    const rawSvg = fs.readFileSync(job.input, 'utf8');
    const styledSvg = injectThumbStyle(rawSvg);
    const encoded = Buffer.from(styledSvg, 'utf8').toString('base64');
    const src = `data:image/svg+xml;base64,${encoded}`;

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
          #thumb { width: ${widthPx}px; height: auto; display: block; }
        </style>
      </head>
      <body>
        <img id="thumb" src="${src}" alt="" />
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const img = document.getElementById('thumb');
      return !!img && img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().height > 0;
    });

    const imgEl = await page.$('#thumb');
    if (!imgEl) {
      throw new Error(`Unable to locate rendered thumb element for ${job.input}`);
    }
    const box = await imgEl.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error(`Invalid thumb bounds for ${job.input}`);
    }

    await page.screenshot({
      path: job.output,
      clip: {
        x: Math.max(0, box.x),
        y: Math.max(0, box.y),
        width: Math.max(1, Math.ceil(box.width)),
        height: Math.max(1, Math.ceil(box.height)),
      },
      omitBackground: true,
      type: 'png',
    });
  }

  await browser.close();
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
"""
    cmd = ["node", "-e", node_script, json.dumps(jobs), str(width_px)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = result.stderr.strip() or "Unknown Puppeteer rendering error"
        raise RuntimeError(f"Puppeteer render failed: {stderr}")


def quantize_png(path: Path, colors: int, Image: object) -> None:
    img = Image.open(path).convert("RGBA")
    quantized = img.quantize(colors=max(2, colors), method=Image.FASTOCTREE)
    quantized.save(path, format="PNG", optimize=True)


def main() -> int:
    args = parse_args()
    Image, _io = ensure_python_deps()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 1

    svg_files = sorted(p for p in input_dir.glob("*.svg") if is_thumb_source(p))
    if not svg_files:
        print(f"No SVG files found in {input_dir}", file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    jobs = [
        {
            "input": str(svg_path),
            "output": str(output_dir / f"{svg_path.stem}.png"),
        }
        for svg_path in svg_files
    ]

    render_with_puppeteer(jobs=jobs, width_px=args.width)

    for job in jobs:
        quantize_png(Path(job["output"]), colors=args.colors, Image=Image)

    print(f"Generated {len(jobs)} thumbnail(s) in {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
