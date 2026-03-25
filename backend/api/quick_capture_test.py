import os
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, SessionLocal, Base, engine
from backend.config import get_settings

# 配置测试数据库路径
settings = get_settings()
TEST_DB_PATH = settings.data_root / "test_second_brain.db"

# 修改 engine 为测试数据库 (可选，这里我们直接用默认的，但在测试前先清理)
# 为了简单起见，我们在 setup/teardown 中处理

# 使用 TestClient
client = TestClient(app)

def setup_module(module):
    # 确保数据目录存在
    settings.data_root.mkdir(parents=True, exist_ok=True)
    # 创建测试数据库表
    Base.metadata.create_all(bind=engine)

def test_quick_capture_success():
    payload = {"content": "这是我的一个灵感"}
    response = client.post("/api/notes/quick-capture", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "灵感碎片" in data["note"]["title"]
    assert data["note"]["content"] == "这是我的一个灵感"
    assert data["exp_gained"] == 10
    assert data["current_exp"] >= 10
    assert data["current_level"] >= 1

def test_get_user_stats():
    response = client.get("/api/user/stats")
    assert response.status_code == 200
    data = response.json()
    assert "exp" in data
    assert "level" in data
    assert "total_captures" in data
