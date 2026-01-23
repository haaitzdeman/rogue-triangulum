from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to Swing Trading page
        print("Navigating to Swing Trading page...")
        page.goto("http://localhost:3000/swing")

        # Wait for the chart to load (or at least the container)
        print("Waiting for chart container...")
        # The chart container has a style height set, and inside it canvas should appear
        # The container has `ref={chartContainerRef}` and is a div.
        # It's inside a div with class "card p-4".
        # Let's look for text "Swing Trading" (header) and "MSFT" (symbol).

        page.wait_for_selector("text=Swing Trading", timeout=10000)
        page.wait_for_selector("text=MSFT", timeout=10000)

        # Wait a bit for canvas to render
        page.wait_for_timeout(3000)

        # Take screenshot
        os.makedirs("/home/jules/verification", exist_ok=True)
        screenshot_path = "/home/jules/verification/swing_chart.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
