"""Compile a WOSB handoff into a complete, indexed, portable wiki release.

No third-party Python dependencies. Original records and image bytes are preserved.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import shutil
import zipfile

GROUPS = {
    'Ships & shipyard': 'ShipsToPlay ShipsBasics Ship_Construction Ship_Materials',
    'Upgrades & customization': 'ShipUpgradesNew ShipDesingElements EnvDesingElements',
    'Crew & captains': 'Crew_Sailors Crew_Boarding Crew_Special UnitsInfo CaptainSkills RangInfo',
    'Weapons & ammunition': 'Cannons CannonBalls PowderKegs Cannon_Crafting Cannon_Materials',
    'Crafting & production': 'Resources Crafting_Recipes Recipe_Ingredients Factory_Levels Resource_Chain_Plans Resource_Chain_Steps Resource_Chain_Raw_Totals',
    'Trade & store': 'Market_Price_Limits TradingRoutesInfo',
    'World & ports': 'WorldPorts Port_Definitions PortLevelBonuses World StartMap Map_Objects Marker_Definitions InterestPoints Forts_Map_References Mines_and_Nodes_Map_References Dig_Sites_Map_References Altar_Map_References Fishing_Villages_Map_References Other_Villages_Map_References WindRoses',
    'NPCs, missions & activities': 'NPC_Types NPC_Mission_Waves Mode_Definitions MapsArena MapsForPassing Whale_Rules Collectable_Definitions Chest_Item_Definitions ArenaUpgrades Achievements',
    'Guilds & benefits': 'GuildBonuses GuildTitles Benefit_Levels',
    'Guides & game text': 'Gamepedia System_English_Text English_Text English_Names Rules_and_Limitations',
    'Images & source evidence': '',
}
GROUP_FOR = {t: group for group, tables in GROUPS.items() for t in tables.split()}
EVIDENCE = {'All_Data_Fields', 'Model_String_Candidates', 'Gameplay_Code_Constants', 'Gameplay_Methods', 'Game_Schemas', 'Game_Enums', 'Asset_Inventory', 'Archive_Index', 'Images', 'Entity_Images', 'UI_Image_Groups', 'Named_Entities', 'Code_Asset_References', 'Explicit_Chance_Fields', 'ProceduralPresets', 'Archive_Coverage', 'Extraction_Issues', 'Image_Decode_Audit'}

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def label(row, ordinal):
    return str(next((row[k] for k in ('EnglishName', 'NameEnglish', 'IDEnglish', 'English', 'Name', 'RecipeID', 'EntityID', 'ID', 'Key', 'Type', 'Source') if row.get(k) not in (None, '')), f'Record {ordinal + 1}'))

def build(source, dest):
    manifest = json.loads((source / 'AI-MANIFEST.json').read_text(encoding='utf-8-sig'))
    summary = json.loads((source / 'Extraction-Summary.json').read_text(encoding='utf-8-sig'))
    english_names = {r['Key']: r for r in (json.loads(line) for line in (source / 'AI-Data/English_Names.jsonl').read_text(encoding='utf-8-sig').splitlines() if line.strip())}
    tables, search, audits, image_links, display_names = [], [], [], collections.defaultdict(list), {}
    for table in manifest['Tables']:
        name = table['Table']
        target = dest / 'tables' / name / 'part-001.jsonl'
        target.parent.mkdir(parents=True, exist_ok=True)
        offsets, counts, count = [], collections.Counter(), 0
        part, total_bytes = 1, 0
        with target.open('wb') as initial_out:
            out = initial_out
            for rel in table['Files']:
                with (source / rel).open(encoding='utf-8-sig') as incoming:
                    for line in incoming:
                        if not line.strip():
                            continue
                        row = json.loads(line)
                        original_name = label(row, count)
                        localized = next((english_names[str(row[k])] for k in ('ID', 'Name') if str(row.get(k, '')) in english_names), None)
                        display_name = localized.get('EnglishName') if localized and (not row.get('EnglishName') or row.get('EnglishName') in ('Special', 'Sailors', 'Boarding')) else original_name
                        display_name = display_name or original_name
                        if display_name != original_name:
                            display_names[f'{name}:{count}'] = {'name': display_name, 'source': f"English_Names / {localized['Key']}"}
                        if count % 100 == 0:
                            if out.tell() >= 4_000_000:
                                total_bytes += out.tell()
                                out.close()
                                part += 1
                                target = target.with_name(f'part-{part:03}.jsonl')
                                out = target.open('wb')
                            offsets.append({'file': target.name, 'offset': out.tell()})
                        out.write((json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8'))
                        if name not in EVIDENCE:
                            search.append({'table': name, 'row': count, 'name': display_name, 'text': display_name.lower() + ' ' + json.dumps(row, ensure_ascii=False).lower()})
                        if row.get('Category') is not None:
                            counts[str(row['Category'])] += 1
                        if name == 'System_English_Text':
                            counts[str(row.get('System', ''))] += 1
                        if name == 'Entity_Images':
                            image_links[f"{row['Category']}:{row['EntityID']}"].append(row)
                        count += 1
            total_bytes += out.tell()
            out.close()
        if count != table['Rows']:
            raise ValueError(f"{name}: expected {table['Rows']} records, got {count}")
        dump(dest / 'indexes' / f'{name}.json', offsets)
        tables.append({'name': name, 'label': name.replace('_', ' '), 'rows': count, 'fields': table['Fields'], 'group': GROUP_FOR.get(name, 'Images & source evidence'), 'evidence': name in EVIDENCE, 'bytes': total_bytes, 'parts': part, 'categories': dict(counts)})
        audits.append({'table': name, 'rows': count, 'parts': part})
        print(f'{name}: {count:,} records', flush=True)
    dump(dest / 'search.json', search)
    dump(dest / 'image-links.json', dict(image_links))
    dump(dest / 'display-names.json', display_names)
    images = [json.loads(line) for line in (source / 'AI-Data/Images.jsonl').read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    missing = [r['PNGPath'] for r in images if not (source / r['PNGPath']).is_file()]
    if missing:
        raise ValueError(f'Missing exported images: {missing[:10]}')
    # copytree avoids adding originals or executable client files to the web release.
    shutil.copytree(source / 'Images', dest / 'Images', dirs_exist_ok=True)
    for directory in ('CodeArchive', 'CodeEvidence', 'RawData'):
        shutil.copytree(source / directory, dest / directory, dirs_exist_ok=True)
    for filename in ('START-HERE-FOR-AI.md', 'AI-MANIFEST.json', 'Extraction-Summary.json'):
        shutil.copyfile(source / filename, dest / filename)
    catalog = {'version': 2, 'release': 'wosb-' + summary['Created'][:19].replace(':', '').replace('T', '-'), 'asOf': summary['Created'], 'groups': list(GROUPS), 'tables': tables, 'images': len(images), 'coverage': summary['CoverageStatus'], 'decodeFailures': summary['ImageDecodeFailures'], 'issues': summary['IssueCount'], 'searchRecords': len(search), 'limitations': ['Static client export: current market listings, stock, ownership and active spawns are not live data.', 'Filename image candidates are not verified entity matches.', 'Some ship construction materials depend on unresolved model gun ports.', 'Code literals and reward lists are not verified drop probabilities.', 'Shipyard row placement is inherited from the previous dashboard; exact runtime layout is not present in the export.']}
    dump(dest / 'catalog.json', catalog)
    dump(dest / 'audit.json', {'tables': audits, 'missingImages': missing, 'imageCount': len(images), 'sourceSummary': summary})
    return catalog

def pack(dest, output, maximum):
    """Independent ZIPs with a conservative raw-byte budget, then verify actual size."""
    output.mkdir(parents=True, exist_ok=True)
    if any(output.glob('wiki-part-*.zip')):
        raise ValueError('Output already contains wiki parts; use a new output folder.')
    # Core first; image files later. Metadata is installed last by the host importer.
    files = sorted((p for p in dest.rglob('*') if p.is_file()), key=lambda p: (p.relative_to(dest).parts[0] == 'Images', p.as_posix()))
    budget, parts, members, raw_size = maximum - 1_000_000, [], [], 0
    def write_part():
        path = output / f'wiki-part-{len(parts)+1:03}.zip'
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
            for member in members:
                archive.write(member, member.relative_to(dest).as_posix())
        if path.stat().st_size >= maximum:
            raise ValueError(f'{path.name} exceeds the size limit')
        parts.append({'file': path.name, 'bytes': path.stat().st_size, 'sha256': sha(path), 'files': len(members)})
        print(f"Packed {path.name}: {path.stat().st_size:,} bytes", flush=True)
    for p in files:
        n = p.stat().st_size
        if n > budget:
            raise ValueError(f'Single file too large: {p}. Chunk it before packaging.')
        if members and raw_size + n > budget:
            write_part()
            members, raw_size = [], 0
        members.append(p)
        raw_size += n
    if members:
        write_part()
    catalog = json.loads((dest / 'catalog.json').read_text(encoding='utf-8'))
    dump(output / 'release.json', {'format': 'wosb-wiki-release-v1', 'release': catalog['release'], 'maxPartBytes': maximum, 'parts': parts})
    print(f'Completed {len(parts)} independent ZIPs. All are below {maximum:,} bytes.', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, required=True)
    parser.add_argument('--destination', type=pathlib.Path, required=True)
    parser.add_argument('--packages', type=pathlib.Path)
    parser.add_argument('--max-bytes', type=int, default=45_000_000)
    parser.add_argument('--refresh', action='store_true', help='Regenerate the same local release after updating compiler metadata')
    args = parser.parse_args()
    if args.destination.exists() and any(args.destination.iterdir()) and not args.refresh:
        parser.error('Destination must be empty; build releases into a new folder.')
    build(args.source.resolve(), args.destination.resolve())
    if args.packages:
        pack(args.destination.resolve(), args.packages.resolve(), args.max_bytes)
