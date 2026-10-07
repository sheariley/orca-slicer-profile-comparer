"""Plugin side of the comparer's bridge protocol (see packages/bridge-protocol).

Standard library only and no `orca` imports, so it runs and is tested outside OrcaSlicer.
The host object passed to handle_message is the only thing that touches OrcaSlicer.
"""

import json

PROTOCOL_VERSION = 1


class BridgeError(Exception):
    """A failure to report to the page as a typed error (kinds match core's ComparerError)."""

    def __init__(self, kind, message, subject=None):
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.subject = subject


def handle_message(message, host):
    """Answers one bridge request. Never raises: every failure becomes an error response."""
    request_id = message.get("id") if isinstance(message, dict) else None
    try:
        if not isinstance(message, dict) or not isinstance(request_id, str):
            raise BridgeError("host-error", "Malformed bridge request.")
        if message.get("protocol") != PROTOCOL_VERSION:
            raise BridgeError(
                "unsupported", f"Unsupported bridge protocol {message.get('protocol')!r}."
            )
        handler = _HANDLERS.get(message.get("method"))
        if handler is None:
            raise BridgeError("unsupported", f"Unknown method {message.get('method')!r}.")
        result = handler(host, message.get("params") or {})
        return {"protocol": PROTOCOL_VERSION, "id": request_id, "ok": True, "result": result}
    except BridgeError as error:
        return _error(request_id, error.kind, error.message, error.subject)
    except PermissionError as error:
        # OrcaSlicer's plugin audit hook refuses file access with PermissionError.
        return _error(request_id, "access-denied", str(error), error.filename)
    except FileNotFoundError as error:
        return _error(request_id, "not-found", str(error), error.filename)
    except json.JSONDecodeError as error:
        return _error(request_id, "invalid-profile", f"Invalid JSON: {error}")
    except Exception as error:  # noqa: BLE001 - the page must always get an answer
        return _error(request_id, "host-error", str(error))


def _error(request_id, kind, message, subject=None):
    error = {"kind": kind, "message": message}
    if subject is not None:
        error["subject"] = str(subject)
    return {"protocol": PROTOCOL_VERSION, "id": request_id or "", "ok": False, "error": error}


def _hello(host, params):
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": host.capabilities(),
        "newline": host.newline(),
    }


def _list_presets(host, params):
    return {"presets": host.list_presets(params.get("type"))}


def _read_document(host, params):
    text = host.read_text(params["ref"])
    return {"content": json.loads(text), "text": text}


def _resolve_parent(host, params):
    return {"ref": host.resolve_parent(params["child"], params["parentName"])}


def _save_document(host, params):
    reload_required = host.save_text(params["ref"], params["text"], params.get("previousText"))
    return {"reloadRequired": reload_required}


_HANDLERS = {
    "hello": _hello,
    "listPresets": _list_presets,
    "readDocument": _read_document,
    "resolveParent": _resolve_parent,
    "saveDocument": _save_document,
}
