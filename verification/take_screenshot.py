import subprocess
import time
import sys
import os
from playwright.sync_api import sync_playwright

def verify():
    subprocess.run("kill $(lsof -t -i :3000) 2>/dev/null || true", shell=True)

    print("Starting server (production mode)...")
    server = subprocess.Popen(
        ["npm", "start"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        preexec_fn=os.setsid
    )

    try:
        print("Waiting for server to be ready...")
        max_retries = 60
        for i in range(max_retries):
            try:
                import socket
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(1)
                    if s.connect_ex(('localhost', 3000)) == 0:
                        print("Server is ready!")
                        break
            except Exception:
                pass
            time.sleep(2)

        with sync_playwright() as p:
            print("Launching browser...")
            browser = p.chromium.launch()
            page = browser.new_page()

            print("Navigating to /day-trading...")
            page.goto("http://localhost:3000/day-trading", timeout=60000)

            print("Waiting for chart/page to load...")
            page.wait_for_timeout(5000)

            path = "verification/verification.png"
            page.screenshot(path=path)
            print(f"Screenshot saved to {path}")
            return path

    finally:
        try:
            os.killpg(os.getpgid(server.pid), 15)
            server.wait()
        except:
            pass

if __name__ == "__main__":
    verify()
