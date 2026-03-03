from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_chart(page: Page):
    # 1. Go to the Swing trading page
    page.goto("http://localhost:3000/swing")

    # 2. Wait for the chart container to be visible.
    # The chart is in a container with class "card".
    # I'll look for text that indicates the page loaded.
    page.wait_for_selector(".card")

    # Wait a bit for the chart canvas to render (lightweight-charts uses canvas)
    time.sleep(2)

    # 3. Screenshot
    page.screenshot(path="verification/chart_screenshot.png")
    print("Screenshot taken at verification/chart_screenshot.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_chart(page)
        finally:
            browser.close()
