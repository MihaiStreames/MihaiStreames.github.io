---
title: "How I reversed World of Tanks Blitz's custom DVPL format"
date: 2025-06-06
categories: [reverse-engineering]
tags: [file-formats, compression, lz4, python, wotb]
excerpt: I needed tank data for a SQL assignment. Game files had it, locked behind an unknown format. This is how I got it out.
---

I was trying to learn SQL for a Database course at uni and figured the most painless way was to build something I actually cared about, so I went with a tank database for [World of Tanks Blitz](https://wargaming.net/en/games/wotb). After a few hours of manually copying data and burning out, I realized I needed to scrape from somewhere. The [Wiki](https://wot-blitz.fandom.com) only has partial data, the [Main Wiki](https://wiki.wargaming.net/en/WoT_Blitz) is worse, I tried reversing some [protobuf](https://protobuf.dev/overview/) files looking for a clean dump, nothing useful. Eventually I started poking at the actual game install directory and ran into a pile of `.dvpl` files. Not a format I recognized.

First instinct was just `strings list.xml.dvpl | head -20`:

```console
<root>
 <Ch01_Type59>
  <id>0</id
userString>#china_vehicles:8
'</(
description8
(<//
price>7500<gold/
QsellP
9375$
notInShop>true</
enrichmentPermanentCost
tags>mediumTank enhancedTorsions3t_
pCaliber*
bRammer
wetCombatPack_class1
aimingStabilizer_Mk
collectible</
level>8</
1Rol
```

Mostly noise but I could see fragments of XML in there, which made sense given the filename `list.xml.dvpl`. The garbled bytes between XML fragments smelled like compressed binary, so the file was probably wrapping compressed XML in some custom container. Time for `hexdump -C list.xml.dvpl | tail -10`:

```console
00000ea0  11 36 af 0e 07 a8 7b 1f  35 f5 2f 14 06 3a 00 0f  |.6....{.5./..:..|
00000eb0  07 08 21 05 3d 00 0f 03  08 28 06 44 00 0f 5f 13  |..!.=....(.D.._.|
00000ec0  fe 0f 70 05 9c 09 86 02  00 96 02 00 80 05 35 54  |..p...........5T|
00000ed0  5f 37 51 70 0f 79 56 15  05 39 00 0f 94 02 21 04  |_7Qp.yV..9....!.|
00000ee0  3c 00 0f 93 02 28 05 43  00 0f 91 0a bc 10 20 90  |<....(.C...... .|
00000ef0  52 08 28 7c 02 77 2d 9f  20 6e 6f 52 61 74 69 6e  |R.(|.w-. noRatin|
00000f00  67 b1 0a db 06 9e 02 80  3c 2f 72 6f 6f 74 3e 0a  |g.......</root>.|
00000f10  84 86 00 00 10 0f 00 00  ac 01 2a 9f 02 00 00 00  |..........*.....|
00000f20  44 56 50 4c                                       |DVPL|
00000f24
```

`DVPL` at the very end. Magic number as a footer instead of a header, which is unusual but not unheard of. `</root>\n` shows up right before the metadata block, so the layout is clearly `[compressed XML][footer][DVPL]`. `tail -c 32` to see just the footer:

```bash
tail -c 32 list.xml.dvpl | hexdump -C
```

```console
00000000  06 9e 02 80 3c 2f 72 6f  6f 74 3e 0a 84 86 00 00  |....</root>.....|
00000010  10 0f 00 00 ac 01 2a 9f  02 00 00 00 44 56 50 4c  |......*.....DVPL|
00000020
```

16 bytes of metadata then the 4-byte magic. Those 16 bytes line up cleanly as four 32-bit values, especially since the last 4 bytes before `DVPL` are `02 00 00 00`. I checked a couple other `.dvpl` files to see if that `02 00 00 00` was consistent:

```console
# customization.xml.dvpl
00000010  54 03 00 00 6e 18 a0 f9  02 00 00 00 44 56 50 4c  |T...n.......DVPL|

# guns.xml.dvpl
00000010  90 27 00 00 a2 3d d5 7b  02 00 00 00 44 56 50 4c  |.'...=.{....DVPL|

# Ch01_Type59.xml.dvpl
00000010  0f 0f 00 00 e8 c7 c4 31  02 00 00 00 44 56 50 4c  |.......1....DVPL|
```

Every file ends with `02 00 00 00 DVPL`, so that field is almost certainly a compression type flag (or at least a constant the format always sets to `2` for whatever reason). The other three values vary per file, which is what you'd expect from sizes and checksums. Time to parse:

```python
import struct

footer_bytes = bytes.fromhex("84860000100f0000ac012a9f02000000")
val1, val2, val3, val4 = struct.unpack('<IIII', footer_bytes)
# Value 1: 34436
# Value 2: 3856
# Value 3: 2670330284
# Value 4: 2
```

Most compressed containers store the same four things, original size, compressed size, a checksum, and a method flag. `ls -l list.xml.dvpl` gives 3,876 bytes total, minus the 20-byte footer that's 3,856, which is exactly `val2`. So `val2` is compressed size, `val1` is almost certainly original size, and `val3` is too big and too random-looking to be anything but a CRC32.

About `val4`: LZ4 is common in game files and the value was `2`, so I tried LZ4. It worked. I then guessed that `1` was regular LZ4 and `2` was LZ4 High Compression (LZ4HC) because that maps to the order LZ4 exposes those modes, but I never actually verified this against a `.dvpl` file with a `1` flag. Could be the other way around, could be something else entirely. `lz4.block.decompress` handles both transparently so I never had to find out.

```python
import lz4.block

with open('list.xml.dvpl', 'rb') as f:
    payload = f.read(3856)

decompressed = lz4.block.decompress(payload, uncompressed_size=34436)
print(decompressed[:100].decode('utf-8'))
```

```console
<root>
 <Ch01_Type59>
  <id>0</id>
  <userString>#china_vehicles:Ch01_Type59</userString>
  <descrip
```

Decompressed size came out to exactly 34,436 which confirmed `val1` as original size. Last piece was the CRC check:

```python
import zlib
calculated_crc = zlib.crc32(payload) & 0xffffffff
# Calculated: 2670330284
# Footer:     2670330284
```

Bingo. Full footer format:

```console
[Compressed Payload Data]
[Footer - 20 bytes:]
  - Original Size    (4 bytes, little-endian uint32)
  - Compressed Size  (4 bytes, little-endian uint32)
  - CRC32 Checksum   (4 bytes, little-endian uint32)
  - Compression Type (4 bytes, little-endian uint32)
    - 0: No compression
    - 1: LZ4 (probably regular)
    - 2: LZ4 (probably HC, this is the only value I've actually seen in the wild)
  - Magic Number (4 bytes, ASCII "DVPL")
```

`<IIII4s` in Python's struct syntax. Four little-endian uint32s then a 4-byte string.
