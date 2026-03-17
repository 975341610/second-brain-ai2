from __future__ import annotations

from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from backend.config import get_settings


class VectorStore:
    def __init__(self) -> None:
        settings = get_settings()
        self.client = chromadb.PersistentClient(path=settings.chroma_path, settings=ChromaSettings(anonymized_telemetry=False))
        self.collection = self.client.get_or_create_collection(name="second_brain_chunks", metadata={"hnsw:space": "cosine"})

    def upsert_chunks(self, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        self.collection.upsert(
            ids=[item["id"] for item in items],
            documents=[item["document"] for item in items],
            metadatas=[item["metadata"] for item in items],
            embeddings=[item["embedding"] for item in items],
        )

    def search(self, query_embedding: list[float], top_k: int = 5) -> list[dict[str, Any]]:
        result = self.collection.query(query_embeddings=[query_embedding], n_results=top_k)
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        items = []
        for chunk_id, document, metadata, distance in zip(ids, documents, metadatas, distances):
            items.append(
                {
                    "chunk_id": chunk_id,
                    "document": document,
                    "metadata": metadata,
                    "score": max(0.0, 1 - float(distance)),
                }
            )
        return items

    def delete_note_chunks(self, note_id: int) -> None:
        self.collection.delete(where={"note_id": note_id})


vector_store = VectorStore()
