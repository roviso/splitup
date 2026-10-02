#!/bin/bash
# sheet.sh <clip.mp4> <out.jpg> : 6 frames across the clip, side by side, to eyeball motion and artifacts
f=$1; d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
ffmpeg -y -loglevel error -i "$f" -vf "fps=6/$d,scale=270:480,tile=6x1" -frames:v 1 "$2"
