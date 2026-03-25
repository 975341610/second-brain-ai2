import os
import shutil
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend.config import get_settings

client = TestClient(app)
settings = get_settings()

@pytest.fixture
def mock_source_data(tmp_path):
    # Setup source data directory
    source_dir = tmp_path / "source_data"
    source_dir.mkdir()
    
    # Create mock second_brain.db
    (source_dir / "second_brain.db").write_text("dummy database content content content content content")
    
    # Create mock chroma_store
    (source_dir / "chroma_store").mkdir()
    (source_dir / "chroma_store" / "data.bin").write_text("dummy chroma content")
    
    # Create mock uploads
    (source_dir / "uploads").mkdir()
    (source_dir / "uploads" / "file.txt").write_text("dummy upload content")
    
    return source_dir

def test_import_data_success(mock_source_data):
    # Call import-data endpoint
    response = client.post("/api/system/import-data", json={"source_path": str(mock_source_data)})
    
    # Verify response
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    
    # Verify files were copied to settings.data_root
    data_root = settings.data_root
    assert (data_root / "second_brain.db").exists()
    assert (data_root / "chroma_store" / "data.bin").exists()
    assert (data_root / "uploads" / "file.txt").exists()

def test_import_data_invalid_path():
    # Call import-data endpoint with invalid path
    response = client.post("/api/system/import-data", json={"source_path": "/non/existent/path"})
    
    # Verify response
    assert response.status_code == 400
    assert "Invalid source path" in response.json()["detail"]

def test_import_data_missing_db(tmp_path):
    # Call import-data endpoint with path missing second_brain.db
    empty_dir = tmp_path / "empty_dir"
    empty_dir.mkdir()
    response = client.post("/api/system/import-data", json={"source_path": str(empty_dir)})
    
    # Verify response
    assert response.status_code == 400
    assert "second_brain.db not found" in response.json()["detail"]

def test_import_data_same_path():
    # Call import-data endpoint with source_path == data_root
    data_root = settings.data_root.resolve()
    # Ensure data_root exists and contains second_brain.db for validation to pass
    data_root.mkdir(parents=True, exist_ok=True)
    (data_root / "second_brain.db").write_text("mock database")
    
    response = client.post("/api/system/import-data", json={"source_path": str(data_root)})
    
    # Verify response
    assert response.status_code == 400
    assert "选择的导入目录与当前数据目录相同，无需导入" in response.json()["detail"]
