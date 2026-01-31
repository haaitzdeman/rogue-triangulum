from playwright.sync_api import Page, expect, sync_playwright

def verify_chart(page: Page):
    print("Navigating to /swing...")
    page.goto("http://localhost:3000/swing")

    print("Waiting for MSFT symbol...")
    # Use first, as it appears in header and buttons
    page.get_by_text("MSFT", exact=True).first.wait_for()

    print("Waiting for chart canvas...")
    page.locator("canvas").first.wait_for()

    # Wait a bit for the chart to fully render
    page.wait_for_timeout(2000)

    print("Taking screenshot...")
    page.screenshot(path="verification/chart_optimization.png")
    print("Screenshot saved.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_chart(page)
        finally:
            browser.close()
