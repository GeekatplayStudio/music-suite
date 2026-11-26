"""Network and checkpoint controls loaded only inside isolated inference workers."""

import ipaddress
import json
import os
import socket
from pathlib import Path


def configure(job):
    if job.get("pid_file"):
        Path(job["pid_file"]).write_text(
            json.dumps({"pid": os.getpid(), "nonce": job.get("nonce")}), encoding="utf-8"
        )
    original_connect = socket.socket.connect

    def connect(sock, address):
        if isinstance(address, tuple):
            try:
                local = ipaddress.ip_address(address[0]).is_loopback
            except ValueError:
                local = address[0] == "localhost"
            if not local:
                raise OSError(
                    "Inference is offline. Review and download missing assets in Models & engines."
                )
        return original_connect(sock, address)

    socket.socket.connect = connect
    try:
        import huggingface_hub as hub
    except ImportError:
        return
    for method in ("hf_hub_download", "snapshot_download", "try_to_load_from_cache"):
        original = getattr(hub, method)

        def pinned(*args, _original=original, _method=method, **kwargs):
            repo = kwargs.get("repo_id") or (args[0] if args else "")
            if repo in job.get("revisions", {}):
                kwargs["revision"] = job["revisions"][repo]
            if job.get("cache"):
                kwargs["cache_dir"] = job["cache"]
            if _method != "try_to_load_from_cache":
                kwargs["local_files_only"] = True
            return _original(*args, **kwargs)

        setattr(hub, method, pinned)
