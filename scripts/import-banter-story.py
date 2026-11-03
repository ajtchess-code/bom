#!/usr/bin/env python3
"""Append/update Gazette stories. Supports text, Markdown, or images with Tesseract."""
import argparse,hashlib,json,os,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('sources',nargs='+',type=Path)
p.add_argument('--archive',type=Path,default=Path(__file__).resolve().parents[1]/'data/banter/gazette-archive.json')
a=p.parse_args()
data=json.loads(a.archive.read_text()) if a.archive.exists() else {'schemaVersion':1,'articles':[]}
for src in a.sources:
 if src.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.tif','.tiff'}:
  try:r=subprocess.run(['tesseract',str(src),'stdout','--psm','3'],capture_output=True,text=True,check=True)
  except FileNotFoundError:raise SystemExit('Image import requires Tesseract. Alternatively import a .txt or .md transcript.')
  text=r.stdout.strip();extraction='unreviewed OCR from historical satire image'
 elif src.suffix.lower() in {'.txt','.md'}:
  text=src.read_text(encoding='utf-8').strip();extraction='administrator-imported text; historical satire'
 else:raise SystemExit('Unsupported file: '+src.name)
 if len(text)<80:raise SystemExit('Too little readable text in '+src.name+'. Import a corrected transcript instead.')
 digest=hashlib.sha256(text.encode()).hexdigest()[:16]
 data['articles']=[x for x in data['articles'] if x.get('source')!=src.name and x.get('id')!=digest]
 data['articles'].append({'id':digest,'title':src.stem,'source':src.name,'extraction':extraction,'text':text})
 print('Imported:',src.name)
if len(data['articles'])>2000:raise SystemExit('Archive exceeds the 2000 story limit; split or curate it first.')
encoded=json.dumps(data,ensure_ascii=False,indent=2)
if len(encoded.encode())>12_000_000:raise SystemExit('Archive exceeds 12 MB; curate it first.')
a.archive.parent.mkdir(parents=True,exist_ok=True)
with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=a.archive.parent,delete=False) as f:
 f.write(encoded);tmp=f.name
os.replace(tmp,a.archive)
print('Archive:',a.archive,'Stories:',len(data['articles']))
