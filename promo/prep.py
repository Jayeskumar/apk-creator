#!/usr/bin/env python3
"""Collects clip frame timings and still images into director/data.js."""
import json
import os
import sys
from PIL import Image

out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "out")
clips = {}
for name in sorted(os.listdir(os.path.join(out, "clips"))):
    meta = json.load(open(os.path.join(out, "clips", name, "frames.json")))
    start = meta["start"]
    frames = [[round(max(0.0, f["t"] - start), 4), f["file"]] for f in meta["frames"]]
    first = Image.open(os.path.join(out, "clips", name, meta["frames"][0]["file"]))
    clips[name] = {
        "dir": "file://" + os.path.join(out, "clips", name) + "/",
        "duration": meta["end"] - start,
        "marks": meta.get("marks", {}),
        "size": first.size,
        "top": "#%02x%02x%02x" % first.convert("RGB").getpixel((first.size[0] // 2, 6))[:3],
        "frames": frames,
    }

stills = {}
for f in sorted(os.listdir(os.path.join(out, "stills"))):
    if f.endswith(".png"):
        im = Image.open(os.path.join(out, "stills", f)).convert("RGB")
        stills[f[:-4]] = {"src": "file://" + os.path.join(out, "stills", f), "top": "#%02x%02x%02x" % im.getpixel((im.size[0] // 2, 6))}

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "director", "data.js"), "w") as fh:
    fh.write("window.PROMO = " + json.dumps({"clips": clips, "stills": stills}) + ";\n")
print("clips:", {k: f"{v['duration']:.1f}s/{len(v['frames'])}f" for k, v in clips.items()})
print("stills:", list(stills))
