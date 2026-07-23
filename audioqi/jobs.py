from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Lock

from audioqi.config import get_settings

_SETTINGS = get_settings()
_EXECUTOR = ThreadPoolExecutor(max_workers=_SETTINGS.max_workers, thread_name_prefix="audioqi-job")
_FUTURES: dict[str, Future[None]] = {}
_LOCK = Lock()


def submit(run_id: str, fn: Callable[[], None]) -> Future[None]:
    with _LOCK:
        future = _EXECUTOR.submit(fn)
        _FUTURES[run_id] = future
    return future


def get_future(run_id: str) -> Future[None] | None:
    with _LOCK:
        return _FUTURES.get(run_id)


def reset_executor() -> dict[str, int]:
    """Cancel queued work and swap in a fresh executor.

    Running jobs may continue briefly (cannot be forcibly interrupted by futures API),
    but all queued futures are cancelled and new submissions use the new executor.
    """
    global _EXECUTOR, _FUTURES

    with _LOCK:
        old_executor = _EXECUTOR
        pending = 0
        running = 0
        done = 0
        cancelled = 0
        for future in _FUTURES.values():
            if future.done():
                done += 1
                continue
            pending += 1
            if future.cancel():
                cancelled += 1
            else:
                running += 1

        _EXECUTOR = ThreadPoolExecutor(
            max_workers=_SETTINGS.max_workers,
            thread_name_prefix="audioqi-job",
        )
        _FUTURES = {}

    old_executor.shutdown(wait=False, cancel_futures=True)
    return {
        "pending": pending,
        "running": running,
        "done": done,
        "cancelled": cancelled,
    }
