#!/usr/bin/env python3
"""Gündem yazıları için yardımcı komutlar (zamanlanmış görev kullanır; bkz. GOREV.md).

  python3 scripts/gundem/gundem.py scan [--hours N]       Son başarılı taramadan beri yeni videoları sırayla listeler (JSON)
  python3 scripts/gundem/gundem.py done                    Taramayı başarılı say (sonraki tarama buradan başlar)
  python3 scripts/gundem/gundem.py transcript VIDEO_ID    Transkripti /tmp/gundem/VIDEO_ID.txt dosyasına yazar
  python3 scripts/gundem/gundem.py add yazi.json          Yazıyı public/gundem/ altına ekler, dizini günceller
  python3 scripts/gundem/gundem.py blog SLUG              Yazıyı site bloguna Türkçe Markdown olarak ekler

Yalnızca standart kütüphane; blog görselleri için Pillow varsa JPG'ye küçültür.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / 'public' / 'gundem'
BLOG_DIR = ROOT / 'site' / 'src' / 'content' / 'blog'
BLOG_IMG = ROOT / 'site' / 'public' / 'blog'
CHANNELS_FILE = Path(__file__).with_name('kanallar.json')
STATE_FILE = Path(__file__).with_name('durum.json')
MAX_CATCHUP_HOURS = 7 * 24
TMP = Path('/tmp/gundem')
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9'}
CATEGORIES = {'piyasa-notu', 'finans-haberleri', 'finans-egitimi', 'kisisel-finans', 'kripto'}
INDEX_MAX = 300


def http(url, headers=None, method='GET'):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})}, method=method)
    return urllib.request.urlopen(req, timeout=30)


def load_index():
    p = APP_DIR / 'index.json'
    return json.loads(p.read_text('utf-8')) if p.exists() else {'articles': []}


def processed_ids():
    ids = {a['videoId'] for a in load_index()['articles']}
    # Eski günlük görevin yalnızca bloga yazdığı notlar da işlenmiş sayılır
    for p in BLOG_DIR.glob('*.md'):
        ids.update(re.findall(r'youtube:([\w-]{11})', p.read_text('utf-8')))
    return ids


def channel_id(ch):
    if ch.get('id'):
        return ch['id']
    html = http(f"https://www.youtube.com/{ch['handle']}").read().decode('utf-8', 'ignore')
    m = re.search(r'"(?:externalId|channelId)":"(UC[\w-]{22})"', html) or re.search(r'channel/(UC[\w-]{22})', html)
    if not m:
        raise RuntimeError(f"kanal kimliği bulunamadı: {ch['handle']}")
    ch['id'] = m.group(1)
    return ch['id']


def is_short(video_id):
    try:
        r = http(f'https://www.youtube.com/shorts/{video_id}', method='HEAD')
        return r.geturl().rstrip('/').endswith(video_id) and '/shorts/' in r.geturl()
    except urllib.error.HTTPError:
        return False


REL_UNITS = [('mo', 30 * 86400), ('month', 30 * 86400), ('second', 1), ('sec', 1), ('minute', 60), ('min', 60), ('hour', 3600), ('hr', 3600),
             ('day', 86400), ('week', 7 * 86400), ('year', 365 * 86400), ('s', 1), ('m', 60), ('h', 3600), ('d', 86400), ('w', 7 * 86400), ('y', 365 * 86400)]


def rel_seconds(text):
    """'3h ago', '1 day ago', 'Streamed 5 hours ago' → saniye; canlı yayın → 0; anlaşılmazsa None."""
    t = (text or '').lower()
    if 'watching' in t or t.strip() == 'live':
        return 0
    m = re.search(r'(\d+)\s*([a-z]+)\s+ago', t)
    if not m:
        return None
    for unit, sec in REL_UNITS:
        if m.group(2) == unit or m.group(2).rstrip('s') == unit:
            return int(m.group(1)) * sec
    return None


def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def page_entries(cid):
    """RSS çalışmazsa yedek: kanalın Videolar ve Canlı yayınlar sekmelerinden (göreli tarihle)."""
    now = datetime.now(timezone.utc)
    out, seen = [], set()
    for tab in ('videos', 'streams'):
        html = http(f'https://www.youtube.com/channel/{cid}/{tab}').read().decode('utf-8', 'ignore')
        m = re.search(r'var ytInitialData\s*=\s*(\{.*?\});\s*</script>', html, re.S)
        if not m:
            continue
        for o in walk(json.loads(m.group(1))):
            vid = title = when = None
            if 'lockupViewModel' in o:
                lv = o['lockupViewModel']
                if lv.get('contentType', 'LOCKUP_CONTENT_TYPE_VIDEO') != 'LOCKUP_CONTENT_TYPE_VIDEO':
                    continue
                vid = lv.get('contentId')
                meta = lv.get('metadata', {}).get('lockupMetadataViewModel', {})
                title = meta.get('title', {}).get('content')
                texts = [d.get('content', '') for d in walk(meta.get('metadata', {})) if isinstance(d.get('content'), str)]
                texts += [d.get('accessibilityLabel', '') for d in walk(meta.get('metadata', {})) if isinstance(d.get('accessibilityLabel'), str)]
                when = next((x for x in (rel_seconds(t) for t in texts) if x is not None), None)
            elif 'videoRenderer' in o or 'gridVideoRenderer' in o:
                vr = o.get('videoRenderer') or o.get('gridVideoRenderer')
                vid = vr.get('videoId')
                title = ''.join(r.get('text', '') for r in vr.get('title', {}).get('runs', [])) or vr.get('title', {}).get('simpleText')
                when = rel_seconds(vr.get('publishedTimeText', {}).get('simpleText'))
                if when is None and any('LIVE' in str(b) for b in vr.get('badges', [])):
                    when = 0
            if not vid or vid in seen or when is None:
                continue
            seen.add(vid)
            out.append((vid, title or '', now - timedelta(seconds=when)))
    if not out:
        raise RuntimeError('kanal sayfasından video okunamadı')
    return out


def scan_since(hours):
    """Varsayılan: son başarılı taramadan 1 saat öncesi (en az 12, en çok 7 gün geriye).
    Görev bir saatte çalışamazsa (ör. kullanım limiti) sonraki çalışma kaçanları toplar."""
    now = datetime.now(timezone.utc)
    if hours is not None:
        return now - timedelta(hours=hours)
    last = None
    if STATE_FILE.exists():
        last = datetime.fromisoformat(json.loads(STATE_FILE.read_text('utf-8'))['lastScan'].replace('Z', '+00:00'))
    since = min(now - timedelta(hours=12), (last or now) - timedelta(hours=1))
    return max(since, now - timedelta(hours=MAX_CATCHUP_HOURS))


def cmd_done():
    STATE_FILE.write_text(json.dumps({'lastScan': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}) + '\n', 'utf-8')
    print('son tarama kaydedildi')


def cmd_scan(hours=None):
    channels = json.loads(CHANNELS_FILE.read_text('utf-8'))
    done = processed_ids()
    since = scan_since(hours)
    ns = {'a': 'http://www.w3.org/2005/Atom', 'yt': 'http://www.youtube.com/xml/schemas/2015', 'media': 'http://search.yahoo.com/mrss/'}
    out, errors, changed = [], [], False
    for order, ch in enumerate(channels, 1):
        try:
            had = bool(ch.get('id'))
            cid = channel_id(ch)
            changed |= not had
            try:
                feed = ET.fromstring(http(f'https://www.youtube.com/feeds/videos.xml?channel_id={cid}').read())
                entries = [(e.findtext('yt:videoId', namespaces=ns), e.findtext('a:title', namespaces=ns),
                            datetime.fromisoformat(e.findtext('a:published', namespaces=ns).replace('Z', '+00:00')))
                           for e in feed.findall('a:entry', ns)]
            except Exception:  # noqa: BLE001  (YouTube RSS zaman zaman 404 veriyor)
                entries = page_entries(cid)
        except Exception as e:  # noqa: BLE001
            errors.append({'channel': ch['handle'], 'error': str(e)})
            continue
        items = []
        for vid, title, published in entries:
            if published < since or vid in done:
                continue
            if is_short(vid):
                continue
            items.append({'order': order, 'channel': ch['name'], 'handle': ch['handle'], 'lang': ch['lang'],
                          'videoId': vid, 'title': title, 'published': published.isoformat()})
        out += sorted(items, key=lambda x: x['published'])
    if changed:
        CHANNELS_FILE.write_text(json.dumps(channels, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({'since': since.isoformat(), 'videos': out, 'errors': errors}, ensure_ascii=False, indent=2))


def cmd_transcript(video_id):
    key = os.environ.get('YT_TRANSCRIPT_API_KEY')
    if not key:
        sys.exit('YT_TRANSCRIPT_API_KEY tanımlı değil')
    TMP.mkdir(parents=True, exist_ok=True)
    last = None
    for q in ('', '?lang=tr', '?lang=en'):
        try:
            text = http(f'https://youtube-transcript.ai/transcript/{video_id}.txt{q}', {'Authorization': f'Bearer {key}'}).read().decode('utf-8', 'ignore')
            if len(text.strip()) > 200:
                p = TMP / f'{video_id}.txt'
                p.write_text(text, 'utf-8')
                print(f'{p} ({len(text.split())} kelime)')
                return
        except urllib.error.HTTPError as e:
            last = f'HTTP {e.code}'
    sys.exit(f'transkript alınamadı: {last or "boş"}')


def need(a, key):
    v = a.get(key)
    if not v:
        sys.exit(f'eksik alan: {key}')
    return v


def pair(a, key):
    v = need(a, key)
    if not isinstance(v, dict) or not v.get('tr') or not v.get('en'):
        sys.exit(f'{key} alanı {{"tr": ..., "en": ...}} olmalı')
    return {'tr': v['tr'], 'en': v['en']}


def cmd_add(path):
    a = json.loads(Path(path).read_text('utf-8'))
    slug = need(a, 'slug')
    if not re.fullmatch(r'[a-z0-9-]{3,80}', slug):
        sys.exit('slug yalnızca küçük harf, rakam ve tire içermeli')
    if a.get('category') not in CATEGORIES:
        sys.exit(f'kategori şunlardan biri olmalı: {sorted(CATEGORIES)}')
    publish_at = datetime.fromisoformat(need(a, 'publishAt').replace('Z', '+00:00')).astimezone(timezone.utc)
    body = pair(a, 'body')
    if 'yatırım tavsiyesi' not in body['tr'] or 'investment advice' not in body['en']:
        sys.exit('yasal uyarı cümlesi eksik')
    cover = need(a, 'cover')
    if not cover.startswith('https://'):
        sys.exit('kapak https adresi olmalı')
    meta = {
        'slug': slug, 'videoId': need(a, 'videoId'), 'channel': need(a, 'channel'), 'category': a['category'],
        'publishAt': publish_at.strftime('%Y-%m-%dT%H:%M:%SZ'), 'title': pair(a, 'title'), 'summary': pair(a, 'summary'),
        'cover': cover, 'coverAlt': pair(a, 'coverAlt'), 'onBlog': bool(a.get('onBlog')),
    }
    APP_DIR.mkdir(parents=True, exist_ok=True)
    (APP_DIR / f'{slug}.json').write_text(json.dumps({'slug': slug, 'body': body}, ensure_ascii=False) + '\n', 'utf-8')
    idx = load_index()
    arts = [x for x in idx['articles'] if x['videoId'] != meta['videoId'] and x['slug'] != slug] + [meta]
    arts.sort(key=lambda x: x['publishAt'], reverse=True)
    for old in arts[INDEX_MAX:]:
        (APP_DIR / f"{old['slug']}.json").unlink(missing_ok=True)
    idx['articles'] = arts[:INDEX_MAX]
    (APP_DIR / 'index.json').write_text(json.dumps(idx, ensure_ascii=False, indent=1) + '\n', 'utf-8')
    print(f"eklendi: {slug} · {meta['publishAt']}")


def save_image(url, dest):
    data = http(url).read()
    try:
        from io import BytesIO

        from PIL import Image

        img = Image.open(BytesIO(data)).convert('RGB')
        img.thumbnail((1376, 1376))
        img.save(dest, 'JPEG', quality=80, optimize=True, progressive=True)
    except ImportError:
        dest.write_bytes(data)


def q(s):
    return "'" + s.replace("'", "''") + "'"


def cmd_blog(slug):
    meta = next((x for x in load_index()['articles'] if x['slug'] == slug), None)
    if not meta:
        sys.exit('yazı dizinde yok')
    body = json.loads((APP_DIR / f'{slug}.json').read_text('utf-8'))['body']['tr']
    img_dir = BLOG_IMG / slug
    img_dir.mkdir(parents=True, exist_ok=True)
    save_image(meta['cover'], img_dir / 'kapak.jpg')
    n = 0

    def local(m):
        nonlocal n
        n += 1
        save_image(m.group(2), img_dir / f'{n}.jpg')
        return f'![{m.group(1)}](/blog/{slug}/{n}.jpg)'

    body = re.sub(r'!\[([^\]]*)\]\((https://[^)\s]+)\)', local, body)
    # "Kısaca" öncesi başlık yoksa ilk paragraf giriş olarak kalır; blog şablonu başlığı kendisi basar
    body = re.sub(r'^#\s+.*\n+', '', body.lstrip())
    tags = {'piyasa-notu': 'Piyasa notu', 'finans-haberleri': 'Finans haberleri', 'finans-egitimi': 'Finans eğitimi',
            'kisisel-finans': 'Kişisel finans', 'kripto': 'Kripto'}
    date = meta['publishAt'][:10]
    md = '\n'.join([
        '---',
        f"title: {q(meta['title']['tr'])}",
        f"description: {q(meta['summary']['tr'])}",
        f'date: {date}',
        f"tags: [{q(tags[meta['category']])}]",
        'cta: plus',
        f"cover: '/blog/{slug}/kapak.jpg'",
        f"coverAlt: {q(meta['coverAlt']['tr'])}",
        '---',
        '',
        f"<!-- kaynak: youtube:{meta['videoId']} -->",
        '',
        body.strip(),
        '',
    ])
    (BLOG_DIR / f'{slug}.md').write_text(md, 'utf-8')
    print(f'blog: site/src/content/blog/{slug}.md ({n + 1} görsel)')


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    cmd, rest = args[0], args[1:]
    if cmd == 'scan':
        cmd_scan(float(rest[rest.index('--hours') + 1]) if '--hours' in rest else None)
    elif cmd == 'transcript' and rest:
        cmd_transcript(rest[0])
    elif cmd == 'add' and rest:
        cmd_add(rest[0])
    elif cmd == 'blog' and rest:
        cmd_blog(rest[0])
    elif cmd == 'done':
        cmd_done()
    elif cmd == 'processed':
        print('\n'.join(sorted(processed_ids())))
    else:
        sys.exit(__doc__)
