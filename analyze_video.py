from pathlib import Path
import imageio_ffmpeg, subprocess
from PIL import Image, ImageDraw
out=Path("reference-analysis");out.mkdir(exist_ok=True)
video=next(Path("ref").glob("*.mp4"))
ff=imageio_ffmpeg.get_ffmpeg_exe()
p=subprocess.run([ff,"-i",str(video)],capture_output=True,text=True,encoding='utf-8',errors='replace')
print(p.stderr)
subprocess.run([ff,"-y","-i",str(video),"-vf","fps=1/5,scale=960:-1",str(out/"frame-%03d.jpg")],capture_output=True)
frames=list(out.glob("frame-*.jpg"))
for start in range(0,len(frames),12):
    batch=frames[start:start+12]
    sheet=Image.new("RGB",(1440, (len(batch)+2)//3*295),"#202020")
    draw=ImageDraw.Draw(sheet)
    for i,f in enumerate(batch):
        im=Image.open(f);im.thumbnail((480,270))
        x=i%3*480;y=i//3*295
        sheet.paste(im,(x,y));draw.text((x+8,y+272),f"{(start+i)*5:03d} sec  {f.name}",fill="white")
    sheet.save(out/f"contact-{start//12+1}.jpg")
print("FRAMES",len(frames))
