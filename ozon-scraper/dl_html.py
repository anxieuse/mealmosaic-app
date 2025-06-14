import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium_stealth import stealth

# Configure Chrome with stealth
def create_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--disable-infobars')
    options.add_argument('--disable-extensions')
    # Use visible mode to ensure JS challenge runs
    options.add_argument('--headless')  # disable headless if anti-bot triggers
    options.add_argument(
        'user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/91.0.4472.124 Safari/537.36'
    )
    
    service = Service('/usr/bin/chromedriver')  # rely on default chromedriver in PATH
    driver = webdriver.Chrome(service=service, options=options)

    # Stealth settings
    stealth(driver,
            languages=["en-US", "en"],
            vendor="Google Inc.",
            platform="Win32",
            webgl_vendor="Intel Inc.",
            renderer="Intel Iris OpenGL Engine",
            fix_hairline=True)
    return driver

def download_html_content(url: str) -> str:
    """Download HTML content of a page using a stealthy Selenium driver."""
    driver = create_driver()
    try:
        driver.get(url)
        # Wait for JS challenge to complete
        time.sleep(3)
        html = driver.page_source
        if "captcha" in html.lower():
            raise RuntimeError("Captcha detected on page")
        return html
    finally:
        driver.quit()

# Main download function
def download_page(url: str, output_path: str) -> None:
    """Download a page and save it to a file."""
    html_content = download_html_content(url)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

if __name__ == '__main__':
    # Hardcoded URL to download for testing
    target_url = 'https://www.ozon.ru/product/farsh-iz-svininy-i-govyadiny-druzhe-domashniy-ohlazhdennyy-400g-1580759276'
    target_url = 'https://www.ozon.ru/product/gorohovaya-kasha-s-kolbaskami-i-bekonom-200-g-ozon-fresh-2022223978/?oos_search=false'
    output_file = 'product_page.html'
    
    print(f"Downloading {target_url}...")
    try:
        download_page(target_url, output_file)
        print(f'Page saved to {output_file}')
    except Exception as e:
        print(f'Error fetching page: {e}')
