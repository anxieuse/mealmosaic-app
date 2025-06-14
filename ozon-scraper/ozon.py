import argparse
import csv
import json
import os
import time
from datetime import datetime
from urllib.parse import quote, urlparse
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

import requests
from bs4 import BeautifulSoup
import pandas as pd

from dl_html import download_html_content, download_page

# --- Setup Debug Logger ---
debug_logger = logging.getLogger('debug_logger')
debug_logger.setLevel(logging.DEBUG)
handler = logging.FileHandler('ozon.log', 'w', 'utf-8')
handler.setFormatter(logging.Formatter('%(asctime)s - %(message)s'))
debug_logger.addHandler(handler)
# ---

# Default headers to bypass basic bot protection
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
}

# ---------------------------------------------------------------------------
#  Helpers for product data records
# ---------------------------------------------------------------------------

def create_empty_product_record(url: str = '') -> dict:
    """Return a basic product record with mandatory keys.

    Only the absolutely required keys are pre-filled here.  Any additional
    fields can be added later in the parsing functions simply by assignment,
    e.g. ``result['my_new_field'] = value`` – the rest of the pipeline will
    pick them up automatically (CSV columns are inferred dynamically).
    """
    return {'url': url, 'fetchErr': ''}

API_BASE = 'https://api.ozon.ru/entrypoint-api.bx/page/json/v2'


def log_with_time(message: str, enable_logging: bool = True):
    """Log message with timestamp if logging is enabled."""
    if enable_logging:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {message}")


def get_safe_filename(url: str) -> str:
    """Generate safe filename from product URL."""
    # Extract product name from URL
    match = re.search(r'/product/([^/]+)', url)
    if match:
        product_slug = match.group(1).strip('/')
        return product_slug
    # Fallback to URL-based filename
    parsed = urlparse(url)
    safe_name = re.sub(r'[^\w\-_.]', '_', parsed.path.strip('/').replace('/', '_'))
    return safe_name[:100]  # Limit length


def fetch_json(session: requests.Session, path: str, referer: str, page_changed: bool = False) -> dict:
    """
    Fetch JSON data from Ozon internal API, bypassing bot checks.
    :param session: requests.Session
    :param path: relative path e.g. '/category/...'
    :param referer: full referer URL
    :param page_changed: whether to add page_changed=true parameter
    :return: parsed JSON or empty dict
    """
    params = {'url': path}
    if page_changed:
        params['page_changed'] = 'true'
    
    request_url = session.prepare_request(requests.Request('GET', API_BASE, params=params, headers={**HEADERS, 'Referer': referer})).url
    debug_logger.debug(f"Fetching URL: {request_url}")
    
    response = session.get(API_BASE, params=params, headers={**HEADERS, 'Referer': referer}, timeout=15)
    print(f"Fetching: {response.url}")
    response.raise_for_status()

    debug_logger.debug(f"Response for {request_url}:\n{response.text[:128]}\n")
    
    if 'application/json' not in response.headers.get('Content-Type', ''):
        raise ValueError('Expected JSON, got: %s' % response.headers.get('Content-Type'))
    return response.json()


def extract_category_id_from_url(category_url: str) -> str:
    """
    Extract category ID from URL like:
    https://www.ozon.ru/category/supermarket-gotovye-blyuda-9521000
    or
    https://www.ozon.ru/highlight/produktsiya-ozon-express-199745
    Returns: supermarket-gotovye-blyuda-9521000 or produktsiya-ozon-express-199745
    """
    parsed = urlparse(category_url)
    path_parts = parsed.path.strip('/').split('/')
    if len(path_parts) >= 2 and path_parts[0] == 'category':
        return path_parts[1]
    if len(path_parts) >= 2 and path_parts[0] == 'highlight':
        return path_parts[1]
    raise ValueError(f"Cannot extract category ID from URL: {category_url}")


def get_category_name_from_url(category_url: str) -> str:
    """Extract category name from URL for directory naming."""
    category_id = extract_category_id_from_url(category_url)
    # Remove numeric suffix if present (e.g., "supermarket-gotovye-blyuda-9521000" -> "supermarket-gotovye-blyuda")
    name_parts = category_id.split('-')
    if name_parts[-1].isdigit():
        return '-'.join(name_parts[:-1])
    return category_id


def load_product_urls(csv_path: str) -> list:
    """Load existing product URLs from CSV file."""
    if not os.path.exists(csv_path):
        return []
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            return list(reader)
    except Exception:
        return []


