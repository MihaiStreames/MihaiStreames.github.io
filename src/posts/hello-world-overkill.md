---
title: Hello world, the overkill way
date: '2026-05-29'
categories:
  - windows
  - linux
  - low-level
tags:
  - syscalls
  - ntapi
  - asm
  - win32
  - peb
  - pe-parsing
excerpt: Hello world via raw syscall on Linux and NtWriteFile on Windows (except not just that).
---

I was watching [this video](https://www.youtube.com/watch?v=4VeYn3MgilU) where leetCipher prints Hello World using pure Windows internals, basically calling `NtWriteFile` directly with a SSN he resolves dynamically from the PEB. I found it interesting and wanted to do something similar, so I ended up doing it for both Linux and Windows.

Let's start with Linux since it is boring. It is boring not because it is simple but because it is clean, the kernel exposes a stable documented ABI where `syscall` numbers do not change between versions, the calling convention is System V so arguments go in `rdi`, `rsi`, `rdx` and the kernel team has explicitly promised never to break userspace. You put the number in `rax`, hit `syscall`, done. `write` is `1`, `exit` is `60`.

```asm
.intel_syntax noprefix
.globl sys_write
.globl sys_exit

sys_write:
    mov rax, 1  # SYS_write
    syscall
    ret

sys_exit:
    mov rax, 60 # SYS_exit
    syscall
```

```c
int main(void)
{
    const char msg[] = "Hello world!\n";
    long status = sys_write(1, msg, sizeof(msg) - 1);
    sys_exit(status < 0 ? 1 : 0);
}
```

No `libc`, no CRT, no dynamic linking. I also made a custom linker script that drops everything that is not `.text`, no `.note`, no `.comment`, no `.eh_frame`, no `.gnu` metadata, single `PT_LOAD` segment. Binary bottoms out at 418 bytes.

```ld
SECTIONS
{
    . = 0x400000 + SIZEOF_HEADERS;
    .text : { *(.text*) } :text
    /DISCARD/ : { *(.note*) *(.comment*) *(.eh_frame*) *(.gnu*) }
}
```

Now Windows is where it gets interesting. On Windows there is no stable `syscall` ABI, Microsoft explicitly does not guarantee it and SSNs change between Windows versions and even between patch levels so if you hardcode the number your code breaks when the user patches Windows. The normal `ntdll` stub for `NtWriteFile` on an unhooked system looks like this:

```
4C 8B D1        mov r10, rcx
B8 08 00 00 00  mov eax, 0x08 ; SSN, varies per Windows build
0F 05           syscall
C3              ret
```

To get the SSN dynamically I walk the PEB to get `ntdll` base, parse the PE export directory to find `NtWriteFile` and read the stub bytes directly. If the first 4 bytes are `4C 8B D1 B8`, the stub is unhooked and byte `4` is the SSN.

```c
static PVOID get_ntdll_base(void)
{
    PPEB          peb  = (PPEB)__readgsqword(0x60);
    PPEB_LDR_DATA ldr  = peb->Ldr;
    LIST_ENTRY   *head = &ldr->InMemoryOrderModuleList;

    for (LIST_ENTRY *e = head->Flink; e != head; e = e->Flink)
    {
        PLDR_DATA_TABLE_ENTRY entry =
            CONTAINING_RECORD(e, LDR_DATA_TABLE_ENTRY, InMemoryOrderLinks);
        WCHAR *name = wcs_rchr(entry->FullDllName.Buffer, L'\\');
        if (name && wcs_ieq(name + 1, L"ntdll.dll"))
            return entry->DllBase;
    }
    return NULL;
}
```

```c
if (stub[0] != 0x4C || stub[1] != 0x8B || stub[2] != 0xD1 || stub[3] != 0xB8)
    return FALSE;

*ssn_out = *(DWORD *)(stub + 4);
```

`gs:[0x60]` on `x64` is the PEB, from there `Ldr->InMemoryOrderModuleList` is a doubly linked list of loaded modules and `ntdll` is always in there. No `GetModuleHandle`, no imports, just reading the structure the OS maintains anyway.

Now for the actual `syscall`. Instead of calling `syscall` inline I scan forward in `ntdll` for a `syscall; ret` gadget (`0F 05 C3`) and jump into it so when the kernel returns rip lands inside `ntdll` same as if `NtWriteFile` had been called normally.

```asm
NtWriteFileStub PROC
    mov eax, DWORD PTR [ssn_value]
    jmp QWORD PTR [gadget_addr]     ; ntdll "syscall; ret"
NtWriteFileStub ENDP
```

```c
BYTE *scan = stub + 32; // adjacent stubs are ~32 bytes apart
for (int i = 0; i < 1024; i++, scan++)
{
    if (scan[0] == 0x0F && scan[1] == 0x05 && scan[2] == 0xC3)
    {
        *gadget_out = scan;
        return TRUE;
    }
}
```

`NtWriteFile` takes 9 parameters but most of them are optional for a simple console write so you can pass `NULL` for the event handle, APC routine, APC context, byte offset and key. What you cannot skip is a valid `IO_STATUS_BLOCK` on the stack.

```c
if (!resolve_ntwritefile(&ssn_value, &gadget_addr))
    return 1;

const char         msg[]     = "Hello world!\n";
MY_IO_STATUS_BLOCK iosb      = {0};
NtWriteFile_t      writefile = (NtWriteFile_t)NtWriteFileStub;

LONG status = writefile(
    GetStdHandle(STD_OUTPUT_HANDLE),
    NULL, NULL, NULL,
    &iosb,
    (PVOID)msg, sizeof(msg) - 1,
    NULL, NULL);
```

The Windows exe comes out at 1.5KB with `-nodefaultlib -entry:main -GS-` and merging `.rdata`, `.pdata` and `.xdata` into .text. The PE header has a minimum size so you cannot go lower than that.

Code is at [MihaiStreames/hello-world-overkill](https://github.com/MihaiStreames/hello-world-overkill).
