from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_chart(page: Page):
    print("Navigating to /day-trading")
    page.goto("http://localhost:3000/day-trading")

    # print("Waiting for page title")
    # expect(page.get_by_text("Day Trading")).to_be_visible()

    print("Waiting for canvas")
    # Also wait for the chart canvas. Lightweight charts creates a canvas.
    # We use a selector that targets the canvas element specifically.
    page.wait_for_selector("canvas", state="attached", timeout=10000)

    print("Chart found. Taking screenshot.")
    time.sleep(3) # Wait for chart to render content (canvas drawing)

    page.screenshot(path="verification/chart_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        print("Launching browser")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_chart(page)
            print("Verification successful")
        except Exception as e:
            print(f"Verification failed: {e}")
            try:
                page.screenshot(path="verification/error_screenshot.png")
            except:
                pass
        finally:
            browser.close()
