---
title: Hello world, the overkill way
date: "2026-05-29"
categories:
  - windows
  - linux
  - low-level
tags:
  - syscalls
  - ntdll
  - asm
  - win32
  - peb
  - pe
excerpt: Hello world via raw syscall on Linux and NtWriteFile via indirect syscall on Windows, plus a dive into binary minimization.
---

I was watching [this video](https://www.youtube.com/watch?v=4VeYn3MgilU) where leetCipher prints Hello World using pure Windows internals, calling `NtWriteFile` directly with an SSN he resolves dynamically from the PEB. I found it interesting and wanted to do something similar, so I ended up doing it for both Linux and Windows.

## Linux first, because it's easy

Linux is boring. Not because it's simple, but because it's _clean_. The kernel has a stable syscall ABI; numbers don't change between versions and the kernel team has explicitly promised never to break userspace. You put the number in `rax`, hit `syscall`, done. `write` is `1`, `exit` is `60`.

```asm
.intel_syntax noprefix
.globl sys_write
.globl sys_exit

sys_write:
    mov     rax, 1    # SYS_write
    syscall
    ret

sys_exit:
    mov     rax, 60   # SYS_exit
    syscall
```

```c
int main(void)
{
  const char msg[]  = "Hello world!";
  long       status = sys_write(1, msg, sizeof(msg) - 1);
  sys_exit(status < 0 ? 1 : 0);
}
```

`sys_exit` has no `ret` because the kernel never returns from it.

### Making it tiny

That's the whole program. Once it worked I got curious how small I could get the binary. A `clang -Os -nostdlib` build with no special flags produces this:

```console
section                size    addr
.note.gnu.build-id       36     904
.interp                  28     940
.gnu.hash                28     968
.dynsym                 144    1000
.dynstr                 136    1144
.gnu.version             12    1280
.gnu.version_r           48    1296
.rela.dyn               192    1344
.init                    27    4096
.text                   335    4128
.fini                    13    4464
.rodata                  18    8192
.eh_frame_hdr            28    8212
.eh_frame                72    8240
.sframe                  54    8312
.note.gnu.property       32    8368
.note.ABI-tag            32    8400
.init_array               8   15888
.fini_array               8   15896
.dynamic                416   15904
.got                     40   16320
.got.plt                 24   16360
.data                    16   16384
.bss                     8    16400
.comment                 75       0
Total                  1830
```

15,896 bytes on disk. Almost all of it is overhead that has nothing to do with the program: dynamic linker metadata, C++ unwind tables, `init`/`fini` startup wrappers, `build-id` hash.

Using that map, I made a custom linker script that throws all of that away and collapses everything into a single `PT_LOAD` segment with the load address packed directly after the ELF headers:

```ini
ENTRY(main)

PHDRS
{
  text PT_LOAD FLAGS(5);
}

SECTIONS
{
  . = 0x400000 + SIZEOF_HEADERS;
  .text : { *(.text*) } :text
  /DISCARD/ : { *(.note*) *(.comment*) *(.eh_frame*) *(.gnu*) }
}
```

`FLAGS(5)` is `PF_R | PF_X`. With `-ffunction-sections -fdata-sections` on the compiler and `--strip-all --build-id=none --gc-sections` on the linker, the result is:

```console
section   size      addr
.text       83   4194424
Total       83
```

**416 bytes** on disk. I don't think you can go lower without rewriting the ELF header by hand.

## Windows

Windows is where it gets interesting. There's no stable syscall ABI. Microsoft explicitly doesn't guarantee it; SSNs change between Windows versions and between patch levels so you can't hardcode anything.

The starting point was leetCipher's approach: walk the PEB to find `ntdll`, parse its export table, read the raw stub bytes to extract the SSN. My initial version was basically a cleaned-up port of his code, still using `winternl.h`, `wcsrchr` + the Windows SDK structures. Over a few iterations I stripped all of that out.

### Walking the PEB

`GS:[0x60]` on x64 (or `FS:[0x30]` on x86) holds the PEB address, so that's one less API call needed. `Ldr->InMemoryOrderModuleList` is a doubly-linked list of every loaded module. `ntdll.dll` is always in there (alongside `kernel32.dll`); it's the first DLL the loader maps before anything else runs.

The original code used `wcsrchr` to strip the path prefix off `FullDllName` and then `wcscmp`. I switched to matching on `BaseDllName` directly (it's already just the filename, no path) and wrote a simple case-insensitive compare to avoid pulling in any string functions:

```c
#ifdef _WIN64
#define read_peb() ((PPEB)__readgsqword(0x60))
#else // x86
#define read_peb() ((PPEB)__readfsdword(0x30))
#endif // _WIN64

static PVOID get_ntdll_base(void)
{
  PPEB        peb  = read_peb();
  PPEB_LDR    ldr  = peb->Ldr;
  LIST_ENTRY *head = &ldr->InMemoryOrderModuleList;

  for (LIST_ENTRY *e = head->Flink; e != head; e = e->Flink)
  {
    PLDR_ENTRY entry = CONTAINING_RECORD(e, LDR_ENTRY, InMemoryOrderLinks);
    if (wcs_ieq(entry->BaseDllName.Buffer, L"ntdll.dll")) return entry->DllBase;
  }

  return NULL;
}
```

`CONTAINING_RECORD` recovers the full `LDR_DATA_TABLE_ENTRY` from the `InMemoryOrderLinks` pointer by subtracting the field's offset. All the structs (`PEB`, `PEB_LDR`, `LDR_ENTRY`) are defined manually, so no `winternl.h` needed.

In case you need them, here are the full struct definitions:

```c
typedef struct
{
  USHORT Length;
  USHORT MaximumLength;
  PWSTR  Buffer;
} UNICODE_STR;

typedef struct
{
  LIST_ENTRY  InLoadOrderLinks;
  LIST_ENTRY  InMemoryOrderLinks;
  LIST_ENTRY  InInitializationOrderLinks;
  PVOID       DllBase;
  PVOID       EntryPoint;
  ULONG       SizeOfImage;
  UNICODE_STR FullDllName;
  UNICODE_STR BaseDllName;
} LDR_ENTRY, *PLDR_ENTRY;

typedef struct
{
  ULONG      Length;
  BOOL       Initialized;
  PVOID      SsHandle;
  LIST_ENTRY InLoadOrderModuleList;
  LIST_ENTRY InMemoryOrderModuleList;
  LIST_ENTRY InInitializationOrderModuleList;
} PEB_LDR, *PPEB_LDR;

typedef struct
{
  BYTE     Reserved[12];
  PPEB_LDR Ldr;
} PEB, *PPEB;

typedef struct
{
  union
  {
    NTSTATUS Status;
    PVOID    Pointer;
  };
  ULONG_PTR Information;
} IO_STATUS_BLOCK;
```

### Parsing the export directory

Now we have the base address. Next problem: finding `NtWriteFile` inside it. We need to parse the PE export table. The export directory has three parallel arrays: `AddressOfNames` (function name strings), `AddressOfNameOrdinals` (index into the RVA array), and `AddressOfFunctions` (RVAs). Walk `AddressOfNames`, find `"NtWriteFile"`, use the matching ordinal to index `AddressOfFunctions`, add the base. That's the stub.

```c
for (DWORD i = 0; i < exp->NumberOfNames; i++)
{
  if (str_eq((char *)(base + names[i]), "NtWriteFile")) return base + funcs[ords[i]];
}
```

`str_eq` is just a hand-rolled `strcmp`:

```c
static int str_eq(const char *a, const char *b)
{
  while (*a && *a == *b)
  {
    a++;
    b++;
  }
  return *a == *b;
}
```

### Extracting the SSN

An unhooked x64 `Nt*` stub looks like this:

```console
4C 8B D1        mov r10, rcx    ; kernel syscall ABI: arg0 goes in r10
B8 08 00 00 00  mov eax, 0x08   ; SSN (varies per build)
0F 05           syscall
C3              ret
```

The first four bytes are always `4C 8B D1 B8` on an unhooked stub. If they're not, something has patched it. A hooked stub typically starts with `E9` (a near JMP) or `FF 25` (an indirect JMP through a pointer), redirecting execution to the EDR's trampoline before handing control back to the real stub. We can detect it but we can't read the SSN through the hook, so we bail:

```c
if (stub[0] != 0x4C || stub[1] != 0x8B || stub[2] != 0xD1 || stub[3] != 0xB8) return FALSE;
*ssn_out = *(DWORD *)(stub + 4);
```

Bytes 4–7 are the SSN. Little-endian, cast directly.

### Finding a gadget

Now we have both the SSN and the stub address. We can't just emit a `syscall` instruction in our own binary and be done with it; that's where the EDR problem starts. Instead, we scan `ntdll` for a `syscall; ret` sequence (`0F 05 C3`) and jump into it. This is the indirect syscall technique described in [f00crew's post](https://f00crew.org/0x33) and analysed more thoroughly by [klezvirus](https://klezvirus.github.io/posts/Callback-Hell/).

The reason it matters: when the kernel enters on a `syscall`, it can check the return address sitting on the stack. If that address is inside your binary rather than inside `ntdll`, it stands out. An EDR watching `NtWriteFile` calls will notice that no real userspace code has a `syscall` instruction at that address. Jumping into a gadget inside `ntdll` makes the return address look like a normal stub invocation.

The scan starts at `stub + 32` to skip past the stub body itself:

```c
BYTE *scan = stub + 32;
for (int i = 0; i < 1024; i++, scan++)
{
  if (scan[0] == 0x0F && scan[1] == 0x05 && scan[2] == 0xC3)
  {
    *gadget_out = scan;
    return TRUE;
  }
}
```

In practice it hits almost immediately; there's a gadget right after the next adjacent stub.

### The syscall stub in MASM

The actual dispatch is two instructions. `ssn_value` and `gadget_addr` are globals that `resolve_ntwritefile` fills before this gets called:

```asm
EXTERN ssn_value:DWORD
EXTERN gadget_addr:QWORD

.code

NtWriteFileStub PROC
    mov     eax, DWORD PTR [ssn_value]    ; syscall number (zero-extends to rax)
    jmp          QWORD PTR [gadget_addr]  ; -> ntdll "syscall; ret" gadget
NtWriteFileStub ENDP

END
```

`mov eax, ...` on x64 implicitly zeroes the upper 32 bits of `rax`, so the full register holds just the SSN by the time `syscall` reads it.

### Calling NtWriteFile

`NtWriteFile` takes 9 parameters. Most are optional for a console write; you can pass `NULL` for the event handle, APC routine, APC context, byte offset, and key ([docs here](https://ntdoc.m417z.com/ntwritefile)). The one you can't skip is `IoStatusBlock`: the kernel writes the result into it, so it has to be a valid address.

```c
int          main(void)
{
  const char      msg[]     = "Hello world!";
  IO_STATUS_BLOCK iosb      = {0};
  NtWriteFile_t   writefile = (NtWriteFile_t)(void *)NtWriteFileStub;
  LONG            status;

  if (!resolve_ntwritefile(&ssn_value, &gadget_addr)) return 1;

  status = writefile(
    GetStdHandle(STD_OUTPUT_HANDLE),
    NULL,
    NULL,
    NULL,
    &iosb,
    (PVOID)(ULONG_PTR)msg,
    sizeof(msg) - 1,
    NULL,
    NULL
  );

  return status < 0 ? 1 : 0;
}
```

### Shrinking the .exe

Same exercise as with the ELF, but the PE header has a hard minimum size so you can't get as aggressive. Without any size optimisations the linker produces four sections:

```console
Name     VirtualSize   RawDataSize
.text    0x23C (572)          1024
.rdata   0xB4  (180)           512
.data    0x10   (16)             0
.pdata   0x18   (24)           512
Total on disk: 3072 bytes
```

`.rdata` is read-only data (string literals, import thunks). `.pdata` is the structured exception handling table the compiler emits for every function on x64, for the Windows stack unwinder. Each section is padded to `FileAlignment` (512 bytes by default) so four sections with tiny actual content still occupy at minimum 4 × 512 = 2,048 bytes on disk, plus whatever the content rounds up to. Merging all of them into `.text` eliminates the extra section table entries and collapses four alignment boundaries into one:

```console
/nodefaultlib
/entry:main
/GS-
/merge:.rdata=.text
/merge:.pdata=.text
/merge:.xdata=.text
```

`/nodefaultlib` drops the CRT entirely, `/entry:main` skips the startup wrapper, `/GS-` removes the [stack cookie check](https://en.wikipedia.org/wiki/Buffer_overflow_protection). Result: **1,536 bytes**.

______________________________________________________________________

Code is at [MihaiStreames/hello-world-overkill](https://github.com/MihaiStreames/hello-world-overkill). References: [f00crew](https://f00crew.org/0x33), [klezvirus](https://klezvirus.github.io/posts/Callback-Hell/), [trickster0](https://trickster0.github.io/posts/Primitive-Injection/).
