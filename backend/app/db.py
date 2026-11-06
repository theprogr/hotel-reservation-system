import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

pool = ConnectionPool(
    os.environ["DATABASE_URL"],
    min_size=1,
    max_size=10,
    kwargs={"row_factory": dict_row},
    open=False,
)


def fetch_all(query, params=None):
    """Run one query in its own transaction and return every row."""
    with pool.connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_one(query, params=None):
    """Run one query in its own transaction and return the first row, or None."""
    with pool.connection() as conn:
        return conn.execute(query, params).fetchone()
