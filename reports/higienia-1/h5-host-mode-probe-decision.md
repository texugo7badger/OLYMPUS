# H5 decision — #89: the host-mode probe, DESCOPEd to the declared boundary (the conservative default, overridable by the user)

> The #89 ask: fixtures that drive the COMPILED dist tools standalone — today every suite
> shims the opencode host boundary at SOURCE level because the plugin SDK only resolves
> inside the opencode host. The plan already descoped this to "minimal dist tools + the
> decision doc" with the user's overrule right standing. This is that decision doc.

## What the host-mode probe wanted (the honest restatement)

Confidence that the COMPILED artifacts (the dist plugins, the packaged overlay) behave as
their sources do — a standalone harness that loads the dist builds the way the real
opencode host would.

## What already covers the classes (the composed answer, all landed + proven live)

1. **The deterministic source suites** (30, the battery contract pinned at #94) cover the
   logic classes at the source level — the honest boundary, declared.
2. **The LIVE-path proofs** (the campaign's own method) exercise the real product
   end-to-end: the B7 walk ran the REAL dispatcher + REAL lanes (the compiled overlay's
   own machinery — the plugin hooks firing inside the real opencode host), the trigger
   served :3011 from the real manager, the Callimachus proof (#92) just rode the real
   dispatch spine. The host-mode class the probe targeted — "does it work when the host
   loads it" — is answered by the live proofs MORE honestly than a dist-harness shim
   ever could: they run in the real host.
3. **The doctor** verifies the dist artifacts' presence + versions at doctor time.

## The descoped remainder (named, never hidden)

The full standalone-dist harness — a compiled-plugin host shim + the fixtures' SDK
resolution against the dist builds — is a DESIGN NIGHT of its own (the plugin SDK's
host-only resolution boundary is upstream behavior, not OLYMPUS code; the shim is real
architecture). It stays the future arc, filed here as the honest boundary. The user may
overrule and schedule it; nothing hides.

## The verdict

#89 closes with the boundary DECLARED: the source suites + the live proofs + the doctor
are the coverage stack; the standalone-dist harness is the named future arc. The minimal
dist tooling (the doctor's checks) is the shipped piece.
