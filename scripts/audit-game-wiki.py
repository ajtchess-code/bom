"""Compare every source record/field and exported PNG with the installed wiki data."""
import argparse, itertools, json, pathlib, struct, zipfile, zlib

def records(files):
    for path in files:
        with path.open(encoding='utf-8-sig') as stream:
            for line in stream:
                if line.strip():
                    yield json.loads(line)

def audit(source, installed):
    manifest=json.loads((source/'AI-MANIFEST.json').read_text(encoding='utf-8-sig'))
    results=[]
    for table in manifest['Tables']:
        originals=records([source/p for p in table['Files']])
        copies=records(sorted((installed/'tables'/table['Table']).glob('part-*.jsonl')))
        mismatches=[]; count=0; missing=object()
        for index,(a,b) in enumerate(itertools.zip_longest(originals,copies,fillvalue=missing)):
            count+=1
            if a!=b and len(mismatches)<10:mismatches.append(index+1)
        results.append({'table':table['Table'],'expectedRows':table['Rows'],'comparedRows':count,'mismatchExamples':mismatches,'passed':count==table['Rows'] and not mismatches})
    missing_images=[]; dimensions=[]
    for image in records([source/p for t in manifest['Tables'] if t['Table']=='Images' for p in t['Files']]):
        path=installed/image['PNGPath']
        if not path.is_file():missing_images.append(image['PNGPath']);continue
        with path.open('rb') as f:header=f.read(24)
        if header[:8]!=b'\x89PNG\r\n\x1a\n' or len(header)<24 or struct.unpack('>II',header[16:24])!=(image['Width'],image['Height']):dimensions.append(image['PNGPath'])
    archives=[]
    for filename in ['WOSB-AI-Handoff.zip','Review-Report.zip']:
        path=source/filename
        if not path.exists():continue
        mismatches=[];checked=0
        with zipfile.ZipFile(path) as archive:
            for entry in archive.infolist():
                if entry.is_dir():continue
                parts=pathlib.PurePosixPath(entry.filename).parts
                if parts[0]=='WOSB-AI-Handoff':parts=parts[1:]
                local=source.joinpath(*parts);crc=0
                if not local.is_file() or local.stat().st_size!=entry.file_size:mismatches.append(entry.filename);continue
                with local.open('rb') as stream:
                    for block in iter(lambda:stream.read(1024*1024),b''):crc=zlib.crc32(block,crc)
                checked+=1
                if crc!=entry.CRC:mismatches.append(entry.filename)
        archives.append({'archive':filename,'filesChecked':checked,'mismatches':mismatches})
    return {'tables':results,'allSourceRecordsAndFieldsMatch':all(r['passed'] for r in results),'imageFilesExpected':3829,'missingImages':missing_images,'imageDimensionMismatches':dimensions,'archives':archives,'limits':'This verifies the supplied export, not completeness of the original client/server extraction. Unparsed model data, server NPC generators, live state, and image decode issues remain separate.'}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--installed',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    result=audit(a.source.resolve(),a.installed.resolve());a.output.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='tables'},indent=2))
