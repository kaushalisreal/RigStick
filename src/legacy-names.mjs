// RigStick's earlier base name, "styk", is still inside files saved before the rename to "rigs": their
// container magic, their `_styk…` document keys and the .styk/.stykmov extensions. This module is the
// one place that recognises it, so those projects keep opening; everything is written with the new names.
export const LEGACY_EXTENSIONS = Object.freeze({styk: 'rigs', stykmov: 'rigsmov'});
export const LEGACY_MAGIC = Object.freeze({rigs: 'STYK'});
const OLD_KEY = '"_styk', NEW_KEY = '"_rigs';
/** Document JSON with every `_styk…` key renamed to `_rigs…` (unchanged text when there is none). */
export const upgradeLegacyJson = text => (text.includes(OLD_KEY) ? text.replaceAll(OLD_KEY, NEW_KEY) : text);
/** The current format for an extension or format id, mapping .styk/.stykmov to rigs/rigsmov. */
export const currentFormat = format => LEGACY_EXTENSIONS[String(format).toLowerCase()] ?? format;
