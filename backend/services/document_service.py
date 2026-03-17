from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader


def parse_document(file_name: str, raw_bytes: bytes) -> tuple[str, str]:
    suffix = Path(file_name).suffix.lower()
    if suffix in {".txt", ".md"}:
        text = raw_bytes.decode("utf-8", errors="ignore")
        return Path(file_name).stem, text
    if suffix == ".pdf":
        temp_path = Path("/tmp") / file_name
        temp_path.write_bytes(raw_bytes)
        reader = PdfReader(str(temp_path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        temp_path.unlink(missing_ok=True)
        return Path(file_name).stem, text
    raise ValueError(f"Unsupported file type: {suffix}")


def chunk_text(text: str, chunk_size_words: int, chunk_overlap_words: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    step = max(chunk_size_words - chunk_overlap_words, 1)
    for start in range(0, len(words), step):
        window = words[start : start + chunk_size_words]
        if not window:
            continue
        chunks.append(" ".join(window))
        if start + chunk_size_words >= len(words):
            break
    return chunks
