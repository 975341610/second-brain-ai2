from collections.abc import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import get_settings

settings = get_settings()

class Base(DeclarativeBase):
    pass

# 增加 timeout 到 30秒 (默认5秒)，给并发操作更多等待时间
engine = create_engine(
    settings.sqlite_url, 
    connect_args={"check_same_thread": False, "timeout": 30}
)

# 开启 WAL 模式 (Write-Ahead Logging) 以大幅提升并发性能
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def with_db_retry(max_retries=3, delay=1.0):
    """Decorator to retry DB operations on OperationalError (e.g. database is locked)"""
    import functools
    import time
    import random
    from sqlalchemy.exc import OperationalError

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    if "locked" in str(e).lower():
                        last_exc = e
                        # Exponential backoff with jitter
                        wait_time = delay * (2 ** attempt) + random.uniform(0, 1)
                        time.sleep(wait_time)
                        continue
                    raise e
            raise last_exc
        return wrapper
    return decorator
