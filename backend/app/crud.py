"""Generic create/read/update/delete routes, carried over from the original project."""
from typing import Optional, Sequence, Type

from fastapi import APIRouter, HTTPException, Query, Response, params
from psycopg import sql
from pydantic import BaseModel, create_model

from .db import fetch_all, fetch_one


def make_update_model(model: Type[BaseModel]) -> Type[BaseModel]:
    """Same as the create model, but every field is optional (for PATCH)."""
    fields = {name: (Optional[f.annotation], None) for name, f in model.model_fields.items()}
    return create_model(f"{model.__name__}Update", **fields)


def update_row(table: str, item_id: int, data: dict) -> dict:
    """UPDATE only the supplied columns. Column names come from our models, never from raw input."""
    if not data:
        raise HTTPException(400, "No fields to update.")
    query = sql.SQL("UPDATE {} SET {} WHERE id = %s RETURNING *").format(
        sql.Identifier(table),
        sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in data),
    )
    row = fetch_one(query, [*data.values(), item_id])
    if not row:
        raise HTTPException(404, f"{table} #{item_id} not found.")
    return row


def crud_router(
    table: str,
    prefix: str,
    create_model_cls: Type[BaseModel],
    dependencies: Sequence[params.Depends] = (),
) -> APIRouter:
    Update = make_update_model(create_model_cls)
    router = APIRouter(prefix=prefix, tags=[table], dependencies=list(dependencies))
    t = sql.Identifier(table)

    @router.get("")
    def list_items(limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)):
        return fetch_all(sql.SQL("SELECT * FROM {} ORDER BY id LIMIT %s OFFSET %s").format(t), (limit, offset))

    @router.post("", status_code=201)
    def create_item(body: create_model_cls):  # type: ignore[valid-type]
        data = body.model_dump()
        query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
            t,
            sql.SQL(", ").join(map(sql.Identifier, data)),
            sql.SQL(", ").join(sql.Placeholder() * len(data)),
        )
        return fetch_one(query, list(data.values()))

    @router.patch("/{item_id}")
    def update_item(item_id: int, body: Update):  # type: ignore[valid-type]
        return update_row(table, item_id, body.model_dump(exclude_unset=True))

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: int):
        row = fetch_one(sql.SQL("DELETE FROM {} WHERE id = %s RETURNING id").format(t), (item_id,))
        if not row:
            raise HTTPException(404, f"{table} #{item_id} not found.")
        return Response(status_code=204)

    return router
