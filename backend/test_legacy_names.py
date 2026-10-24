"""Projects saved before the internal rename to "rigs" keep opening (see legacy_names.py)."""
import json
import unittest

import legacy_names
import native_format as native

LEGACY = {'format': 'rigstick', '_styk': {'layers': {'order': ['a']}}, 'figures': [{'_stykRig': {'ik': True}, 'note': 'styk stays'}]}


def legacy_magic(data: bytes) -> bytes:
    return b'STYK' + data[4:]


class LegacyNamesTests(unittest.TestCase):
    def test_old_magic_and_keys_decode_with_current_names(self):
        for build in (lambda: native.encode(json.dumps(LEGACY).encode(), 'rigs'), lambda: native.encode_v2(LEGACY, 'rigs')):
            data = legacy_magic(build())
            document = json.loads(native.decode(data, 'rigs'))
            self.assertEqual(document['_rigs'], LEGACY['_styk'])
            self.assertEqual(document['figures'][0]['_rigsRig'], {'ik': True})
            self.assertNotIn('_styk', document)
            self.assertEqual(document['figures'][0]['note'], 'styk stays')

    def test_plain_json_projects_are_upgraded(self):
        document = json.loads(native.decode(json.dumps(LEGACY).encode(), 'rigs'))
        self.assertIn('_rigs', document)

    def test_new_files_use_the_rigs_magic(self):
        self.assertEqual(native.encode_v2({'format': 'rigstick'}, 'rigs')[:4], b'RIGS')

    def test_old_magic_only_stands_in_for_projects(self):
        with self.assertRaises(ValueError):
            native.decode(legacy_magic(native.encode(b'{}', 'rigsmov')), 'rigsmov')

    def test_formats_and_environment(self):
        self.assertEqual(legacy_names.current_format('styk'), 'rigs')
        self.assertEqual(legacy_names.current_format('stykmov'), 'rigsmov')
        environ = {'STYK_PYTHON': 'py', 'STYK_API_TOKEN': 'old', 'RIGS_API_TOKEN': 'new'}
        legacy_names.adopt_legacy_environment(environ)
        self.assertEqual(environ['RIGS_PYTHON'], 'py')
        self.assertEqual(environ['RIGS_API_TOKEN'], 'new')


if __name__ == '__main__':
    unittest.main()
