from fastapi.testclient import TestClient
import os
import pytest
from pathlib import Path
from backend.main import app
from backend.config import get_settings

client = TestClient(app)
settings = get_settings()

@pytest.fixture
def setup_bgm_dir():
    bgm_path = Path(settings.data_root) / "bgm"
    bgm_path.mkdir(parents=True, exist_ok=True)
    # Create a dummy mp3 file
    test_file = bgm_path / "test_track.mp3"
    test_file.write_bytes(b"dummy audio content")
    yield test_file
    # Cleanup
    if test_file.exists():
        test_file.unlink()

def test_list_bgm(setup_bgm_dir):
    response = client.get("/api/bgm/list")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert "test_track.mp3" in data

def test_stream_bgm(setup_bgm_dir):
    response = client.get("/api/bgm/stream/test_track.mp3")
    assert response.status_code == 200
    assert response.content == b"dummy audio content"

def test_stream_bgm_not_found():
    response = client.get("/api/bgm/stream/non_existent.mp3")
    assert response.status_code == 404
