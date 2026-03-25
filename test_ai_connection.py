
import httpx
import sys
import time
import socket
import ssl
from urllib.parse import urlparse

# === 用户配置区 ===
API_KEY = "your-api-key-here"
BASE_URL = "https://api.openai.com/v1" # 确保包含 /v1 路径
MODEL = "gpt-3.5-turbo"
# =================

def preflight_check(url: str):
    print(f"[*] 正在进行预检 (Pre-flight Check)...")
    parsed = urlparse(url)
    scheme = parsed.scheme
    host = parsed.hostname
    port = parsed.port or (443 if scheme == "https" else 80)
    
    print(f"[*] Scheme: {scheme}")
    print(f"[*] Host: {host}")
    print(f"[*] Port: {port}")

    if not host:
        print(f"[-] 错误: 无法解析主机名。请检查 BASE_URL。")
        return False

    # 1. DNS Resolution
    print(f"[*] 1. DNS 解析测试...")
    try:
        ais = socket.getaddrinfo(host, port)
        ips = {a[4][0] for a in ais}
        print(f"[+] DNS 解析成功: {list(ips)}")
    except socket.gaierror as e:
        print(f"[-] DNS 解析失败: {e}")
        return False

    # 2. TCP Connect
    print(f"[*] 2. TCP 连接测试 ({host}:{port})...")
    try:
        with socket.create_connection((host, port), timeout=10) as sock:
            print(f"[+] TCP 连接成功！")
            
            # 3. TLS Handshake (if https)
            if scheme == "https":
                print(f"[*] 3. TLS 握手测试...")
                context = ssl.create_default_context()
                # 某些环境下可能需要禁用验证进行诊断，但默认应开启
                # context.check_hostname = False
                # context.verify_mode = ssl.CERT_NONE
                try:
                    with context.wrap_socket(sock, server_hostname=host) as ssock:
                        cert = ssock.getpeercert()
                        print(f"[+] TLS 握手成功！")
                except ssl.SSLError as e:
                    print(f"[-] TLS 握手失败: {e}")
                    print("    建议: 检查是否为代理拦截、证书过期或系统证书库缺失。")
                    return False
    except socket.timeout:
        print(f"[-] TCP 连接超时！")
        return False
    except ConnectionRefusedError:
        print(f"[-] TCP 连接被拒绝！")
        return False
    except Exception as e:
        print(f"[-] TCP 连接发生异常: {e}")
        return False

    print(f"[+] 预检全部通过！")
    return True

def test_connection():
    print(f"[*] 开始诊断 AI 连接性...")
    print(f"[*] BASE_URL: {BASE_URL}")
    print(f"[*] MODEL: {MODEL}")
    print(f"[*] API_KEY: {'*' * (max(0, len(API_KEY)-4)) + API_KEY[-4:] if len(API_KEY) > 4 else '***'}")
    
    if not preflight_check(BASE_URL):
        print(f"[!] 预检失败，跳过 HTTP 请求。")
        return

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
