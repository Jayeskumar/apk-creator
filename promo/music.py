#!/usr/bin/env python3
"""
Original soundtrack + sound effects for the APK Creator promo, synthesized from
scratch (no samples, no third-party music), so the video is free of licensing
issues.

120 BPM -> one bar = 2 seconds, so every scene change lands on a bar line.
Progression: Am - F - C - G (one chord per bar).

    python3 promo/music.py out/music.wav
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
LENGTH = 108.0  # seconds (video is 106 s; the tail lets the last chord ring)
N = int(SR * LENGTH)
rng = np.random.default_rng(7)

# Scene boundaries (seconds) shared with the video director.
CUTS = [6, 12, 24, 34, 46, 56, 82, 90]
BUILD_DONE = 62.6   # moment the build finishes on screen
DROP = 66.0         # "Let AI build it"
OUTRO = 98.0


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


CHORDS = [  # (bass root, chord tones) per bar, cycling
    (45, [57, 60, 64, 69]),  # Am
    (41, [53, 57, 60, 65]),  # F
    (48, [55, 60, 64, 67]),  # C
    (43, [55, 59, 62, 67]),  # G
]


def chord_at(bar):
    return CHORDS[bar % 4]


def stereo(n=N):
    return np.zeros((n, 2))


def add(buf, sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    if sig.ndim == 1:
        buf[i:i + len(sig), 0] += sig * gain * l * np.sqrt(2)
        buf[i:i + len(sig), 1] += sig * gain * r * np.sqrt(2)
    else:
        buf[i:i + len(sig)] += sig * gain


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def saw(freq, dur, harmonics=40, detune=0.0):
    t = t_axis(dur)
    f = freq * (2 ** (detune / 1200))
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if f * k > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * k * t + k * 0.3) / k
    return out * 0.6


def env_adsr(n, a, d, s, r, total):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where(t >= a + d, s, e)
    rel = np.clip((total - t) / max(r, 1e-4), 0, 1)
    return e * np.minimum(1, rel)


def lowpass(x, cutoff, order=2):
    sos = butter(order, min(cutoff, SR / 2.3), "low", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def highpass(x, cutoff, order=2):
    sos = butter(order, cutoff, "high", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def bandpass(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], "band", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def feedback_delay(x, delay_s, feedback, mix):
    """y[n] = x[n] + fb * y[n-D], processed in vectorised blocks of D samples."""
    d = int(delay_s * SR)
    y = x.copy()
    for s in range(d, len(y), d):
        e = min(s + d, len(y))
        y[s:e] += feedback * y[s - d:e - d]
    return x * (1 - mix) + (y - x) * mix + x * mix * 0  # wet = echoes only


def comb(x, d, g):
    y = x.copy()
    for s in range(d, len(y), d):
        e = min(s + d, len(y))
        y[s:e] += g * y[s - d:e - d]
    return y


def allpass(x, d, g):
    y = np.zeros_like(x)
    y[:d] = -g * x[:d]
    for s in range(d, len(x), d):
        e = min(s + d, len(x))
        y[s:e] = -g * x[s:e] + x[s - d:e - d] + g * y[s - d:e - d]
    return y


def reverb(x, size=1.0, damp=4500):
    """Small Schroeder reverb (parallel combs + series allpasses), per channel."""
    out = np.zeros_like(x)
    for ch, spread in ((0, 0), (1, 23)):
        sig = lowpass(x[:, ch], damp)
        acc = np.zeros(len(sig))
        for d, g in ((1557, 0.84), (1617, 0.83), (1491, 0.85), (1422, 0.84), (1277, 0.83), (1356, 0.84)):
            acc += comb(sig, int((d + spread) * size), g)
        acc /= 6
        for d, g in ((225, 0.5), (556, 0.5), (441, 0.5)):
            acc = allpass(acc, d + spread, g)
        out[:, ch] = acc
    return out


# ---------------------------------------------------------------- arrangement helpers
def section(t):
    if t < 6:
        return "intro"
    if t < 12:
        return "lift"
    if t < 56:
        return "groove"
    if t < DROP:
        return "build"
    if t < OUTRO:
        return "drop"
    return "outro"


# ---------------------------------------------------------------- instruments
def make_pad():
    buf = stereo()
    nbars = int(LENGTH / BAR) + 1
    for bar in range(nbars):
        t0 = bar * BAR
        if t0 >= LENGTH:
            break
        _, tones = chord_at(bar)
        dur = BAR + 0.6
        sec = section(t0)
        for i, n in enumerate(tones):
            for det, pan in ((-9, -0.6), (9, 0.6)):
                s = saw(midi(n), dur, harmonics=24, detune=det)
                e = env_adsr(len(s), 0.35, 0.4, 0.8, 0.5, dur)
                add(buf, s * e, t0, gain=0.1, pan=pan * (0.6 + 0.12 * i))
    # filter opens over the intro, closes a little in the outro
    out = np.zeros_like(buf)
    seg = int(SR * 0.5)
    for s in range(0, N, seg):
        t = s / SR
        if t < 12:
            cutoff = 600 + 2600 * min(1, t / 11)
        elif 56 <= t < DROP:
            cutoff = 1400 + 3600 * ((t - 56) / (DROP - 56)) ** 2   # tension sweep
        elif t < OUTRO:
            cutoff = 4200 if t >= DROP else 3400
        else:
            cutoff = 3400 - 1800 * min(1, (t - OUTRO) / 8)
        out[s:s + seg] = lowpass(buf[max(0, s - 2048):s + seg], cutoff)[-(min(seg, N - s)):]
    return out


def make_arp():
    buf = stereo()
    step = BEAT / 4
    pattern = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 1, 2, 3, 2]
    k = 0
    t = 0.0
    while t < OUTRO + BAR:
        bar = int(t // BAR)
        _, tones = chord_at(bar)
        sec = section(t)
        n = tones[pattern[k % 16]] + 12
        dur = 0.22
        s = saw(midi(n), dur, harmonics=12) * 0.5 + np.sin(2 * np.pi * midi(n) * t_axis(dur)) * 0.6
        e = np.exp(-t_axis(dur) / 0.07)
        level = {"intro": 0.09, "lift": 0.11, "groove": 0.13, "build": 0.14, "drop": 0.15, "outro": 0.1}[sec]
        if sec == "outro" and t > OUTRO + BAR:
            level = 0
        add(buf, s * e, t, gain=level, pan=0.6 if k % 2 else -0.6)
        k += 1
        t += step
    buf = lowpass(buf, 7000)
    echoes = feedback_delay(buf, BEAT * 0.75, 0.38, 1.0)
    return buf + echoes * 0.35


def make_bass():
    buf = stereo()
    t = 12.0 - BAR * 3  # enters at 6s quietly
    while t < OUTRO:
        bar = int(t // BAR)
        root, _ = chord_at(bar)
        sec = section(t)
        for eighth in range(8):
            tt = t + eighth * BEAT / 2
            if tt >= OUTRO:
                break
            dur = BEAT / 2 * 0.92
            f = midi(root - 12)
            x = t_axis(dur)
            s = np.sin(2 * np.pi * f * x) + 0.35 * np.sin(2 * np.pi * 2 * f * x) + 0.12 * np.sin(2 * np.pi * 3 * f * x)
            s = np.tanh(1.6 * s)
            e = env_adsr(len(s), 0.004, 0.08, 0.7, 0.05, dur)
            accent = 1.0 if eighth % 2 else 0.7  # off-beat pump
            level = 0.0 if sec == "intro" else (0.07 if sec == "lift" else 0.11)
            if 56 <= tt < DROP:
                level = 0.075 if eighth % 2 else 0.0   # sparse pulse during the build
            if sec == "drop":
                level = 0.12
            add(buf, s * e * accent, tt, gain=level)
        t += BAR
    return highpass(lowpass(buf, 900), 40)


def kick():
    dur = 0.42
    x = t_axis(dur)
    f = 45 + 110 * np.exp(-x / 0.035)
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-x / 0.16)
    click = rng.standard_normal(len(x)) * np.exp(-x / 0.004) * 0.25
    return np.tanh(1.8 * (body + click))


def clap():
    dur = 0.3
    x = t_axis(dur)
    noise = rng.standard_normal(len(x))
    env = np.exp(-x / 0.09)
    for off in (0.0, 0.011, 0.022):  # flam layers
        env += np.where(x > off, np.exp(-(x - off) / 0.006), 0) * 0.6
    n = bandpass(noise * env, 900, 5500)
    tone = np.sin(2 * np.pi * 190 * x) * np.exp(-x / 0.05) * 0.4
    return n * 0.8 + tone


def hat(open_=False):
    dur = 0.35 if open_ else 0.06
    x = t_axis(dur)
    n = highpass(rng.standard_normal(len(x)), 7000)
    return n * np.exp(-x / (0.12 if open_ else 0.018))


def crash():
    dur = 2.6
    x = t_axis(dur)
    n = highpass(rng.standard_normal(len(x)), 4500) * np.exp(-x / 0.9)
    metal = sum(np.sin(2 * np.pi * f * x) for f in (5310, 6870, 8120)) * np.exp(-x / 0.6) * 0.05
    return n + metal


def make_drums():
    buf = stereo()
    K, C, Hc, Ho = kick(), clap(), hat(), hat(True)
    for beat in range(int(LENGTH / BEAT)):
        t = beat * BEAT
        sec = section(t)
        if sec in ("intro", "outro"):
            continue
        in_bar = beat % 4
        if sec == "lift":
            if in_bar in (0,):
                add(buf, K, t, 0.3)
            continue
        tension = 56 <= t < DROP          # build scene: strip back, then fill
        if tension and t >= DROP - 2.0:
            continue                          # kick drops out under the snare roll
        add(buf, K, t, 0.36 if tension else (0.44 if sec == "drop" else 0.4))
        if in_bar in (1, 3) and not tension and t >= 16:
            add(buf, C, t, 0.3 if sec == "drop" else 0.25, pan=0.05)
        if not tension or t >= 60:
            add(buf, Hc, t + BEAT / 2, 0.17 if sec == "drop" else 0.15, pan=0.35)
            add(buf, Hc, t + BEAT / 4 * 3, 0.05, pan=-0.35)
        if sec == "drop":
            add(buf, Hc, t + BEAT / 4, 0.04, pan=-0.5)
        if in_bar == 3 and (beat // 4) % 2 == 1 and not tension:
            add(buf, Ho, t + BEAT / 2, 0.09, pan=0.3)
    # snare roll into the drop
    t = DROP - BAR
    step = BEAT / 2
    while t < DROP - 0.02:
        prog = 1 - (DROP - t) / BAR
        add(buf, C, t, 0.08 + 0.2 * prog, pan=0.0)
        step = BEAT / 2 if prog < 0.5 else BEAT / 4 if prog < 0.8 else BEAT / 8
        t += step
    for at in (12.0, DROP, OUTRO):
        add(buf, crash(), at, 0.32, pan=0.15)
    return buf


def sidechain():
    env = np.ones(N)
    x = t_axis(0.32)
    duck = 1 - 0.55 * np.exp(-x / 0.11)
    for beat in range(int(LENGTH / BEAT)):
        t = beat * BEAT
        if section(t) in ("groove", "build", "drop"):
            i = int(t * SR)
            env[i:i + len(duck)] = np.minimum(env[i:i + len(duck)], duck[: N - i])
    return env[:, None]


def bell(freq, dur=1.6):
    x = t_axis(dur)
    mod = np.sin(2 * np.pi * freq * 3.5 * x) * 2.2 * np.exp(-x / 0.35)
    return np.sin(2 * np.pi * freq * x + mod) * np.exp(-x / 0.55)


def make_lead():
    """A simple hook over the progression for the AI and deploy sections."""
    buf = stereo()
    # (beat offset within the 4-bar phrase, midi note, length in beats)
    phrase = [
        (0, 76, 1), (1, 76, 0.5), (1.5, 74, 0.5), (2, 72, 1.5),
        (4, 72, 1), (5, 69, 0.5), (5.5, 72, 1.5),
        (8, 76, 1), (9, 79, 0.5), (9.5, 76, 0.5), (10, 74, 1.5),
        (12, 74, 1), (13, 71, 0.5), (13.5, 74, 0.5), (14, 79, 2),
    ]
    for start in (DROP, DROP + 8, 90.0):
        for b, n, ln in phrase:
            t = start + b * BEAT
            if t >= OUTRO:
                continue
            add(buf, bell(midi(n), ln * BEAT + 0.8), t, 0.15, pan=0.1)
    echoes = feedback_delay(buf, BEAT * 0.75, 0.35, 1.0)
    return buf + echoes * 0.3


def make_outro_chord():
    buf = stereo()
    for n, pan in ((45, 0), (57, -0.3), (60, 0.3), (64, -0.2), (69, 0.2), (76, 0)):
        s = saw(midi(n), 9.0, harmonics=18) * 0.5 + np.sin(2 * np.pi * midi(n) * t_axis(9.0))
        e = env_adsr(len(s), 0.01, 1.0, 0.55, 6.0, 9.0)
        add(buf, lowpass(s * e, 2600), OUTRO, 0.09, pan)
    add(buf, bell(midi(81), 4.0), OUTRO, 0.09)
    add(buf, bell(midi(88), 4.0), OUTRO + BEAT / 2, 0.05, pan=0.3)
    return buf


# ---------------------------------------------------------------- sound effects
def whoosh(dur=0.7, rising=True):
    x = t_axis(dur)
    n = rng.standard_normal((len(x), 2))
    out = np.zeros_like(n)
    seg = 1024
    for s in range(0, len(x), seg):
        p = s / len(x)
        c = 400 + 5000 * (p if rising else 1 - p)
        out[s:s + seg] = bandpass(n[max(0, s - 2048):s + seg], c * 0.6, min(c * 1.6, SR / 2.3))[-min(seg, len(x) - s):]
    env = np.sin(np.pi * np.clip(x / dur, 0, 1)) ** 2
    pan = np.linspace(-0.8, 0.8, len(x))
    out[:, 0] *= env * (1 - pan) / 2
    out[:, 1] *= env * (1 + pan) / 2
    return out


def riser(dur=4.0):
    x = t_axis(dur)
    n = rng.standard_normal(len(x))
    out = np.zeros_like(n)
    seg = 1024
    for s in range(0, len(x), seg):
        p = s / len(x)
        c = 300 * (20 ** p)
        out[s:s + seg] = bandpass(n[max(0, s - 2048):s + seg], c * 0.7, min(c * 1.5, SR / 2.3))[-min(seg, len(x) - s):]
    tone = np.sin(2 * np.pi * np.cumsum(220 * (4 ** (x / dur))) / SR) * 0.15
    return (out + tone) * (x / dur) ** 2


def chime():
    buf = stereo(int(SR * 2.5))
    for i, n in enumerate((84, 88, 91, 96)):
        add(buf, bell(midi(n), 1.6), i * 0.075, 0.18 - i * 0.025, pan=-0.3 + i * 0.2)
    return buf


def boom():
    x = t_axis(1.8)
    f = 38 + 60 * np.exp(-x / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.6)


def make_sfx():
    buf = stereo()
    for c in CUTS:
        add(buf, whoosh(0.7), c - 0.45, 0.16)
    add(buf, riser(4.0), DROP - 4.0, 0.22)
    add(buf, boom(), DROP, 0.5)
    add(buf, boom(), OUTRO, 0.45)
    add(buf, chime(), BUILD_DONE, 1.0)
    add(buf, whoosh(1.2), 0.3, 0.12)
    return buf


def main(out_path):
    print("synthesizing…", flush=True)
    sc = sidechain()
    pad = make_pad() * sc
    arp = make_arp()
    bass = make_bass() * (0.75 + 0.25 * sc)
    drums = make_drums()
    lead = make_lead()
    outro = make_outro_chord()
    music = pad + arp + bass + drums + lead + outro
    music += reverb(pad * 0.5 + arp * 0.6 + lead * 0.8 + outro * 0.6 + drums * 0.08, size=1.1) * 0.35
    sfx = make_sfx()
    sfx += reverb(sfx, size=0.8) * 0.2

    mix = highpass(music + sfx, 28)
    # gentle fade-in and final fade
    t = np.arange(N) / SR
    mix *= np.clip(t / 0.8, 0, 1)[:, None]
    mix *= np.clip((LENGTH - t) / 4.0, 0, 1)[:, None]
    # soft clip + normalise to -1 dBFS
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
    pcm = (mix * 32767).astype("<i2")
    import wave
    with wave.open(out_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {out_path} ({LENGTH:.0f}s)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "music.wav")
