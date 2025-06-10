---
layout: post
title: How I Reversed World of Tanks Blitz's Custom DVPL Format
date: 2025-06-06 12:00:00 +0200
categories:
  - reverse-engineering
  - file-formats
tags:
  - world-of-tanks-blitz
  - binary-analysis
  - compression
  - lz4
  - hexdump
excerpt: How I discovered and decoded the DVPL file format used by World of Tanks Blitz, from initial string discovery to building a complete converter tool.
---
## The Discovery

I was trying to learn SQL for a Database course exam for Uni and I decided to do that by making a tank database, since I play a lot of [World of Tanks Blitz](https://wargaming.net/en/games/wotb) as a way to chill out.

I spent a few hours MANUALLY adding data, and I quickly ran out of it, since the [Wiki](https://wot-blitz.fandom.com) only has partial data. I looked on other sites, reversed [protobuf](https://protobuf.dev/overview/) files, looked on the [Main Wiki](https://wiki.wargaming.net/en/WoT_Blitz)... Nothing helpful. I decided to check the game files, where I stumbled across `.dvpl` files. These weren't standard formats I recognized, so naturally, I had to figure out what they were.

My first instinct was to dump strings from the files to see if there were any readable clues:

```bash
strings list.xml.dvpl | head -20
```

```
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

Most of it was gibberish, but I could make out fragments of XML data (it's in the file name, duh) mixed with compressed binary data. The presence of readable strings suggested the files contained processed data.

## Binary Analysis: Finding the Magic

When dealing with unknown binary formats, I always start with a hex dump to look for patterns:

```bash
hexdump -C list.xml.dvpl | tail -10
```

This revealed something interesting at the end of the file:

```
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

There it was - the ASCII string "DVPL" at the very end of the file! This looked like a magic number, which often indicates a footer or header structure in custom file formats.

## Analyzing the Footer Structure

With the magic number found, I needed to understand what came before it.

```bash
# Get the last 32 bytes to see the footer structure
tail -c 32 list.xml.dvpl | hexdump -C
```

```
00000000  06 9e 02 80 3c 2f 72 6f  6f 74 3e 0a 84 86 00 00  |....</root>.....|
00000010  10 0f 00 00 ac 01 2a 9f  02 00 00 00 44 56 50 4c  |......*.....DVPL|
00000020
```

The DVPL magic is exactly 4 bytes, and there are 16 bytes before it. This suggests a 20-byte footer structure. Looking at the pattern, it appears to be several 4-byte (32-bit) integers followed by the magic number.

## Reverse Engineering the Structure

To understand what these integers represent, I compared several DVPL files to look for patterns. This is where things got interesting:

```bash
tail -c 32 customization.xml.dvpl | hexdump -C
```

```
00000000  0e 15 00 80 3c 2f 72 6f  6f 74 3e 0a 23 16 00 00  |....</root>.#...|
00000010  54 03 00 00 6e 18 a0 f9  02 00 00 00 44 56 50 4c  |T...n.......DVPL|
00000020
```

```bash
tail -c 32 Ch01_Type59.xml.dvpl | hexdump -C
```

```
00000000  03 8d 00 80 3c 2f 72 6f  6f 74 3e 0a 2f 2a 00 00  |....</root>./*..|
00000010  0f 0f 00 00 e8 c7 c4 31  02 00 00 00 44 56 50 4c  |.......1....DVPL|
00000020
```

```bash
tail -c 32 guns.xml.dvpl | hexdump -C
```

```
00000000  72 b0 00 80 3c 2f 72 6f  6f 74 3e 0a ae e4 01 00  |r...</root>.....|
00000010  90 27 00 00 a2 3d d5 7b  02 00 00 00 44 56 50 4c  |.'...=.{....DVPL|
00000020
```

Looking at these hex dumps, I noticed a consistent pattern:

- 16 bytes of what looks like structured data
- 4 bytes that spell "DVPL"
- The 4 bytes immediately before "DVPL" are always `02 00 00 00` across all files

This suggested the footer contains four 32-bit little-endian integers followed by the magic number. The consistent `02 00 00 00` (which is 2 in little-endian) looked like it could be a compression type field.

## Decoding the Structure

Based on this pattern, I hypothesized the footer structure as four integers. Now I needed to figure out what each one represented:

```python
import struct

footer_bytes = bytes.fromhex("84860000100f0000ac012a9f02000000")
val1, val2, val3, val4 = struct.unpack('<IIII', footer_bytes)

print(f"Value 1: {val1}")
print(f"Value 2: {val2}")
print(f"Value 3: {val3}")
print(f"Value 4: {val4}")
```

```
Value 1: 34436
Value 2: 3856
Value 3: 2670330284
Value 4: 2
```

The fourth value being consistently 2 across all files strongly suggested a compression type. For the other values, I made guesses based on common file format patterns:

**Typical compressed file formats often store:**
- Original (uncompressed) size
- Compressed size
- Checksum for integrity
- Compression method/flags

Let me test this hypothesis by checking if the file sizes make sense:

```bash
ls -l list.xml.dvpl
```

```
-rwxr-xr-x 1 user user 3876 Jun  4 17:25 list.xml.dvpl*
```

The second value (3856) exactly matches the payload size (minus the 20-byte footer), confirming it's the compressed size.

To verify the first value is the original size, I needed to decompress the data. The compression type of 2 suggested it might be LZ4 (a common game compression format):

```python
import lz4.block

with open('list.xml.dvpl', 'rb') as f:
    payload = f.read(3856)  # Read just the compressed data
    
try:
    decompressed = lz4.block.decompress(payload, uncompressed_size=34436)
    print(f"Decompressed size: {len(decompressed)}")
    print(decompressed[:100].decode('utf-8'))
except Exception as e:
    print(f"LZ4 failed: {e}")
```

This worked perfectly! The decompressed data was exactly 34436 bytes and started with proper XML:

```xml
Decompressed size: 34436
<root>
	<Ch01_Type59>
		<id>0</id>
		<userString>#china_vehicles:Ch01_Type59</userString>
		<descrip
```

For the third value (2670330284), I suspected it was a CRC32 checksum of the compressed data:

```python
import zlib

calculated_crc = zlib.crc32(payload) & 0xffffffff  # Ensure unsigned 32-bit
print(f"Calculated CRC32: {calculated_crc}")
print(f"Footer CRC32: {val3}")
print(f"Match: {calculated_crc == val3}")
```

```
Calculated CRC32: 2670330284
Footer CRC32: 2670330284
Match: True
```

Perfect match! So the complete structure is:

```python
# DVPL footer format: <IIII4s
original_size, compressed_size, crc32_checksum, compression_type, magic = struct.unpack('<IIII4s', footer_data)
```

Or in **simpler** terms:
- The `<IIII4s` format string tells Python how to interpret the binary data:
	- `<`       = little-endian byte order (least significant byte first)
	- `I`       = unsigned 32-bit integer (4 bytes each)
	- `IIII` = four consecutive 32-bit integers
	- `4s`     = exactly 4 bytes as a string (our "DVPL" magic)
- So `<IIII4s` reads: "four little-endian integers followed by a 4-byte string"

## The Complete DVPL Format

After this systematic analysis, I determined the DVPL format structure:

```
[Compressed Payload Data]
[Footer - 20 bytes:]
  - Original Size    (4 bytes, little-endian uint32)
  - Compressed Size  (4 bytes, little-endian uint32)
  - CRC32 Checksum   (4 bytes, little-endian uint32)
  - Compression Type (4 bytes, little-endian uint32)
    - 0: No compression
    - 1: LZ4 compression
    - 2: LZ4 High Compression
  - Magic Number (4 bytes, ASCII "DVPL")
```

## The Code

You can find the complete DVPL converter implementation [here](https://github.com/MihaiStreames/WOTDB/blob/main/src/data/dvpl_converter.py) (when I make it public).