def save_product_urls(products: list, csv_path: str):
    """Save product URLs to CSV file."""
    if not products:
        return
    
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['url'])
        writer.writeheader()
        for product in products:
            if isinstance(product, dict):
                writer.writerow(product)
            else:
                writer.writerow({'url': product})


PAGE_DEBUG_LIMIT=322
def get_product_urls(session: requests.Session, category_url: str, enable_logging: bool = True) -> list:
    """
    Iterate through category pages loading JSON, collect all product links.
    """
    category_id = extract_category_id_from_url(category_url)
    
    # First page path
    first_page_path = f'/category/{category_id}/?layout_container=categorySearchMegapagination'
    referer = category_url

    urls = []
    page = 1
    current_path = first_page_path
    
    while True:
        log_with_time(f"Fetching category page {page}", enable_logging)
        
        try:
            # Use page_changed=true for first page
            data = fetch_json(session, current_path, referer, page_changed=(page == 1))
        except Exception as e:
            log_with_time(f"Error fetching page {page}: {e}", enable_logging)
            break

        # Find tileGridDesktop component in layout
        layout = data.get('layout', [])
        tile_state_id = None
        for item in layout:
            if isinstance(item, dict) and item.get('component') == 'tileGridDesktop':
                tile_state_id = item.get('stateId')
                break
        
        if not tile_state_id:
            log_with_time("No tileGridDesktop component found in layout", enable_logging)
            break

        # Extract products from widgetStates
        widget_states = data.get('widgetStates', {})
        tile_data_raw = widget_states.get(tile_state_id)
        
        if tile_data_raw:
            try:
                tile_data = json.loads(tile_data_raw)
                items = tile_data.get('items', [])
                page_urls = []
                
                for item in items:
                    link = item.get('action', {}).get('link')
                    if link and link.startswith('/product/'):
                        # Clean link and create full URL
                        url_clean = 'https://www.ozon.ru' + link.split('?')[0]
                        page_urls.append(url_clean)
                
                urls.extend(page_urls)
                log_with_time(f"Found {len(page_urls)} products on page {page}", enable_logging)
                
            except json.JSONDecodeError as e:
                log_with_time(f"Error parsing tile data: {e}", enable_logging)
        
        # Get next page
        next_page = data.get('nextPage')
        if not next_page:
            log_with_time("No nextPage found", enable_logging)
            break
            
        current_path = next_page
        referer = f'https://www.ozon.ru{next_page.split("?")[0]}'
        page += 1
        time.sleep(1)
        if page > PAGE_DEBUG_LIMIT:
            break

    return [{'url': url} for url in urls]


def fetch_product_htmls(product_urls: list, htmls_dir: str,
                        force_refetch: bool = False, enable_logging: bool = True,
                        parallel_downloads: int = 4):
    """Download HTML files for products that don't exist locally."""
    if not os.path.exists(htmls_dir):
        os.makedirs(htmls_dir)

    existing_htmls = set(os.listdir(htmls_dir))
    urls_to_fetch = []

    for product in product_urls:
        url = product['url'] if isinstance(product, dict) else product
        filename = get_safe_filename(url) + '.html'

        if force_refetch or filename not in existing_htmls:
            urls_to_fetch.append((url, os.path.join(htmls_dir, filename)))

    log_with_time(f"Found {len(urls_to_fetch)} HTML files to fetch", enable_logging)
    if not urls_to_fetch:
        return

    log_with_time(f"Starting parallel download with {parallel_downloads} workers", enable_logging)

    with ThreadPoolExecutor(max_workers=parallel_downloads) as executor:
        future_to_url = {executor.submit(download_page, url, filepath): url for url, filepath in urls_to_fetch}

        for i, future in enumerate(as_completed(future_to_url)):
            url = future_to_url[future]
            try:
                future.result()  # Will raise exception if download_page failed
                log_with_time(f"({i + 1}/{len(urls_to_fetch)}) Successfully fetched {url}", enable_logging)
            except Exception as exc:
                log_with_time(f"({i + 1}/{len(urls_to_fetch)}) Fetching {url} generated an exception: {exc}",
                              enable_logging)


def parse_product_html_enhanced(html_content: str, url: str, enable_logging: bool = True) -> dict:
    """Parse product data from HTML content with enhanced fields."""
    # Start with an empty template that already contains all required columns
    result = create_empty_product_record(url)

    # Prefill mock values kept from the previous implementation
    result['content'] = 'Mocked content'
    result['description'] = 'Mocked description'
    
    return result


