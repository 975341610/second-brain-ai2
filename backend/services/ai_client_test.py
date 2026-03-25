import pytest
import json
from unittest.mock import AsyncMock, patch
from backend.services.ai_client import AIClient
import httpx

@pytest.mark.asyncio
async def test_error_translation_401():
    client = AIClient()
    # Mock _check_connectivity to skip network checks
    with patch.object(client, '_check_connectivity', return_value=None):
        # Mock response
        mock_response = httpx.Response(
            status_code=401,
            content=json.dumps({"error": {"message": "Invalid API Key"}}).encode(),
            headers={"Content-Type": "application/json"}
        )
        
        with patch.object(client.client, 'post', return_value=mock_response):
            result = await client._chat_completion("hello", config={"api_key": "test", "base_url": "http://api.test"})
            assert "API Error 401: API Key无效或未授权" in result
            assert "Invalid API Key" in result

@pytest.mark.asyncio
async def test_error_translation_429_zhipu_unicode():
    client = AIClient()
    # Mock _check_connectivity to skip network checks
    with patch.object(client, '_check_connectivity', return_value=None):
        # Zhipu style 429 with unicode
        zhipu_msg = r'{"error": {"message": "\u60a8\u7684\u8bf7\u6c42\u9891\u7387\u8fc7\u9ad8"}}'
        mock_response = httpx.Response(
            status_code=429,
            content=zhipu_msg.encode(),
            headers={"Content-Type": "application/json"}
        )
        
        with patch.object(client.client, 'post', return_value=mock_response):
            result = await client._chat_completion("hello", config={"api_key": "test", "base_url": "http://api.test"})
            assert "API Error 429: 请求频率过高/达到限额" in result
            assert "您的请求频率过高" in result

@pytest.mark.asyncio
async def test_error_translation_stream_429():
    client = AIClient()
    # Mock _check_connectivity to skip network checks
    with patch.object(client, '_check_connectivity', return_value=None):
        zhipu_msg = r'{"error": {"message": "\u60a8\u7684\u8bf7\u6c42\u9891\u7387\u8fc7\u9ad8"}}'
        mock_response = httpx.Response(
            status_code=429,
            content=zhipu_msg.encode(),
            headers={"Content-Type": "application/json"}
        )
        
        # Mock client.stream context manager
        from unittest.mock import MagicMock
        mock_cm = MagicMock()
        mock_cm.__aenter__.return_value = mock_response
        mock_cm.__aexit__.return_value = None
        
        with patch.object(client.client, 'stream', return_value=mock_cm):
            chunks = []
            async for chunk in client.stream_chat([{"role": "user", "content": "hello"}], config={"api_key": "test", "base_url": "http://api.test"}):
                chunks.append(chunk)
            
            full_resp = "".join(chunks)
            assert "data: " in full_resp
            assert "API Error 429: 请求频率过高/达到限额" in full_resp
            assert "您的请求频率过高" in full_resp
