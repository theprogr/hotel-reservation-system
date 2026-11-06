import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Works locally and on serverless hosting, where the app can be frozen between requests
# and the hosted database can go to sleep:
# - connections open only when needed (min_size=0) and are tested before use (check)
# - prepare_threshold=None keeps it compatible with the host's connection pooler
pool = ConnectionPool(
    os.environ["DATABASE_URL"],
    min_size=0,
    max_size=int(os.getenv("DB_POOL_MAX", "10")),
    max_idle=60,
    check=ConnectionPool.check_connection,
    kwargs={"row_factory": dict_row, "prepare_threshold": None},
    open=True,
)


def fetch_all(query, params=None):
    """Run one query in its own transaction and return every row."""
    with pool.connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_one(query, params=None):
    """Run one query in its own transaction and return the first row, or None."""
    with pool.connection() as conn:
        return conn.execute(query, params).fetchone()
