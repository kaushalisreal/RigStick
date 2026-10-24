# Desktop codecs

The Python codec modules that read and write .piv (`.piv`, `.stk`) and RigStick files. Development, PyInstaller and electron-builder all use this directory, so release builds work from a clean checkout.

The .piv format support was reverse-engineered for interoperability; RigStick is not affiliated with .piv.

Rebuild the sidecar (`npm run build:sidecar`) before packaging after changing a codec. Release uploads attach only the built installers, never this directory.