def parse_product_htmls(htmls_dir: str, enable_logging: bool = True, specific_files: list = None) -> list:
    """Parse all HTML files in directory and extract product data."""
    if not os.path.exists(htmls_dir):
        return []
    
    html_files = specific_files if specific_files else os.listdir(htmls_dir)
    html_files = [f for f in html_files if f.endswith('.html')]
    
    products = []
    
    for i, filename in enumerate(html_files):
        filepath = os.path.join(htmls_dir, filename)
        log_with_time(f"Parsing HTML {i+1}/{len(html_files)}: {filename}", enable_logging)
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            # Reconstruct URL from filename
            product_slug = filename.replace('.html', '')
            url = f"https://www.ozon.ru/product/{product_slug}/"
            
            product_data = parse_product_html_enhanced(html_content, url, enable_logging)
            product_data['html_path'] = filename  # Track which HTML file was parsed
            products.append(product_data)
            
        except Exception as e:
            log_with_time(f"Error parsing {filename}: {e}", enable_logging)
    
    return products


def save_to_csv(products: list, csv_path: str):
    """Save products to CSV file with enhanced headers."""
    if not products:
        return
    
    # Build DataFrame – this will create columns as the union of all keys
    df = pd.DataFrame(products)

    # Replace NaNs with empty strings for nicer CSVs
    df = df.fillna('')

    # Column ordering: keep 'url' at the front, 'fetchErr' at the end, others
    # appear in between in their natural order of appearance.
    preferred_first = ['url']
    preferred_last = ['fetchErr'] if 'fetchErr' in df.columns else []

    middle_cols = [c for c in df.columns if c not in preferred_first + preferred_last]
    final_columns = preferred_first + middle_cols + preferred_last
    df = df[final_columns]
    df.to_csv(csv_path, index=False, encoding='utf-8')


