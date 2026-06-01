---
title: "Hello world, the overkill way"
date: 2026-05-29
categories: [Windows Internals, Offensive Security]
tags: [syscalls, ntdll, asm, win32, peb, pe, indirect-syscall]
excerpt: Hello world via raw syscall on Linux and NtWriteFile via indirect syscall on Windows, plus a dive into binary minimization.
---

Most programs call `write` or `printf` and stop thinking about it. This post goes in the other direction: two hello-world programs, one for Linux and one for Windows, written as close to bare metal as the binary format allows.

On Linux, that means a raw `syscall` instruction with no libc. The kernel's syscall ABI is stable and documented; the whole implementation is three instructions. On Windows, it means calling [`NtWriteFile`](https://ntdoc.m417z.com/ntwritefile) through an indirect syscall, resolving the SSN at runtime without touching the Win32 API. Both programs are then stripped to the smallest binary the respective format allows through linker flags alone.

The starting point was [this video](https://www.youtube.com/watch?v=4VeYn3MgilU) by leetCipher, which covers the Windows side. I wanted to work through it properly and add the Linux counterpart.

The Windows section assumes some passing familiarity with C and Win32 or Windows internals. I have tried to explain each concept before using it, so neither is a hard requirement; but both will make the indirect syscall and PEB sections considerably less surprising.

## Linux first, because it's easy

Linux is boring. Not because it's simple, but because it's _clean_. The kernel has a stable syscall ABI; numbers don't change between versions and the kernel team has explicitly promised never to break userspace. You put the number in `rax`, hit `syscall`, done. `write` is `1`, `exit` is `60`.

> The file uses Intel syntax (`.intel_syntax noprefix`): destination first, no `%` register prefixes, it is closer to what a disassembler outputs than the AT&T default.

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

The C side just calls them directly:

```c
int main(void) {
    const char msg[] = "Hello world!";
    long status = sys_write(1, msg, sizeof(msg) - 1);
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

15,896 bytes on disk. Almost all of it is overhead that has nothing to do with the program: dynamic linker metadata, DWARF unwind tables, `init`/`fini` startup wrappers, `build-id` hash.

> `-nostdlib` removes the CRT startup files and standard libraries from the link, but not the dynamic linker itself. Without `-static`, the output is still a dynamically-linked ELF - hence the `.interp` section (the path to `ld-linux.so`) and the entire dynamic metadata block below it.

Using that map, I made a custom linker script that throws all of that away and collapses everything into a single `PT_LOAD` segment with the load address packed directly after the ELF headers:

```ld
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

> The script gets away with no `.rodata` output section because `msg` is a local array: the compiler stack-initializes it inline and emits no `.rodata` section. A global or static string would become an orphan section, get silently dropped, and the binary would read garbage at runtime. For anything beyond this specific program the script needs a `*(.rodata*)` line inside the `:text` block.

## Windows

Windows has no stable syscall ABI. Microsoft explicitly doesn't guarantee it; syscall service numbers (SSNs) change between Windows versions and between patch levels, so nothing can be hardcoded.

The starting point was leetCipher's approach: walk the PEB to find `ntdll`, parse its export table, read the raw stub bytes to extract the SSN. My initial version was basically a cleaned-up port of his code, still using `winternl.h`, `wcsrchr` + the Windows SDK structures. Over a few iterations I stripped all of that out.

### Walking the PEB

`GS:[0x60]` on x64 (or `FS:[0x30]` on x86) holds the PEB address, so that's one less API call needed. `Ldr->InMemoryOrderModuleList` is a doubly-linked list of every loaded module. `ntdll.dll` is always in there (alongside `kernel32.dll`); it's the first DLL the loader maps before anything else runs.

The original code used `wcsrchr` to strip the path prefix off `FullDllName` and then `wcscmp`. I switched to matching on `BaseDllName` directly (it's already just the filename, no path) and wrote them by hand to avoid pulling in any string functions:

```c
static int str_eq(const char* a, const char* b) {
    while (*a && *a == *b) {
        a++;
        b++;
    }

    return *a == *b;
}

static int wcs_ieq(const WCHAR* a, const WCHAR* b) {
    while (*a && *b) {
        WCHAR ca = (*a >= L'A' && *a <= L'Z') ? *a + 32 : *a;
        WCHAR cb = (*b >= L'A' && *b <= L'Z') ? *b + 32 : *b;
        if (ca != cb) {
            return 0;
        }

        a++;
        b++;
    }

    return *a == *b;
}
```

With that in place, the PEB walk is straightforward:

```c
#ifdef _WIN64
    #define read_peb() ((PPEB)__readgsqword(0x60))
#else // x86
    #define read_peb() ((PPEB)__readfsdword(0x30))
#endif // _WIN64

static PVOID get_ntdll_base(void) {
    PPEB peb = read_peb();
    PPEB_LDR ldr = peb->Ldr;
    LIST_ENTRY* head = &ldr->InMemoryOrderModuleList;

    for (LIST_ENTRY* e = head->Flink; e != head; e = e->Flink) {
        PLDR_ENTRY entry = CONTAINING_RECORD(e, LDR_ENTRY, InMemoryOrderLinks);
        if (wcs_ieq(entry->BaseDllName.Buffer, L"ntdll.dll")) {
            return entry->DllBase;
        }
    }

    return NULL;
}
```

`CONTAINING_RECORD` recovers the full `LDR_DATA_TABLE_ENTRY` from the `InMemoryOrderLinks` pointer by subtracting the field's offset. All the structs (`PEB`, `PEB_LDR`, `LDR_ENTRY`) are defined manually, so no `winternl.h` needed.

The struct definitions, trimmed to the fields we actually touch (`Reserved` covers everything we skip in `PEB`):

```c
typedef struct {
    USHORT Length;
    USHORT MaximumLength;
    PWSTR Buffer;
} UNICODE_STR;

typedef struct {
    LIST_ENTRY InLoadOrderLinks;
    LIST_ENTRY InMemoryOrderLinks;
    LIST_ENTRY InInitializationOrderLinks;
    PVOID DllBase;
    PVOID EntryPoint;
    ULONG SizeOfImage;
    UNICODE_STR FullDllName;
    UNICODE_STR BaseDllName;
} LDR_ENTRY, *PLDR_ENTRY;

typedef struct {
    ULONG Length;
    BOOL Initialized;
    PVOID SsHandle;
    LIST_ENTRY InLoadOrderModuleList;
    LIST_ENTRY InMemoryOrderModuleList;
    LIST_ENTRY InInitializationOrderModuleList;
} PEB_LDR, *PPEB_LDR;

typedef struct {
    BYTE Reserved[12];
    PPEB_LDR Ldr;
} PEB, *PPEB;

typedef struct {
    union {
        NTSTATUS Status;
        PVOID Pointer;
    };

    ULONG_PTR Information;
} IO_STATUS_BLOCK;
```

### Parsing the export directory

Now we have the base address. Next problem: finding `NtWriteFile` inside it. We need to parse the PE export table. The export directory has three parallel arrays: `AddressOfNames` (function name strings), `AddressOfNameOrdinals` (index into the RVA array), and `AddressOfFunctions` (RVAs). Walk `AddressOfNames`, find `"NtWriteFile"`, use the matching ordinal to index `AddressOfFunctions`, add the base. That's the stub.

```c
for (DWORD i = 0; i < exp->NumberOfNames; i++) {
    if (str_eq((char*)(base + names[i]), "NtWriteFile")) {
        return base + funcs[ords[i]];
    }
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
if (stub[0] != 0x4C || stub[1] != 0x8B || stub[2] != 0xD1 || stub[3] != 0xB8) {
    return FALSE;
}

*ssn_out = *(DWORD*)(stub + 4);
```

Bytes 4–7 are the SSN. Little-endian, cast directly.

### Finding a gadget

Now we have both the SSN and the stub address. We can't just emit a `syscall` instruction in our own binary and be done with it; that's where the EDR problem starts. Instead, we scan `ntdll` for a `syscall; ret` sequence (`0F 05 C3`) and jump into it. This is the indirect syscall technique, covered in depth by [klezvirus](https://klezvirus.github.io/posts/Callback-Hell).

The reason it matters: EDR kernel drivers periodically walk thread stacks using `RtlWalkFrameChain` or `RtlCaptureStackBackTrace`, checking each return address against the list of loaded modules. A return address pointing into your binary rather than into `ntdll` is immediately suspicious - no legitimate caller emits a `syscall` instruction outside of ntdll's stub region. Jumping into a gadget inside `ntdll` makes the return address look like a normal stub invocation. The APC-based stack inspection mechanism is covered in more detail in [how kernel anti-cheats work](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work).

The scan starts at `stub + 32` to clear the current stub. The unhooked body is 11 bytes, but starting at +8 would immediately match the stub's own `0F 05 C3`. Starting at +32 lands in the gap between adjacent stubs, where the next one's `syscall; ret` is almost always sitting:

```c
BYTE* scan = stub + 32;
for (int i = 0; i < 1024; i++, scan++) {
    if (scan[0] == 0x0F && scan[1] == 0x05 && scan[2] == 0xC3) {
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

`NtWriteFile` takes 9 parameters. Most are optional for a console write; you can pass `NULL` for the event handle, APC routine, APC context, byte offset, and key (see [`NtWriteFile` on ntdoc](https://ntdoc.m417z.com/ntwritefile)). The one you can't skip is `IoStatusBlock`: the kernel writes the result into it, so it has to be a valid address.

The typedef used to call through the stub (matching the NT signature):

```c
typedef LONG (NTAPI *NtWriteFile_t)(
    HANDLE           FileHandle,
    HANDLE           Event,
    PVOID            ApcRoutine,
    PVOID            ApcContext,
    IO_STATUS_BLOCK* IoStatusBlock,
    PVOID            Buffer,
    ULONG            Length,
    PLARGE_INTEGER   ByteOffset,
    PULONG           Key
);
```

Putting it all together:

```c
int main(void) {
    const char msg[] = "Hello world!";
    IO_STATUS_BLOCK iosb = {0};
    NtWriteFile_t writefile = (NtWriteFile_t)(void*)NtWriteFileStub;
    LONG status;

    if (!resolve_ntwritefile(&ssn_value, &gadget_addr)) {
        return 1;
    }

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

_[`GetStdHandle`](https://learn.microsoft.com/en-us/windows/console/getstdhandle) is the one concession to Win32 here. The stdout handle is accessible without it via `NtCurrentPeb()->ProcessParameters->StandardOutput`, but the extra struct definitions aren't worth it for the scope of this project._

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

Code is at [MihaiStreames/hello-world-overkill](https://github.com/MihaiStreames/hello-world-overkill).

## References

1. leetCipher. "Hello World in 300 lines of code to piss off vibe coders." _YouTube_. [https://www.youtube.com/watch?v=4VeYn3MgilU](https://www.youtube.com/watch?v=4VeYn3MgilU)
1. klezvirus. "Callback hell: abusing callbacks, tail-calls, and proxy frames to obfuscate the stack." _2025_. [https://klezvirus.github.io/posts/Callback-Hell](https://klezvirus.github.io/posts/Callback-Hell)
1. f00crew. "Malware Development Essentials for Operators." _2026_. [https://f00crew.org/0x33](https://f00crew.org/0x33)
1. trickster0. "Primitive Injection - Breaking the Status Quo." _2025_. [https://trickster0.github.io/posts/Primitive-Injection](https://trickster0.github.io/posts/Primitive-Injection)
1. s4dbrd. "How Kernel Anti-Cheats Work: A Deep Dive into Modern Game Protection." _2026_. [https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work)
1. m417z. "NtWriteFile" _ntdoc_. [https://ntdoc.m417z.com/ntwritefile](https://ntdoc.m417z.com/ntwritefile)
