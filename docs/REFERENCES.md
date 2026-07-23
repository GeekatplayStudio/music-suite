# Geekatplay Studio Music Suite References

**Created by Vladimir Chopine · Geekatplay Studio**

## Core Analysis / DSP

- NumPy: https://numpy.org/doc/
- SciPy Signal: https://docs.scipy.org/doc/scipy/reference/signal.html
- librosa: https://librosa.org/doc/latest/index.html
- pyloudnorm (BS.1770): https://pypi.org/project/pyloudnorm/
- PyTorch: https://pytorch.org/docs/stable/index.html
- torchaudio: https://pytorch.org/audio/stable/index.html
- nnAudio: https://kinwaicheuk.github.io/nnAudio/

## Loudness / Standards

- ITU-R BS.1770 (program loudness and true peak): https://www.itu.int/rec/R-REC-BS.1770
- EBU Tech 3342 (Loudness Range): https://tech.ebu.ch/publications/tech3342
- EBU Tech 3341 (Metering mode): https://tech.ebu.ch/publications/tech3341
- libebur128: https://github.com/jiixyj/libebur128
- pyebur128: https://pypi.org/project/pyebur128/

## Audio I/O / Metadata

- FFmpeg: https://ffmpeg.org/
- FFmpeg filters: https://ffmpeg.org/ffmpeg-filters.html
- FFprobe docs: https://ffmpeg.org/ffprobe.html
- python-soundfile: https://python-soundfile.readthedocs.io/
- mutagen: https://mutagen.readthedocs.io/

## Optional Pro Backends

- pedalboard: https://spotify.github.io/pedalboard/
- matchering: https://github.com/sergree/matchering
- Matchering docs: https://sergree.github.io/matchering/

## Web / App Framework

- FastAPI: https://fastapi.tiangolo.com/
- Next.js: https://nextjs.org/docs
- Tailwind CSS: https://tailwindcss.com/docs
- shadcn/ui: https://ui.shadcn.com/
- TanStack Table: https://tanstack.com/table/latest
- Plotly Python: https://plotly.com/python/
- Plotly.js: https://plotly.com/javascript/

## Persistence and Reporting

- SQLAlchemy: https://docs.sqlalchemy.org/
- SQLite: https://sqlite.org/docs.html
- Jinja2: https://jinja.palletsprojects.com/
- WeasyPrint: https://doc.courtbouillon.org/weasyprint/stable/

## Testing and Tooling

- pytest: https://docs.pytest.org/
- Ruff: https://docs.astral.sh/ruff/
- mypy: https://mypy.readthedocs.io/
- TypeScript: https://www.typescriptlang.org/docs/

## Notes

- AudioQI is local-first and offline by design.
- Optional backends are capability-gated at runtime and gracefully fall back to internal mastering.
- For reproducibility, use the `internal` backend and fixed settings.
