from __future__ import annotations

from typing import Any

try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
except Exception as exc:
    chromadb = None
    ChromaSettings = None
    CHROMA_IMPORT_ERROR = str(exc)
else:
    CHROMA_IMPORT_ERROR = ""

from backend.config import get_settings


class VectorStore:
    def __init__(self) -> None:
        self._client = None
        self._collection = None
        self.disabled_reason = ""

    def _ensure_collection(self):
        if self._collection is not None:
            return self._collection
        if self.disabled_reason:
            return None
        if chromadb is None or ChromaSettings is None:
            self.disabled_reason = CHROMA_IMPORT_ERROR or "chromadb import failed"
            return None
        settings = get_settings()
        try:
            self._client = chromadb.PersistentClient(path=settings.chroma_path, settings=ChromaSettings(anonymized_telemetry=False))
            self._collection = self._client.get_or_create_collection(name="second_brain_chunks", metadata={"hnsw:space": "cosine"})
        except Exception as exc:
            self.disabled_reason = str(exc)
            self._client = None
            self._collection = None
            return None
        return self._collection

    def upsert_chunks(self, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        collection = self._ensure_collection()
        if collection is None:
            return
        collection.upsert(
            ids=[item["id"] for item in items],
            documents=[item["document"] for item in items],
            metadatas=[item["metadata"] for item in items],
            embeddings=[item["embedding"] for item in items],
        )

    def search(self, query_embedding: list[float], top_k: int = 5) -> list[dict[str, Any]]:
        collection = self._ensure_collection()
        if collection is None:
            return []
        result = collection.query(query_embeddings=[query_embedding], n_results=top_k)
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
        collection = self._ensure_collection()
        if collection is None:
            return
        collection.delete(where={"note_id": note_id})


vector_store = VectorStore()
