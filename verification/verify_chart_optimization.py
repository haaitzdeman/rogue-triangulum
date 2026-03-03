import subprocess
import time
import sys
import os
from playwright.sync_api import sync_playwright

def verify():
    # Kill any existing node process on port 3000
    subprocess.run("kill $(lsof -t -i :3000) 2>/dev/null || true", shell=True)

    # Start the server
    print("Starting server (production mode)...")
    # Using setsid to create a new process group so we can kill the whole tree later
    server = subprocess.Popen(
        ["npm", "start"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        preexec_fn=os.setsid
    )

    try:
        # Wait for server to be ready
        print("Waiting for server to be ready...")
        max_retries = 60
        for i in range(max_retries):
            try:
                # Check if port 3000 is open. using python socket is cleaner but nc is fine
                # Using socket to avoid 'nc' dependency
                import socket
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(1)
                    if s.connect_ex(('localhost', 3000)) == 0:
                        print("Server is ready!")
                        break
            except Exception:
                pass

            time.sleep(2)
            if i == max_retries - 1:
                print("Server failed to start")
                # print stderr
                print(server.stderr.read().decode('utf-8'))
                raise Exception("Server failed to start")

        with sync_playwright() as p:
            print("Launching browser...")
            browser = p.chromium.launch()
            page = browser.new_page()

            logs = []
            page.on("console", lambda msg: logs.append(msg.text))
            page.on("pageerror", lambda err: print(f"Page Error: {err}"))

            print("Navigating to /day-trading...")
            try:
                page.goto("http://localhost:3000/day-trading", timeout=60000)
            except Exception as e:
                print(f"Navigation failed: {e}")
                # check server output
                # print(server.stdout.read().decode('utf-8'))
                raise

            # Wait for initial chart creation
            # We look for the log
            print("Waiting for chart creation...")
            for _ in range(30):
                if any("CHART_CREATED" in log for log in logs):
                    break
                page.wait_for_timeout(500)

            # Wait a bit more for stability
            page.wait_for_timeout(2000)

            initial_creations = logs.count("CHART_CREATED")
            print(f"Initial CHART_CREATED count: {initial_creations}")

            if initial_creations == 0:
                print("Error: Chart did not create initially.")
                print("All Logs:", logs)
                print("Page Content Snippet:", page.content()[:2000])
                return False

            # Find a timeframe button that is NOT selected.
            # Default is likely 5m. Let's click '15m'
            print("Clicking 15m timeframe...")
            try:
                page.get_by_role("button", name="15m").click()
            except Exception as e:
                print(f"Failed to click button: {e}")
                return False

            page.wait_for_timeout(3000)

            total_creations = logs.count("CHART_CREATED")
            print(f"Total CHART_CREATED count: {total_creations}")

            data_updates = logs.count("DATA_UPDATED")
            print(f"Total DATA_UPDATED count: {data_updates}")

            page.screenshot(path="verification/chart.png")
            print("Screenshot saved to verification/chart.png")

            return {
                "initial": initial_creations,
                "total": total_creations,
                "updates": data_updates
            }

    finally:
        # Kill the server
        try:
            os.killpg(os.getpgid(server.pid), 15)
            server.wait()
        except:
            pass

if __name__ == "__main__":
    result = verify()
    print("Verification Result:", result)