def get_product_data_single(session: requests.Session, product_url: str, enable_logging: bool = True) -> dict:
    """
    Fetch and parse single product data (for --url mode).
    """
    log_with_time(f"Fetching single product: {product_url}", enable_logging)
    
    # Try API first
    try:
        parsed = urlparse(product_url)
        path = parsed.path
        referer = product_url

        data = None
        retries = 5
        delay = 0.5
        for i in range(retries):
            try:
                data = fetch_json(session, path + '?oos_search=false&miniapp=supermarket', referer)
                break  # Success
            except requests.exceptions.HTTPError as e:
                if e.response.status_code != 403 or i == retries - 1:
                    raise  # Re-raise if not 403 or it's the last retry
                
                log_with_time(f"Got 403 for {product_url}. Retrying in {delay}s... ({i+1}/{retries})", enable_logging)
                time.sleep(delay)
                delay *= 2

        result = create_empty_product_record(product_url)

        # Extract from widgetStates
        widgets = data.get('widgetStates', {})
        
        # Name from webProductHeading
        for key, val in widgets.items():
            if key.startswith('webProductHeading'):
                try:
                    heading_data = json.loads(val)
                    result['name'] = heading_data.get('title', '')
                except (json.JSONDecodeError, TypeError):
                    pass
                break
        
        # Nutrition info from webNutritionInfo
        nutrition_widget = None
        for key, val in widgets.items():
            if 'webNutritionInfo' in key:
                nutrition_widget = val
                break
        
        if nutrition_widget:
            try:
                nutrition_data = json.loads(nutrition_widget)
                values = nutrition_data.get('values', [])
                
                # Initialize nutrition fields
                result['proteins'] = ''
                result['fats'] = ''
                result['carbohydrates'] = ''
                result['calories'] = ''

                # True if any of pro, fats or carbs are provided
                pfc_present = False
                for item in values:
                    label = item.get('label', '').lower()
                    value = item.get('value', '')
                    
                    if 'белки' in label or 'protein' in label:
                        result['proteins'] = value
                    elif 'жиры' in label or 'fat' in label:
                        result['fats'] = value
                    elif 'углеводы' in label or 'carbohydrate' in label:
                        result['carbohydrates'] = value
                    elif 'ккал' in label or 'calorie' in label:
                        result['calories'] = value
                pfc_present = any(result['proteins'] or result['fats'] or result['carbohydrates'])
                # If true, set non-provided macros ('') to 0
                if pfc_present:
                    result['proteins'] = '0' if not result['proteins'] else result['proteins']
                    result['fats'] = '0' if not result['fats'] else result['fats']
                    result['carbohydrates'] = '0' if not result['carbohydrates'] else result['carbohydrates']

            except (json.JSONDecodeError, TypeError):
                log_with_time("Error parsing nutrition info", enable_logging)

        # Extract category path
        layout_dict_str = data.get('layoutTrackingInfo', "{}")
        layout_dict = json.loads(layout_dict_str)
        result['category'] = layout_dict.get('hierarchy', '').replace('/', '#')

        # Try to extract category from breadcrumbs if above didn't work:
        # widgetStates['breadCrumbs-3385917-default-1']="{"breadcrumbs":[{"text":"Ozon fresh","link":"/category/supermarket-25000/?miniapp=supermarket","crumbType":"CRUMB_TYPE_FULL_LINK","trackingInfo":{"click":{"actionType":"click","key":"79tnXgpwYc2z2OojiJvWj9DfAxDl14svLPgk3Hrz2rX7"}}},{"text":"Готовая еда","link":"/category/supermarket-gotovye-blyuda-9521000/?miniapp=supermarket","crumbType":"CRUMB_TYPE_FULL_LINK","trackingInfo":{"click":{"actionType":"click","key":"PjtJ1wGPncpwzBm6fB3xpynsVyprgzS5g1rAnfAq6v7p"}}},{"text":"Стритфуд","link":"/category/sushi-sendvichi-zakuski-95231000/?miniapp=supermarket","crumbType":"CRUMB_TYPE_FULL_LINK","trackingInfo":{"click":{"actionType":"click","key":"nRtrZEOkVuOpBPglhEB0g3rUDY6n8PSEKL91YFVPLMXE"}}},{"text":"I like eat","link":"/category/sushi-sendvichi-zakuski-95231000/i-like-eat-101090101/?miniapp=supermarket","crumbType":"CRUMB_TYPE_FULL_LINK","trackingInfo":{"click":{"actionType":"click","key":"mqtkoxJ9qhZpA6VKHykEKggTgozpRrC2jqBQzsk9Xl57"}}}],"connectSymbol":">","isFull":true}"
        # From here, category == "Ozon Fresh#Готовая еда#Стритфуд#I like eat"
        breadcrumbs_widget_raw = None
        for key, val in widgets.items():
            if key.startswith('breadCrumbs'):
                breadcrumbs_widget_raw = val
                break
        
        if breadcrumbs_widget_raw:
            try:
                breadcrumbs_data = json.loads(breadcrumbs_widget_raw)
                breadcrumbs = breadcrumbs_data.get('breadcrumbs', [])
                result['category'] = '#'.join([breadcrumb.get('text', '') for breadcrumb in breadcrumbs])
            except (json.JSONDecodeError, TypeError):
                log_with_time("Error parsing breadcrumbs", enable_logging)
        
        # Extract from script innerHTML (JSON-LD)
        scripts = data.get('seo', {}).get('script', [])
        for script in scripts:
            if script.get('type') == 'application/ld+json':
                try:
                    script_data = json.loads(script.get('innerHTML', '{}'))
                    
                    # Extract price
                    offers = script_data.get('offers', {})
                    if isinstance(offers, dict):
                        result['price'] = offers.get('price', '')
                        result['availability'] = '1' if offers.get('availability', '') == 'http://schema.org/InStock' else '0'
                    
                    # Extract rating info
                    rating = script_data.get('aggregateRating', {})
                    if isinstance(rating, dict):
                        result['average_rating'] = rating.get('ratingValue', '')
                        result['rating_count'] = rating.get('reviewCount', '')
                    
                    # Extract image URL
                    result['imgUrl'] = script_data.get('image', '')
                    
                    # Extract name if not already found
                    if not result.get('name'):
                        result['name'] = script_data.get('name', '')

                    # Extract description
                    description = script_data.get('description', '')
                    if description:
                        result['description'] = description
                        
                except (json.JSONDecodeError, TypeError):
                    log_with_time("Error parsing script JSON-LD", enable_logging)
                break

        # ---------------------------------------------------------------
        # Fetch extended description/characteristics (layout_page_index=2)
        # ---------------------------------------------------------------
        try:
            second_path = f"{path}?layout_container=pdpPage2column&layout_page_index=2&oos_search=false&miniapp=supermarket"
            data2 = fetch_json(session, second_path, referer)
            widgets2 = data2.get('widgetStates', {})

            description_widget_raw = None
            for key, val in widgets2.items():
                if key.startswith('webDescription'):
                    description_widget_raw = val
                    break

            if description_widget_raw:
                # print(f'{description_widget_raw=}')
                try:
                    description_data = json.loads(description_widget_raw)
                    characteristics = description_data.get('characteristics', [])
                    for item in characteristics:
                        title_lower = (item.get('title') or '').lower()
                        content_str = (item.get('content') or '').strip()
                        if not content_str:
                            continue

                        # Ingredients / composition
                        if 'состав' in title_lower or 'composition' in title_lower:
                            result['content'] = content_str

                    # (description fallback via lexemes removed per recent revision)
                except (json.JSONDecodeError, TypeError):
                    log_with_time("Error parsing extended description widget", enable_logging)

            # ----------------------------
            # Extract weight / volume (g)
            # ----------------------------
            characteristics_widget_raw = None
            for key, val in widgets2.items():
                if key.startswith('webCharacteristics'):
                    characteristics_widget_raw = val
                    break

            if characteristics_widget_raw:
                try:
                    char_data = json.loads(characteristics_widget_raw)
                    char_sections = char_data.get('characteristics', [])
                    weight_found = None

                    for section in char_sections:
                        short_items = section.get('short', [])
                        for item in short_items:
                            name_lower = (item.get('name') or '').lower()
                            key_lower = (item.get('key') or '').lower()

                            # Extract numeric text helper
                            def _extract_value(it):
                                vals = it.get('values', [])
                                if vals and isinstance(vals, list):
                                    return (vals[0].get('text') or '').strip()
                                return ''

                            if ('вес' in name_lower or 'weight' in key_lower or key_lower.startswith('weight')):
                                weight_found = _extract_value(item)
                            elif ('объем' in name_lower or 'volume' in key_lower or key_lower.startswith('volume')):
                                weight_found = _extract_value(item)

                            if weight_found:
                                break
                        if weight_found:
                            break

                    if weight_found:
                        # Normalize decimal comma to dot and keep only digits/dot
                        weight_clean = re.sub(r'[^0-9.,]', '', weight_found).replace(',', '.')
                        # Some weights might include units like 0.5 л, etc.
                        # Try to convert to grams assuming ml == g and l to ml*1000
                        try:
                            if 'л' in weight_found.lower():
                                num = float(re.sub(r'[^0-9.,]', '', weight_found).replace(',', '.')) * 1000
                                weight_clean = str(int(num))
                            result['weight'] = weight_clean
                        except Exception:
                            result['weight'] = weight_found  # fallback raw

                except (json.JSONDecodeError, TypeError):
                    log_with_time("Error parsing characteristics widget", enable_logging)
        except Exception as e:
            log_with_time(f"Error fetching extended description page: {e}", enable_logging)

        # Initialize other fields
        # Calculate pro/cal factor
        try:
            pro_cal_factor = float(result.get('proteins', 0)) / float(result.get('calories', 0)) if float(result.get('calories', 0)) > 0 else 0
            result['pro/cal'] = str(pro_cal_factor)
        except (ValueError, ZeroDivisionError):
            result['pro/cal'] = '0'

        # Calculate price/weight ratio
        try:
            price = float(result.get('price', 0))
            weight = float(result.get('weight', 0))
            price_per_100g = price / weight if weight > 0 else 0
            result['pri/we'] = str(price_per_100g)
        except (ValueError, ZeroDivisionError):
            result['pri/we'] = '0'

        result['html_path'] = ''
        result['last_upd_time'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        return result
        
    except Exception as e:
        log_with_time(f"API fetch failed, falling back to HTML parsing: {e}", enable_logging)
    
    # Fallback to HTML parsing
    try:
        log_with_time(f"Fetching with Selenium (mock): {product_url}", enable_logging)
        html_content = download_html_content(product_url)
        return parse_product_html_enhanced(html_content, product_url, enable_logging)
    except Exception as exc:
        log_with_time(f"Error fetching product with Selenium: {exc}", enable_logging)
        err_rec = create_empty_product_record(product_url)
        err_rec['fetchErr'] = str(exc)
        return err_rec


def main():
    parser = argparse.ArgumentParser("Ozon Fresh scraper tool")
    parser.add_argument('--url', help='Single product URL to scrape')
    parser.add_argument('--category-url', help='Category URL to scrape')
    parser.add_argument('--no-logging', action='store_true', help='Disable logging')
    
    parser.add_argument('--generate-urls', action='store_true', help='Generate product URLs')
    parser.add_argument('--update-urls', action='store_true', help='Update existing product URLs')
    
    parser.add_argument('--force-refetch', action='store_true', help='Force refetch of product HTMLs')
    parser.add_argument('--force-reparse', action='store_true', help='Force reparse of product HTMLs')
    parser.add_argument('--parallel-downloads', type=int,
                        default=1,
                        # default=os.cpu_count(), # Can't stop getting 403s
                        help='Number of parallel downloads for HTMLs')
    
    args = parser.parse_args()
    enable_logging = not args.no_logging

    log_with_time("Starting the Ozon scraper...", enable_logging)

    session = requests.Session()

    if args.url:
        # Single product mode
        product_data = get_product_data_single(session, args.url, enable_logging)
        print(json.dumps(product_data, ensure_ascii=False, indent=2))
        return

    if args.category_url:
        # Category mode - REVISED pipeline
        category_url = args.category_url
        category_name = get_category_name_from_url(category_url)
        log_with_time(f"Starting extraction process for category: {category_name}", enable_logging)
        start_time = time.time()

        # Create directories and filenames based on category name
        data_dir = "./data"
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)

        category_dir = f"./data/{category_name}"
        if not os.path.exists(category_dir):
            os.makedirs(category_dir)

        output_csv = f"{category_dir}/{category_name}_detailed.csv"
        product_urls_csv = f"{category_dir}/{category_name}_product_urls.csv"

        # STEP 1: Prepare product URLs
        existing_products_list = load_product_urls(product_urls_csv)
        product_urls = []
        
        if args.generate_urls or not existing_products_list:
            log_with_time("Generating product URLs from the website.", enable_logging)
            product_urls = get_product_urls(session, category_url, enable_logging)
            if product_urls:
                save_product_urls(product_urls, product_urls_csv)
                log_with_time(f"Saved {len(product_urls)} product URLs to {product_urls_csv}", enable_logging)
        elif args.update_urls:
            log_with_time("Updating existing product URLs.", enable_logging)
            # Get all currently existing product URLs, freshly from the website
            all_product_urls = get_product_urls(session, category_url, enable_logging)
            # Compare with existing product URLs and update the ones that are missing
            existing_urls_set = {p['url'] for p in existing_products_list}
            new_product_urls = [p for p in all_product_urls if p['url'] not in existing_urls_set]
            log_with_time(f"Found {len(new_product_urls)} new product URLs.", enable_logging)
            existing_products_list.extend(new_product_urls)
            save_product_urls(existing_products_list, product_urls_csv)
            product_urls = existing_products_list
        else:
            product_urls = existing_products_list
            log_with_time(f"Found {len(product_urls)} existing products in {product_urls_csv}", enable_logging)

        urls_to_process = [p['url'] for p in product_urls]
        if not urls_to_process:
            log_with_time("No product URLs found. Exiting.", enable_logging)
            return

        # STEP 2: Fetch product data from API in parallel
        log_with_time(f"Fetching data for {len(urls_to_process)} products from API...", enable_logging)
        
        all_products_data = []
        with ThreadPoolExecutor(max_workers=args.parallel_downloads) as executor:
            future_to_url = {executor.submit(get_product_data_single, session, url, enable_logging): url for url in urls_to_process}
            
            for i, future in enumerate(as_completed(future_to_url)):
                url = future_to_url[future]
                try:
                    product_data = future.result()
                    all_products_data.append(product_data)
                    log_with_time(f"({i + 1}/{len(urls_to_process)}) Successfully processed {url}", enable_logging)
                except Exception as exc:
                    log_with_time(f"({i + 1}/{len(urls_to_process)}) Processing {url} generated an exception: {exc}", enable_logging)
                    err_rec = create_empty_product_record(url)
                    err_rec['fetchErr'] = str(exc)
                    all_products_data.append(err_rec)
        
        # STEP 3: Save to CSV
        save_to_csv(all_products_data, output_csv)
        log_with_time(f"Process completed. Saved {len(all_products_data)} products to {output_csv}", enable_logging)
        
        end_time = time.time()
        log_with_time(f"Whole extraction process took {end_time - start_time:.2f} seconds.", enable_logging)

        return

    parser.print_help()


if __name__ == '__main__':
    main()