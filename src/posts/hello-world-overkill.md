---
title: "Hello world: Writing to stdout with indirect syscalls"
date: 2026-06-16
categories: [Evasion, Syscalls]
tags: [syscalls, indirect-syscall, tartarus-gate, peb-walking, evasion, ntdll, windows-internals]
excerpt: NtWriteFile via indirect syscall on Windows (PEB walking, SSN extraction, gadget hunting).
---

Most programs call `printf` and stop thinking about it. This post does the opposite.

The goal is a hello-world program for Windows that calls [`NtWriteFile`](https://ntdoc.m417z.com/ntwritefile) directly. On any sane OS that would be straightforward: look up the syscall number, load it into the right register, hit `syscall`. Windows makes it harder. The kernel has no stable syscall ABI; service numbers (SSNs) change between versions and patch levels, so nothing can be hardcoded.

And even once you have the SSN, you can't just emit a `syscall` instruction inside your own binary, if you play competitive video games, you most likely have kernel anti-cheat drivers which use APC-based stack inspection to flag return addresses that don't belong to any loaded module, which would include yours.

Those two constraints are what the rest of the post is about: resolving the SSN at runtime and dispatching it through a gadget inside `ntdll` rather than from your own code.

The starting point was [this video](https://www.youtube.com/watch?v=4VeYn3MgilU) by leetCipher. I wanted to work through it properly, strip most of the SDK dependencies, and understand each piece well enough to explain it.

The post assumes some passing familiarity with C and Win32 or Windows internals. I have tried to explain each concept before using it, so neither is a hard requirement; but both will make the PEB walking and SSN extraction sections considerably less surprising.

## Walking the PEB

The SSN can't be hardcoded, so it has to be resolved at runtime. It lives inside `ntdll`, which means the first thing needed is `ntdll`'s base address. The obvious approach would be to call `GetModuleHandle("ntdll.dll")`, but that means using Win32, which defeats the point. We have to read it out of the process's own bookkeeping structures.

Every Windows process has a PEB ([Process Environment Block](https://learn.microsoft.com/en-us/windows/win32/api/winternl/ns-winternl-peb)) that the loader maintains. The PEB contains `Ldr->InMemoryOrderModuleList`, a doubly-linked list of every module loaded into the process. The first entry is the process executable itself; `ntdll.dll` follows in second position, since it is the first DLL the loader maps before anything else runs. The address of the PEB is in the TEB ([Thread Environment Block](https://learn.microsoft.com/en-us/windows/win32/api/winternl/ns-winternl-teb)), which is directly accessible via `GS:[0x30]` on x64 (or `FS:[0x18]` on x86).

![PEB walk chain](/images/posts/hello-world-overkill/peb_walk_chain.png)

## Parsing the export directory

With `ntdll`'s base address, the next step is locating `NtWriteFile`'s stub. The PE export directory gives a way to do this by name without any API involvement.

The export directory has three parallel arrays: `AddressOfNames` (function name strings), `AddressOfNameOrdinals` (index into the RVA array), and `AddressOfFunctions` (RVAs). Walk `AddressOfNames`, find the entry that matches `NtWriteFile`'s hash, use the matching ordinal to index `AddressOfFunctions`, add the image base. That's the stub address.

> RVAs mean [Relative Virtual Addresses](https://stackoverflow.com/questions/2170843/va-virtual-address-rva-relative-virtual-address). They represent the memory offset of an item (like a function, variable, or section) inside a loaded executable file, calculated as the distance from the file's base load address.

![Export directory arrays](/images/posts/hello-world-overkill/export_directory_arrays.png)

## Extracting the SSN

The stub address is the function pointer, but what's needed is the SSN (syscall number) embedded inside it. An unhooked x64 `Nt*` stub has a fixed layout:

```console
4C 8B D1        mov r10, rcx    ; kernel syscall ABI: arg0 goes in r10
B8 08 00 00 00  mov eax, 0x08   ; SSN (varies per build)
0F 05           syscall
C3              ret
```

If the first four bytes are `4C 8B D1 B8`, the stub is clean and the SSN is at offset 4. If they're not (typically `E9` (a near JMP) at byte 0 or byte 3), something has patched it, most likely an [EDR](https://research.meekolab.com/understanding-kernel-level-anticheats-in-online-games) redirecting execution to a trampoline. In that case the SSN can't be read directly.

The fallback is neighbor scanning (as seen in [Tartarus' Gate](https://trickster0.github.io/posts/Halo's-Gate-Evolves-to-Tartarus-Gate)): walk adjacent stubs up and down until one is unhooked, read its SSN, then infer the target's SSN via offset. Adjacent `Nt*` stubs have consecutive SSNs, and on x64 each stub is exactly 32 bytes, so if the neighbor at distance `n` has SSN `k`, the target's SSN is `k ± n`.

```c
for (WORD wIdx = 1; wIdx <= 500; wIdx++) {
    if (NeighborSSN(pbStub, wIdx, DOWN, pdwSSN) || NeighborSSN(pbStub, wIdx, UP, pdwSSN)) {
        *ppvGadget = ScanGadget(pbBase);
        return *ppvGadget != NULL;
    }
}
```

## Finding a gadget

With the SSN in hand, the obvious next move is to load it into `eax` and hit `syscall`. The problem is where that instruction lives.

A `syscall` emitted inside your own binary means the kernel will eventually return to an address inside your binary. Now back to the video games topic; kernel anti-cheat drivers (such as BattlEye's `BEDaisy.sys`) use Windows [Asynchronous Procedure Calls](https://learn.microsoft.com/en-us/windows/win32/sync/asynchronous-procedure-calls) (APCs) to periodically inspect running threads in the protected process. An APC fires in the target thread's context, calls [`RtlWalkFrameChain`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddk/nf-ntddk-rtlwalkframechain) to capture the return address chain on the stack, and checks each address against the loaded module list. A return address that doesn't fall within any module's `[base, base + size)` range is flagged as suspicious. Your binary almost certainly isn't in that list.

![Gadget dispatch stack](/images/posts/hello-world-overkill/gadget_dispatch_stack.png)

The solution is a _gadget_: a `syscall; ret` sequence (`0F 05 C3`) that already exists inside a legitimate, loaded DLL. Jump into it instead of emitting the instruction yourself, and the return address the kernel sees belongs to that DLL. In this case, `ntdll`, which is always loaded and always passes the membership check.

```c
PIMAGE_DOS_HEADER     pDos = (PIMAGE_DOS_HEADER)pbBase;
PIMAGE_NT_HEADERS     pNt  = (PIMAGE_NT_HEADERS)(pbBase + pDos->e_lfanew);
PIMAGE_SECTION_HEADER pSec = IMAGE_FIRST_SECTION(pNt);

for (WORD wIdx = 0; wIdx < pNt->FileHeader.NumberOfSections; wIdx++, pSec++) {
    if (*(DWORD*)(pSec->Name + 1) != 'txet') {
        continue;
    }

    BYTE* pbStart = pbBase + pSec->VirtualAddress;
    BYTE* pbEnd   = pbStart + pSec->Misc.VirtualSize - 2;
    for (BYTE* pb = pbStart; pb < pbEnd; pb++) {
        if (pb[0] == 0x0F && pb[1] == 0x05 && pb[2] == 0xC3) {
            return pb;
        }
    }
}

return NULL;
```

> One caveat: the module list APCs consult is typically derived from `Ldr->InMemoryOrderModuleList`, which kernel-mode cheats can patch directly. That's not a concern here, but it's why production anti-cheat designs don't rely on the PEB list exclusively. The full mechanics of the technique are covered by [klezvirus](https://klezvirus.github.io/posts/Callback-Hell); the APC stack inspection mechanism is documented in more detail in [how kernel anti-cheats work](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work).

## The syscall stub in MASM

SSN and gadget address are both known. The dispatch itself is three instructions. The `mov r10, rcx` is mandatory: the Windows x64 syscall ABI requires the first argument in `r10` when entering the kernel, not `rcx` as per the normal Win64 calling convention.

```asm
EXTERN dwSSN:DWORD
EXTERN pvGadget:QWORD

.code
    NtWriteFileStub PROC
        mov     r10, rcx
        mov     eax, DWORD PTR [dwSSN]
        jmp          QWORD PTR [pvGadget]
    NtWriteFileStub ENDP
end
```

_`mov eax, ...` on x64 implicitly zeroes the upper 32 bits of `rax`, so the full register holds just the SSN by the time `syscall` reads it._

## Calling NtWriteFile

With the stub wired up, calling `NtWriteFile` is mostly parameter plumbing.

`NtWriteFile` takes 9 parameters. Most are optional for a console write; you can pass `NULL` for the event handle, APC routine, APC context, byte offset, and key (see [`NtWriteFile` on ntdoc](https://ntdoc.m417z.com/ntwritefile)). The one you can't skip is `IoStatusBlock`: the kernel writes the result into it, so it has to be a valid address.

```c
DWORD dwSSN    = 0;
PVOID pvGadget = NULL;

int main(void) {
    const char      szMsg[]       = "Hello world!\\n";
    IO_STATUS_BLOCK ioStatusBlock = {0};
    NtWriteFile_t   pfnWriteFile  = (NtWriteFile_t)(void*)NtWriteFileStub;
    NTSTATUS        lStatus;

    if (!ResolveNtWriteFile(GetNtdllBase(), &dwSSN, &pvGadget)) {
        return 1;
    }

    lStatus = pfnWriteFile(
        GetStdoutHandle(),
        NULL,
        NULL,
        NULL,
        &ioStatusBlock,
        (PVOID)(ULONG_PTR)szMsg,
        sizeof(szMsg) - 1,
        NULL,
        NULL
    );

    return lStatus < 0 ? 1 : 0;
}
```

## Shrinking the .exe

The program works. The next challenge I set myself was to get the binary as small as possible.

On Linux you can strip an ELF down to almost nothing. PE files have a harder floor. `FileAlignment` means every section costs at least 512 bytes on disk regardless of how little it holds. Without any size work, the linker produces four of them:

```console
Name     VirtualSize   RawDataSize
.text    0x23C (572)          1024
.rdata   0xB4  (180)           512
.data    0x10   (16)             0
.pdata   0x18   (24)           512
Total on disk: 3072 bytes
```

`.rdata` is read-only data (string literals, import thunks). `.pdata` is the structured exception handling table the compiler emits for every function on x64, for the Windows stack unwinder. Four sections with barely anything in them still occupy 4 × 512 = 2,048 bytes on disk minimum. The actual code is a rounding error by comparison.

MSVC doesn't give you a clean way out of this. The unwind tables are enforced, and the linker leaves enough [COFF overhead](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format) that the floor stays high. Switching to `clang-cl` and `lld-link` opens up flags that actually do the job:

```powershell
$CFlags = @("/Os", "/GS-", "/Gy", "/Gw", "/EHa-", "/clang:-fno-asynchronous-unwind-tables")
```

`/Os` optimizes for size over speed. `/GS-` removes the [stack cookie check](https://en.wikipedia.org/wiki/Buffer_overflow_protection). `/EHa-` disables exception handling, which otherwise forces the compiler to emit cleanup tables. `/Gy` and `/Gw` emit each function and global into its own [COMDAT section](https://stackoverflow.com/questions/1834597/what-is-the-comdat-section-used-for) so the linker can discard unused ones. `-fno-asynchronous-unwind-tables` reduces how much `.pdata` `lld` synthesizes from CFI at link time -- though it can't eliminate it entirely, because `lld` regenerates unwind entries from CFI regardless of what the `.obj` files contain.

The linker flags finish the job:

```powershell
$LdFlags = @(
    "/subsystem:console"
    "/nodefaultlib"
    "/entry:main"
    "/merge:.rdata=.text"
    "/merge:.pdata=.text"
    "/out:$Target"
    ...
)
```

`/nodefaultlib` drops the CRT entirely. `/entry:main` skips the CRT startup wrapper. The two `/merge` flags collapse `.rdata` and `.pdata` into `.text`, taking care of three alignment boundaries. That last merge is the only way `.pdata` actually disappears from the PE; no compiler flags reaches it once `lld` has rebuilt it at link time.

Result: **1,536 bytes**.

## Conclusion

The chain looks like this in hindsight: no stable ABI forces runtime SSN resolution, which requires finding `ntdll` without Win32, which means the PEB. The SSN is in the stub bytes (assuming no EDR has patched them, and if one has, neighbor scanning recovers it). Then the APC stack inspection problem forces the gadget approach (only if kernel anti-cheats are running), which means scanning `ntdll`'s `.text` section rather than emitting `syscall` locally.

Code is at [MihaiStreames/hello-world-overkill](https://github.com/MihaiStreames/hello-world-overkill).

## References

1. leetCipher. "Hello World in 300 lines of code to piss off vibe coders." _YouTube_. [https://www.youtube.com/watch?v=4VeYn3MgilU](https://www.youtube.com/watch?v=4VeYn3MgilU)
1. klezvirus. "Callback hell: abusing callbacks, tail-calls, and proxy frames to obfuscate the stack." _2025_. [https://klezvirus.github.io/posts/Callback-Hell](https://klezvirus.github.io/posts/Callback-Hell)
1. trickster0. "Halo's Gate Evolves to Tartarus Gate." _2025_. [https://trickster0.github.io/posts/Halo's-Gate-Evolves-to-Tartarus-Gate/](https://trickster0.github.io/posts/Halo's-Gate-Evolves-to-Tartarus-Gate)
1. s4dbrd. "How Kernel Anti-Cheats Work: A Deep Dive into Modern Game Protection." _2026_. [https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work)
1. m417z. "NtWriteFile." _ntdoc_. [https://ntdoc.m417z.com/ntwritefile](https://ntdoc.m417z.com/ntwritefile)
