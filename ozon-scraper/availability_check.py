#! /usr/bin/env python3

import argparse
import time
from typing import List, Tuple
import math
from concurrent.futures import ProcessPoolExecutor
import os
import json

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium_stealth import stealth


# ---------------------------------------------------------------------------
# Selenium driver factory
# ---------------------------------------------------------------------------

def create_driver(headless: bool = False) -> webdriver.Chrome:
    """Create a stealth Chrome WebDriver instance.

    Parameters
    ----------
    headless : bool, default False
        Whether to start the browser in headless mode. For manual interaction
        (e.g. choosing a delivery address) this should be *False*.
    """
    options = Options()
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--disable-infobars')
    options.add_argument('--disable-extensions')

    if headless:
        options.add_argument('--headless')

    # A common desktop UA string (helps bypass some anti-bot checks)
    options.add_argument(
        'user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/114.0.0.0 Safari/537.36'
    )

    service = Service('/usr/bin/chromedriver')
    driver = webdriver.Chrome(service=service, options=options)

    # Apply stealth tweaks
    stealth(
        driver,
        languages=["en-US", "en"],
        vendor="Google Inc.",
        platform="Win32",
        webgl_vendor="Intel Inc.",
        renderer="Intel Iris OpenGL Engine",
        fix_hairline=True,
    )

    # A tiny implicit wait makes `find_elements` more robust
    # driver.implicitly_wait(5)
    return driver


# ---------------------------------------------------------------------------
# Availability checker logic
# ---------------------------------------------------------------------------

def check_availability(driver: webdriver.Chrome, url: str, wait_first: bool = False) -> int:
    """Return 1 if product is available for delivery, otherwise 0.

    Parameters
    ----------
    wait_first : bool, default False
        If True, wait 0.5 s after loading the page (used for the **very first** product
        only – subsequent loads run without extra delay for maximum speed).
    """
    driver.get(url)

    if wait_first:
        time.sleep(1)

    # Product is unavailable if either:
    #   • The "Узнать о поступлении" button is visible (usual case)
    #   • The special out-of-stock page appears with text "Этот товар закончился"
    notify_btn = driver.find_elements(By.XPATH, "//button[contains(., 'Узнать о поступлении')]")
    finished_msg1 = driver.find_elements(By.XPATH, "//*[contains(text(), 'Этот товар закончился')]")

    # And one more:
    # document.querySelector(".l8y_27") 
    # //h2[@class='l8y_27']
    # <h2 class="l8y_27">
    # Этот товар закончился
    # </h2>
    finished_msg2 = False # driver.find_elements(By.XPATH, "//h2[@class='l8y_27']")

    return 0 if (notify_btn or finished_msg1 or finished_msg2) else 1
    # return 0 if (notify_btn) else 1
    # return 0 if (finished_msg) else 1


# ---------------------------------------------------------------------------
# Session capture / restore helpers
# ---------------------------------------------------------------------------

def capture_address_session() -> Tuple[List[dict], dict]:
    """Launch a visible browser, let the user set address, return cookies & localStorage."""
    driver = create_driver(headless=False)
    print("Opening Ozon Fresh")
    driver.get("https://www.ozon.ru/fresh/")
    input(
        "Set the delivery address, then press <Enter> here to continue…"
    )

    cookies = driver.get_cookies()

    # Fetch localStorage entries (if any)
    try:
        local_storage = driver.execute_script(
            """
            var items = {}, ls = window.localStorage;
            for (var i = 0; i < ls.length; i++) {
                items[ls.key(i)] = ls.getItem(ls.key(i));
            }
            return items;
            """
        )
    except Exception:
        local_storage = {}

    driver.quit()
    return cookies, local_storage


def restore_session(headless: bool, cookies: List[dict], local_storage: dict) -> webdriver.Chrome:
    """Start a (possibly headless) driver and inject cookies/localStorage."""
    driver = create_driver(headless=headless)

    # Navigate to domain first so cookies can be set
    driver.get("https://www.ozon.ru/")

    for cookie in cookies:
        # Remove attributes Selenium cannot set back
        cookie = {k: v for k, v in cookie.items() if k in {"name", "value", "domain", "path", "secure", "httpOnly"}}
        try:
            driver.add_cookie(cookie)
        except Exception:
            pass  # ignore cookies that cannot be added

    # Restore localStorage (optional)
    for key, value in local_storage.items():
        try:
            driver.execute_script("window.localStorage.setItem(arguments[0], arguments[1]);", key, value)
        except Exception:
            pass

    driver.refresh()
    return driver

CHECK_AV1 = True
def _worker(url_batch: List[str], cookies: List[dict], local_storage: dict) -> List[int]:
    """Process subset of URLs inside a separate process and print results."""
    driver = restore_session(headless=True, cookies=cookies, local_storage=local_storage)
    results: List[int] = []
    try:
        for idx, url in enumerate(url_batch, start=1):
            if CHECK_AV1:
                availability1 = check_availability(driver, url, wait_first=(idx == 1))
            else:
                availability1 = True
            url = format_url(url)
            availability2 = check_availability(driver, url, wait_first=(idx == 1))   
            print(f"{url} {'1' if availability1 and availability2 else '0'}", flush=True)
            results.append(availability1 and availability2)
        return results
    finally:
        driver.quit()


