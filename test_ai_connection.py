
import httpx
import sys
import time

# === 用户配置区 ===
API_KEY = "your-api-key-here"
BASE_URL = "https://api.openai.com/v1" # 确保包含 /v1 路径
MODEL = "gpt-3.5-turbo"
# =================

def test_connection():
    print(f"[*] 开始诊断 AI 连接性...")
    print(f"[*] BASE_URL: {BASE_URL}")
    print(f"[*] MODEL: {MODEL}")
    print(f"[*] API_KEY: {'*' * (len(API_KEY)-4) + API_KEY[-4:] if len(API_KEY) > 4 else '***'}")
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Say 'hello' briefly."}],
        "max_tokens": 10
    }
    
    url = f"{BASE_URL.rstrip('/')}/chat/completions"
    
    start_time = time.time()
    try:
        print(f"[*] 正在发起请求至: {url}")
        with httpx.Client(verify=False, timeout=30.0) as client:
            response = client.post(url, headers=headers, json=payload)
            
            elapsed = time.time() - start_time
            print(f"[*] 响应时间: {elapsed:.2f}s")
            print(f"[*] 状态码: {response.status_code}")
            
            if response.status_code == 200:
                print("[+] 连接成功！")
                result = response.json()
                content = result['choices'][0]['message']['content']
                print(f"[+] AI 响应内容: {content}")
            else:
                print(f"[-] 请求失败！错误详情: {response.text}")
                
    except httpx.ConnectError as e:
        print(f"[-] 网络连接错误 (ConnectError): {str(e)}")
        print("    建议：检查网络是否畅通，或者 BASE_URL 填写是否正确。")
    except httpx.HTTPStatusError as e:
        print(f"[-] HTTP 状态错误: {str(e)}")
    except httpx.TimeoutException:
        print(f"[-] 请求超时！(Timeout)")
        print("    建议：检查代理设置或目标 API 是否可达。")
    except Exception as e:
        print(f"[-] 发生未知错误: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if API_KEY == "your-api-key-here":
        print("[!] 请先在脚本中配置您的 API_KEY 和 BASE_URL。")
    test_connection()
