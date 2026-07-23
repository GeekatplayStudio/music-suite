from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from audioqi.config import ensure_data_dirs, get_settings


class Base(DeclarativeBase):
    pass


SETTINGS = get_settings()
ensure_data_dirs(SETTINGS)

ENGINE = create_engine(f"sqlite:///{SETTINGS.db_path}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=ENGINE, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    from audioqi import models  # noqa: F401

    Base.metadata.create_all(bind=ENGINE)
