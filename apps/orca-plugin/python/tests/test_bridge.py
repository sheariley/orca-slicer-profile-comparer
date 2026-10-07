"""Replays the shared bridge samples (packages/bridge-protocol/samples) against the handler."""

import json
import unittest
from pathlib import Path

from comparer_bridge import BridgeError, handle_message

SAMPLES = (
    Path(__file__).resolve().parents[4] / "packages" / "bridge-protocol" / "samples" / "exchanges.json"
)


class FakeHost:
    """A host seeded from the samples' `host` section, mirroring OrcaPresetHost's behavior."""

    def __init__(self, state):
        self._capabilities = state["capabilities"]
        self._newline = state["newline"]
        self._presets = state["presets"]

    def capabilities(self):
        return self._capabilities

    def newline(self):
        return self._newline

    def list_presets(self, type_name):
        return [p["ref"] for p in self._presets if type_name in (None, p["ref"]["type"])]

    def read_text(self, ref):
        for preset in self._presets:
            if preset["ref"]["id"] == ref["id"]:
                return preset["text"]
        raise BridgeError("not-found", f'No preset "{ref["name"]}".', ref["id"])

    def resolve_parent(self, child, parent_name):
        for preset in self._presets:
            ref = preset["ref"]
            if ref["type"] == child["type"] and ref["name"] == parent_name:
                return ref
        return None

    def save_text(self, ref, text, previous_text):
        raise BridgeError("unsupported", "Saving isn't supported in the plugin yet.")


class BridgeSampleTest(unittest.TestCase):
    def test_samples(self):
        samples = json.loads(SAMPLES.read_text("utf-8"))
        host = FakeHost(samples["host"])
        for exchange in samples["exchanges"]:
            with self.subTest(exchange["name"]):
                self.assertEqual(handle_message(exchange["request"], host), exchange["response"])


class BridgeErrorTest(unittest.TestCase):
    def test_rejects_other_protocol_versions(self):
        response = handle_message({"protocol": 99, "id": "1", "method": "hello"}, None)
        self.assertEqual(response["error"]["kind"], "unsupported")

    def test_maps_audit_denials_to_access_denied(self):
        class DeniedHost:
            def list_presets(self, type_name):
                raise PermissionError(13, "Plugin attempted an audited operation", "/x.json")

        response = handle_message(
            {"protocol": 1, "id": "1", "method": "listPresets", "params": {}}, DeniedHost()
        )
        self.assertEqual(response["error"]["kind"], "access-denied")
        self.assertEqual(response["error"]["subject"], "/x.json")

    def test_answers_malformed_requests(self):
        self.assertFalse(handle_message("nonsense", None)["ok"])


if __name__ == "__main__":
    unittest.main()