def _chunks(seq: List[str], n: int) -> List[List[str]]:
    """Split list *seq* into *n* balanced chunks (order preserved)."""
    if n <= 1:
        return [seq]
    k, m = divmod(len(seq), n)
    chunks = []
    start = 0
    for i in range(n):
        length = k + (1 if i < m else 0)
        chunks.append(seq[start:start + length])
        start += length
    return [c for c in chunks if c]  # remove empty

def format_url(url):
    # Check if it already have any arguments
    if '/?' in url:
        return url + '&oos_search=false'
    else:
        if url.endswith('/'):
            return url + '?oos_search=false'
        else:
            return url + '/?oos_search=false'

def save_session(path: str, cookies: List[dict], local_storage: dict) -> None:
    """Save *cookies* and *local_storage* to *path* in JSON format."""
    data = {
        "cookies": cookies,
        "localStorage": local_storage,
    }
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(cookies)} cookies to {path}")
    except Exception as e:
        print(f"[WARN] Failed to write cookies to {path}: {e}")


def load_session(path: str) -> Tuple[List[dict], dict]:
    """Load cookies and localStorage previously saved with *save_session*.

    If *path* does not exist, returns ([], {}).
    """
    if not os.path.exists(path):
        return [], {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Support legacy format where only a list of cookies was saved
        if isinstance(data, list):
            return data, {}

        cookies = data.get("cookies", [])
        local_storage = data.get("localStorage", {})
        return cookies, local_storage
    except Exception as e:
        print(f"[WARN] Failed to read cookies from {path}: {e}")
        return [], {}

def process_urls(
    urls: List[str],
    workers: int = 1,
    headless_after: bool = True,
    cookies: List[dict] = None,
    local_storage: dict = None,
) -> List[int]:
    """Check *urls* for availability reusing an existing session.

    If *cookies* is ``None`` they will be captured interactively.
    """

    # Capture session data if none supplied
    # if cookies is None or local_storage is None or not cookies:
    #     cookies, local_storage = capture_address_session()

    # Single-process mode ---------------------------------------------------
    if workers <= 1:
        driver = restore_session(headless=headless_after, cookies=cookies, local_storage=local_storage)
        try:
            results = []
            for idx, url in enumerate(urls, start=1):
                if CHECK_AV1:
                    availability1 = check_availability(driver, url, wait_first=(idx == 1))
                else:
                    availability1 = True
                url = format_url(url)   
                availability2 = check_availability(driver, url, wait_first=(idx == 1))
                final_av = availability1 and availability2
                print(f"{url} {'1' if final_av else '0'}", flush=True)
                results.append(final_av)
            return results
        finally:
            driver.quit()

    # Parallel mode ---------------------------------------------------------

    # Plan chunks (balanced) ----------------------------------------------
    chunks = _chunks(urls, workers)

    results: List[int] = [0] * len(urls)

    # Keep mapping of chunk to slice indexes to reassemble results
    slice_starts = []
    start = 0
    for c in chunks:
        slice_starts.append(start)
        start += len(c)

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(_worker, chunk, cookies, local_storage) for chunk in chunks]
        for fut, slice_start in zip(futures, slice_starts):
            batch_res = fut.result()
            results[slice_start:slice_start + len(batch_res)] = batch_res

    return results


# ---------------------------------------------------------------------------
# Command-line interface
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Check Ozon Fresh product availability at a given address.")

    # Mutually-exclusive high-level actions
    parser.add_argument(
        "--setup-cookies",
        metavar="FILE",
        help="Run interactive browser to capture cookies/address and save them to FILE then exit.",
    )

    # Availability-checking options
    parser.add_argument("csv_path", nargs="?", help="Path to CSV file containing a 'url' column (required unless --setup-cookies is used)")

    parser.add_argument(
        "--cookies",
        metavar="FILE",
        default="cookies.json",
        help="Path to cookie JSON file to load (default: cookies.json)",
    )

    parser.add_argument(
        "--output",
        default="availability_output.csv",
        help="Where to write the resulting CSV (default: availability_output.csv)",
    )

    parser.add_argument(
        "--no-headless-after",
        action="store_true",
        help="Continue in visible mode after address entry (slower).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of parallel headless browsers to use (default 1).",
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # Cookie setup mode
    # ------------------------------------------------------------------
    if args.setup_cookies:
        cookies, ls = capture_address_session()
        save_session(args.setup_cookies, cookies, ls)
        return

    # From this point we expect csv_path to be provided
    if not args.csv_path:
        parser.error("csv_path is required unless --setup-cookies is specified")

    # Load cookies if file exists, otherwise fall back to interactive capture when
    # process_urls() is invoked.
    cookies, ls = load_session(args.cookies)

    df = pd.read_csv(args.csv_path)
    if "url" not in df.columns:
        raise SystemExit("Input CSV must contain a 'url' column")

    urls = df["url"].dropna().tolist()
    if not urls:
        raise SystemExit("No URLs found in the 'url' column")

    availabilities = process_urls(
        urls,
        workers=max(1, args.workers),
        headless_after=not args.no_headless_after,
        cookies=cookies,
        local_storage=ls,
    )

    # Save CSV if --output provided (optional, not printed)
    if args.output:
        out_df = pd.DataFrame({"url": urls, "availability": availabilities})
        out_df.to_csv(args.output, index=False)


if __name__ == "__main__":
    main() 