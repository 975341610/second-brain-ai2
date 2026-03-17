import hashlib
import math
import re
from collections import Counter


STOPWORDS = {
    "the", "and", "for", "that", "with", "this", "from", "have", "will", "into", "your", "about", "when",
    "what", "how", "where", "which", "their", "they", "them", "because", "while", "using", "use", "used",
    "are", "is", "a", "an", "to", "of", "in", "on", "it", "as", "be", "by", "or", "if", "at",
}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def build_embedding(text: str, dimension: int = 256) -> list[float]:
    vector = [0.0] * dimension
    words = re.findall(r"[\w\-]{2,}", text.lower())
    if not words:
        return vector

    for word in words:
        digest = hashlib.sha256(word.encode("utf-8")).hexdigest()
        for index in range(0, 8):
            slot = int(digest[index * 8 : index * 8 + 8], 16) % dimension
            sign = 1 if int(digest[index * 8], 16) % 2 == 0 else -1
            vector[slot] += sign * 1.0

    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def summarize_text(text: str, max_sentences: int = 2) -> str:
    normalized = normalize_text(text)
    sentences = re.split(r"(?<=[.!?。！？])\s+", normalized)
    summary = " ".join(sentences[:max_sentences]).strip()
    return summary or normalized[:240]


def generate_tags(text: str, limit: int = 5) -> list[str]:
    words = [word for word in re.findall(r"[\w\-]{3,}", text.lower()) if word not in STOPWORDS]
    most_common = Counter(words).most_common(limit * 2)
    tags: list[str] = []
    for word, _count in most_common:
        if word not in tags:
            tags.append(word)
        if len(tags) >= limit:
            break
    return tags or ["general"]


def answer_from_context(question: str, contexts: list[dict]) -> str:
    if not contexts:
        return "I could not find a matching note yet. Try importing more documents or ask a broader question."
    bullets = []
    for context in contexts[:3]:
        bullets.append(f"- {context['title']}: {context['excerpt']}")
    return (
        f"Based on your local knowledge base, here is the best answer to '{question}':\n"
        + "\n".join(bullets)
        + "\nUse the cited notes to refine or extend the answer."
    )


def plan_tasks(goal: str, context_snippets: list[str]) -> list[str]:
    base = [
        f"Clarify the desired outcome for: {goal}",
        "Review related notes and extract constraints",
        "Break the work into one-hour execution blocks",
        "Execute the highest-impact task and record progress",
    ]
    if context_snippets:
        base.insert(1, f"Use knowledge from: {context_snippets[0][:72]}")
    return base[:4]
