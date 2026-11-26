"""Terminate inference trees, including Windows venv redirector child interpreters."""

import os
import signal
import subprocess


def terminate(child, *, runtime=None, work=None):
    if runtime is not None and (runtime / "wsl.json").is_file():
        from audioqi.generation import wsl_runtime

        wsl_runtime.terminate(runtime, work)
    if child.poll() is None:
        pid = getattr(child, "pid", None)
        if os.name == "nt" and pid:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=30,
                check=False,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        elif os.name != "nt" and pid and os.getpgid(pid) == pid:
            os.killpg(pid, signal.SIGKILL)
        else:
            child.kill()
    try:
        child.wait(timeout=30)
    except TypeError:
        child.wait()
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=5)
