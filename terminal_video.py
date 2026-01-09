#!/usr/bin/env python3
"""Generate terminal-style typing video with streaming text and blinking cursor."""

import subprocess
from PIL import Image, ImageDraw, ImageFont
import os
import tempfile
import shutil

# Video settings
WIDTH, HEIGHT = 1920, 1080
FPS = 30
BG_COLOR = (0, 0, 0)  # Black
TEXT_COLOR = (0, 255, 65)  # Matrix green #00FF41
CURSOR_COLOR = (0, 255, 65)

# Typing speed (characters per second)
CHARS_PER_SEC = 25
PAUSE_AFTER_LINE = 0.8  # seconds
CURSOR_BLINK_RATE = 0.5  # seconds

# Terminal layout
LEFT_MARGIN = 60
TOP_MARGIN = 80
LINE_HEIGHT = 45

# Content
LINES = [
    ("ARTHUR DELL", 36, 0.5),  # text, font_size, initial_delay
    ("", 0, 0.3),  # blank line pause
    ("RED TEAM. BLUE TEAM.", 38, 0.2),
    ("", 0, 0.5),
    ("Trained iteratively over millions", 32, 0.2),
    ("of adversarial combat sessions.", 32, 0.2),
    ("", 0, 0.4),
    ("Each session learns from the previous", 28, 0.2),
    ("via model training protocols.", 28, 0.2),
    ("", 0, 0.4),
    ("Foundation derived from latest attack vectors", 26, 0.2),
    ("and cyber intelligence gathered for combat.", 26, 0.2),
    ("", 0, 1.5),
    ("                                                              patent pending", 20, 0.2),
]

def get_font(size):
    """Get a monospace font."""
    font_paths = [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.ttf",
        "/System/Library/Fonts/Courier.dfont",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except:
                continue
    return ImageFont.load_default()

def generate_frames():
    """Generate all frames for the video."""
    frames = []

    # Calculate total timeline
    timeline = []  # [(start_time, end_time, line_idx, char_idx)]
    current_time = 0.0

    for line_idx, (text, font_size, delay) in enumerate(LINES):
        current_time += delay
        if text:
            for char_idx in range(len(text) + 1):
                timeline.append((current_time, line_idx, char_idx))
                current_time += 1.0 / CHARS_PER_SEC
        current_time += PAUSE_AFTER_LINE

    total_duration = current_time + 2.0  # Extra time at end
    total_frames = int(total_duration * FPS)

    print(f"Generating {total_frames} frames ({total_duration:.1f}s)...")

    # State tracking
    displayed_chars = [0] * len(LINES)  # chars shown per line

    for frame_num in range(total_frames):
        current_time = frame_num / FPS

        # Update displayed characters based on timeline
        for t, line_idx, char_idx in timeline:
            if current_time >= t:
                displayed_chars[line_idx] = max(displayed_chars[line_idx], char_idx)

        # Create frame
        img = Image.new('RGB', (WIDTH, HEIGHT), BG_COLOR)
        draw = ImageDraw.Draw(img)

        y_pos = TOP_MARGIN
        cursor_x, cursor_y = LEFT_MARGIN, TOP_MARGIN
        cursor_font_size = 32

        for line_idx, (text, font_size, _) in enumerate(LINES):
            if font_size == 0:  # blank line
                y_pos += LINE_HEIGHT // 2
                continue

            font = get_font(font_size)
            chars_to_show = displayed_chars[line_idx]
            visible_text = text[:chars_to_show]

            if visible_text:
                draw.text((LEFT_MARGIN, y_pos), visible_text, font=font, fill=TEXT_COLOR)

                # Calculate cursor position
                if chars_to_show < len(text) or (chars_to_show == len(text) and line_idx == max(i for i, c in enumerate(displayed_chars) if c > 0 or LINES[i][0] == "")):
                    bbox = font.getbbox(visible_text)
                    cursor_x = LEFT_MARGIN + bbox[2]
                    cursor_y = y_pos
                    cursor_font_size = font_size

            y_pos += LINE_HEIGHT

        # Draw blinking cursor
        cursor_visible = (current_time % CURSOR_BLINK_RATE) < (CURSOR_BLINK_RATE / 2)
        if cursor_visible:
            cursor_font = get_font(cursor_font_size)
            draw.text((cursor_x, cursor_y), "█", font=cursor_font, fill=CURSOR_COLOR)

        frames.append(img)

        if frame_num % 100 == 0:
            print(f"  Frame {frame_num}/{total_frames}")

    return frames, total_duration

def create_video(frames, duration, output_path):
    """Encode frames to video using ffmpeg."""
    temp_dir = tempfile.mkdtemp()

    try:
        print(f"Saving {len(frames)} frames to temp directory...")
        for i, frame in enumerate(frames):
            frame.save(os.path.join(temp_dir, f"frame_{i:05d}.png"))

        print("Encoding video with ffmpeg...")
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", os.path.join(temp_dir, "frame_%05d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-crf", "18",
            output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        print(f"Video saved to: {output_path}")

    finally:
        shutil.rmtree(temp_dir)

if __name__ == "__main__":
    output_path = "/Volumes/STUDIO/VIDEO/redteam_terminal_v2.mp4"
    frames, duration = generate_frames()
    create_video(frames, duration, output_path)
    print("Done!")
