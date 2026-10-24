"""RigStick's earlier base name, "styk", is still inside files saved before the rename to "rigs".

This module is the one place that recognises it, so those projects keep opening: the old container
magic, the `_styk...` document keys, the .styk/.stykmov extensions and STYK_* environment variables.
Everything is written with the new names.
"""
import os

LEGACY_EXTENSIONS = {'styk': 'rigs', 'stykmov': 'rigsmov'}
LEGACY_MAGIC = {'rigs': b'STYK'}
_OLD_KEY, _NEW_KEY = b'"_styk', b'"_rigs'


def upgrade_legacy_json(payload: bytes) -> bytes:
    """Document JSON with every `_styk...` key renamed to `_rigs...`."""
    return payload.replace(_OLD_KEY, _NEW_KEY) if _OLD_KEY in payload else payload


def current_format(kind: str) -> str:
    return LEGACY_EXTENSIONS.get(kind, kind)


def adopt_legacy_environment(environ=os.environ) -> None:
    """Honour STYK_* variables people may still set, as their RIGS_* names."""
    for name, value in list(environ.items()):
        if name.startswith('STYK_') and 'RIGS_' + name[5:] not in environ:
            environ['RIGS_' + name[5:]] = value
