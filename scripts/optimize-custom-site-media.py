"""Local, content-preserving web derivatives. Never edits source files.
Usage: python scripts/optimize-custom-site-media.py SOURCE OUTPUT
Requires Pillow and imageio-ffmpeg in the operator's Python environment.
No network, credentials or hosted writes. Output includes source/derivative hashes.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import sys, subprocess, re, json, hashlib
import imageio_ffmpeg

source, output = (Path(v).resolve() for v in sys.argv[1:3])
if source == output or source in output.parents:
    raise SystemExit('Output must be separate from the source archive.')
output.mkdir(parents=True, exist_ok=True)
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
records = []
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
for file in sorted(source.iterdir()):
    if file.suffix.lower() == '.jpg':
        with Image.open(file) as raw:
            image = ImageOps.exif_transpose(raw).convert('RGB')
            image.thumbnail((1400,1400), Image.Resampling.LANCZOS)
            target = output / (file.stem+'.webp')
            image.save(target, 'WEBP', quality=80, method=6)
            records.append(dict(source=file.name, sourceBytes=file.stat().st_size, sourceSha256=sha(file), output=target.name, bytes=target.stat().st_size, sha256=sha(target), width=image.width, height=image.height, kind='image'))
    elif file.suffix.lower() == '.mp4':
        probe = subprocess.run([ffmpeg,'-hide_banner','-i',str(file)],capture_output=True,text=True).stderr
        duration = re.search(r'Duration: (\d+):(\d+):([\d.]+)',probe)
        if not duration: raise RuntimeError('Cannot probe '+file.name)
        seconds = int(duration[1])*3600+int(duration[2])*60+float(duration[3])
        # All selected clips are controlled showcase clips. Audio stripped, max 12s.
        target = output / (file.stem+'.web.mp4')
        command = [ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(file),'-t','12','-an','-vf',"scale='min(640,iw)':-2",'-r','24','-c:v','libx264','-crf','29','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
        subprocess.run(command,check=True)
        poster = output / (file.stem+'.poster.webp')
        subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-ss',str(min(1,seconds/3)),'-i',str(target),'-frames:v','1','-vf',"scale='min(640,iw)':-2",str(poster)],check=True)
        with Image.open(poster) as im: width,height=im.size
        records.append(dict(source=file.name, sourceBytes=file.stat().st_size, sourceSha256=sha(file), sourceDurationSeconds=seconds, output=target.name, bytes=target.stat().st_size, sha256=sha(target), durationSeconds=min(12,seconds), width=width, height=height, kind='video',poster=poster.name,posterBytes=poster.stat().st_size))
        (output/(file.stem+'.probe.txt')).write_text(probe,encoding='utf-8')
(output/'optimization.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
videos=[r for r in records if r['kind']=='video']
sheet=Image.new('RGB',(1000,((len(videos)+4)//5)*270),'#222')
draw=ImageDraw.Draw(sheet)
for index,record in enumerate(videos):
    with Image.open(output/record['poster']) as im:
        thumb=ImageOps.contain(im,(195,225));sheet.paste(thumb,((index%5)*200,(index//5)*270))
    draw.text(((index%5)*200+2,(index//5)*270+230),record['source'][-8:],fill='white')
sheet.save(output/'video-contact-sheet.jpg')
print(json.dumps({'assets':len(records),'videos':len(videos),'videoOriginalBytes':sum(v['sourceBytes'] for v in videos),'videoWebBytes':sum(v['bytes'] for v in videos),'maxVideoBytes':max(v['bytes'] for v in videos)}))
