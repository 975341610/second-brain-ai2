import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from backend.services.ai_client import AIClient

@pytest.fixture
def ai_client():
    with patch("backend.services.ai_client.get_settings") as mock_settings, \
         patch("backend.services.ai_client.get_ai_logger") as mock_logger:
        mock_settings.return_value.openclaw_api_key = "test-key"
        mock_settings.return_value.openclaw_base_url = "http://test.ai"
        mock_settings.return_value.default_model = "test-model"
        
        mock_logger.return_value = MagicMock()
        
        client = AIClient()
        return client

@pytest.mark.asyncio
async def test_stream_chat_sse(ai_client):
    sse_data = [
        "data: {\"choices\": [{\"delta\": {\"content\": \"Hello\"}}]}",
        "data: {\"choices\": [{\"delta\": {\"content\": \" world\"}}]}",
        "data: [DONE]"
    ]
    
    async def mock_aiter_lines():
        for line in sse_data:
            yield line
            
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.aiter_lines = MagicMock(return_value=mock_aiter_lines())
    
    ai_client.client.stream = MagicMock()
    ai_client.client.stream.return_value.__aenter__ = AsyncMock(return_value=mock_response)
    ai_client.client.stream.return_value.__aexit__ = AsyncMock()
    
    messages = [{"role": "user", "content": "hi"}]
    chunks = []
    async for chunk in ai_client.stream_chat(messages):
        chunks.append(chunk)
        
    assert chunks == ["Hello", " world"]

@pytest.mark.asyncio
async def test_stream_chat_jsonl(ai_client):
    jsonl_data = [
        "{\"choices\": [{\"delta\": {\"content\": \"Foo\"}}]}",
        "{\"choices\": [{\"delta\": {\"content\": \"Bar\"}}]}",
        "[DONE]"
    ]
    
    async def mock_aiter_lines():
        for line in jsonl_data:
            yield line
            
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.aiter_lines = MagicMock(return_value=mock_aiter_lines())
    
    ai_client.client.stream = MagicMock()
    ai_client.client.stream.return_value.__aenter__ = AsyncMock(return_value=mock_response)
    ai_client.client.stream.return_value.__aexit__ = AsyncMock()
    
    messages = [{"role": "user", "content": "hi"}]
    chunks = []
    async for chunk in ai_client.stream_chat(messages):
        chunks.append(chunk)
        
    assert chunks == ["Foo", "Bar"]

@pytest.mark.asyncio
async def test_stream_chat_first_token_timeout(ai_client):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.aiter_lines = MagicMock(return_value=AsyncMock())
    
    ai_client.client.stream = MagicMock()
    ai_client.client.stream.return_value.__aenter__ = AsyncMock(return_value=mock_response)
    ai_client.client.stream.return_value.__aexit__ = AsyncMock()
    
    messages = [{"role": "user", "content": "hi"}]
    chunks = []
    
    with patch("backend.services.ai_client.asyncio.wait_for", side_effect=asyncio.TimeoutError), \
         patch("backend.services.ai_client.asyncio.sleep", AsyncMock()):
        async for chunk in ai_client.stream_chat(messages):
            chunks.append(chunk)
            
    assert any("First token timeout" in str(c) for c in chunks)

@pytest.mark.asyncio
async def test_stream_chat_retry_logic(ai_client):
    call_count = 0
    
    async def mock_aiter_lines_fail():
        # Raise exception immediately
        raise Exception("Connection reset")
        yield "Never"
        
    async def mock_aiter_lines_success():
        yield "{\"choices\": [{\"delta\": {\"content\": \"Success\"}}]}"
        
    def mock_stream(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        m_res = MagicMock()
        m_res.status_code = 200
        m_res.raise_for_status = MagicMock()
        if call_count < 3:
            m_res.aiter_lines = MagicMock(return_value=mock_aiter_lines_fail())
        else:
            m_res.aiter_lines = MagicMock(return_value=mock_aiter_lines_success())
        
        ctx = MagicMock()
        ctx.__aenter__ = AsyncMock(return_value=m_res)
        ctx.__aexit__ = AsyncMock()
        return ctx

    ai_client.client.stream = MagicMock(side_effect=mock_stream)
    
    with patch("backend.services.ai_client.asyncio.sleep", AsyncMock()):
        messages = [{"role": "user", "content": "hi"}]
        chunks = []
        async for chunk in ai_client.stream_chat(messages):
            chunks.append(chunk)
            
    assert "Success" in chunks
    assert call_count == 3
