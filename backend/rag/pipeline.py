from __future__ import annotations

from math import sqrt
from typing import Any

from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.db_models import Note
from backend.services.ai_client import AIClient
from backend.services.vector_store import vector_store


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    if not vec1 or not vec2:
        return 0.0
    numerator = sum(a * b for a, b in zip(vec1, vec2))
    denom = (sqrt(sum(a * a for a in vec1)) * sqrt(sum(b * b for b in vec2))) or 1.0
    return numerator / denom


def rerank_results(results: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    query_terms = {term.lower() for term in query.split() if len(term) > 2}
    for item in results:
        overlap = sum(1 for term in query_terms if term in item["document"].lower())
        item["score"] = round(item["score"] + overlap * 0.03, 4)
    return sorted(results, key=lambda item: item["score"], reverse=True)


async def search_knowledge(query: str, ai_client: AIClient, top_k: int | None = None) -> list[dict[str, Any]]:
    settings = get_settings()
    embedding = await ai_client.embed(query)
    results = vector_store.search(embedding, top_k=top_k or settings.top_k)
    return rerank_results(results, query)


def citations_from_results(db: Session, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    for item in results:
        note_id = item["metadata"].get("note_id")
        note = db.get(Note, int(note_id)) if note_id else None
        citations.append(
            {
                "note_id": int(note_id) if note_id else None,
                "title": note.title if note else item["metadata"].get("title", "Imported note"),
                "chunk_id": item["chunk_id"],
                "score": item["score"],
                "excerpt": item["document"][:260],
            }
        )
    return citations
