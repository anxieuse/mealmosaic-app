import threading
import aiohttp
import asyncio
from bs4 import BeautifulSoup
import pandas as pd
import re
import time
from datetime import datetime
import json
import argparse
import os
from multiprocessing import Pool, cpu_count
from functools import partial
from tqdm import tqdm
from tqdm.asyncio import tqdm as atqdm

def log_with_time(message, enable_logging=True):
    """Log messages with a timestamp."""
    if enable_logging:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_message = f"[{timestamp}] {message}"
        print(log_message)
        with open('vkusvill.log', 'at', encoding='utf-8') as f:
            f.write(log_message + '\n')

def log_to_file_only(message):
    """Log messages only to file, not to console."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_message = f"[{timestamp}] {message}"
    with open('vkusvill.log', 'a', encoding='utf-8') as f:
        f.write(log_message + '\n')

def read_cookies(file_path):
    """Read cookies from a JSON file.

    The file can be either:
    1. A list of cookie dictionaries produced by browser extensions or this script.
    2. A Playwright storage_state JSON with a top-level key ``cookies``.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)

            # If the file is a Playwright storage_state, extract the list
            if isinstance(data, dict) and 'cookies' in data:
                cookies_list = data['cookies']
            else:
                cookies_list = data

            # Convert list of cookie dicts to the {name: value} mapping expected by aiohttp
            return {cookie['name']: cookie['value'] for cookie in cookies_list if 'name' in cookie and 'value' in cookie}
    except Exception as e:
        log_with_time(f"Failed to read cookies from {file_path}: {e}")
        return {}

def debug_print_product(product_data, enable_logging=True):
    """Debug print product details"""
    if enable_logging:
        print("\n=== Product Details ===")
        for key, value in product_data.items():
            print(f"{key}: {value}")
        print("=====================\n")

async def fetch_page_content(session, url):
    """Fetches content of the page with user-specified cookies."""
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        async with session.get(url, headers=headers) as response:
            if response.status == 200:
                return await response.text()
            else:
                log_with_time(f"Failed to fetch {url}: {response.status}")
                return None
    except Exception as e:
        log_with_time(f"Exception occurred while fetching {url}: {e}")
        return None

async def fetch_and_parse_page(session, url, semaphore):
    """Fetches and parses a single page of products."""
    async with semaphore:
        content = await fetch_page_content(session, url)
        if not content:
            return []

        soup = BeautifulSoup(content, 'lxml')
        product_cards = soup.find_all('div', class_='ProductCards__item ProductCards__item--col-lg-1-3')
        products = []

        for card in product_cards:
            try:
                # name = card.find('span', itemprop='name').get_text(strip=True)
                # weight = card.find('div', class_='ProductCard__weight').get_text(strip=True)
                # price = card.find('meta', itemprop='price')['content']
                # description = card.find('span', itemprop='description').get_text(strip=True)
                product_url = card.find('a', class_='js-product-detail-link')['href']
                full_url = f"https://vkusvill.ru{product_url}"

                products.append({
                    # 'name': name,
                    # 'weight': weight,
                    # 'price': price,
                    # 'description': description,
                    'url': full_url
                })
            except Exception as e:
                log_with_time(f"Error parsing product card: {e}")
                continue

        return products

async def extract_products_from_category(session, category_url, enable_logging=True):
    """Extracts all products from the specified category asynchronously."""
    products = []
    page = 1
    url = f"{category_url}?PAGEN_1={page}"
    log_with_time(f"Fetching page {page} of category: {category_url}", enable_logging)

    content = await fetch_page_content(session, url)
    if not content:
        return products

    soup = BeautifulSoup(content, 'lxml')

    # Extract total pages
    pagination = soup.find('div', class_='VV_Pager js-lk-pager')
    if pagination:
        page_links = pagination.find_all('a', {'data-page': True})
        if page_links:
            total_pages = max([int(link['data-page']) for link in page_links if link['data-page'].isdigit()])
        else:
            total_pages = 1
    else:
        total_pages = 1

    log_with_time(f"Total pages found: {total_pages}", enable_logging)

    # Generate page URLs
    page_urls = [f"{category_url}?PAGEN_1={i}" for i in range(1, total_pages + 1)]

    # Create tasks to fetch all pages
    semaphore = asyncio.Semaphore(10)
    tasks = [fetch_and_parse_page(session, url, semaphore) for url in page_urls]
    results = await asyncio.gather(*tasks)

    # Collect products
    for result in results:
        products.extend(result)

    log_with_time(f"Total products found: {len(products)}", enable_logging)
    return products

def load_product_urls(product_urls_csv):
    """Load product URLs from CSV if it exists."""
    try:
        df = pd.read_csv(product_urls_csv)
        return df.to_dict('records')
    except FileNotFoundError:
        return None

def save_product_urls(products, product_urls_csv):
    """Save product URLs to CSV."""
    df = pd.DataFrame(products)
    # df.to_csv(product_urls_csv, index=False, encoding='utf-8-sig')
    # Remove duplicates
    log_with_time(f"Found {len(df)} product URLs in {product_urls_csv}")
    df = df.drop_duplicates(subset=['url'])
    log_with_time(f"After removing duplicates: {len(df)} product URLs")
    df.to_csv(product_urls_csv, index=False, encoding='utf-8-sig')
    log_with_time(f"Saved {len(df)} product URLs to {product_urls_csv}")

def save_to_csv(data, file_name):
    """Saves extracted data to a CSV file."""
    # Sort data by 'pro/cal' descending
    data.sort(key=lambda x: x.get('pro/cal', 0), reverse=True)
    df = pd.DataFrame(data)
    df.to_csv(file_name, index=False, encoding='utf-8-sig')
    log_with_time(f"Saved to {file_name}")

def get_product_filename(url):
    """Generate a safe filename from the product URL."""
    filename = url.rstrip('/').split('/')[-1]
    filename = filename.split('?')[0].split('#')[0]
    filename = re.sub(r'[^\w\-_\. ]', '_', filename)
    return filename

def process_weight(weight_text):
    """Process the weight field to extract numerical value in grams."""
    weight_text = weight_text.replace(' ', '').replace(',', '.').lower()
    match = re.match(r'([\d\.]+)(.*)', weight_text)
    if match:
        value = float(match.group(1))
        unit = match.group(2)
        if unit in ['г', 'г.', 'гр', 'гр.', 'грамм', 'грамм.']:
            return value
        elif unit in ['мл', 'мл.', 'миллилитр', 'миллилитров']:
            return value
        elif unit in ['кг', 'кг.', 'килограмм', 'килограмм.']:
            return value * 1000
        elif unit in ['л', 'л.', 'литр', 'литров']:
            return value * 1000
        else:
            return value  # Unknown unit, return value as is
    else:
        try:
            return float(weight_text)
        except ValueError:
            return 1000  # Default value

async def fetch_and_save_product_htmls(session, products, prod_htmls_dir, enable_logging=True):
    """Fetch and save product HTMLs into specified directory."""
    if not os.path.exists(prod_htmls_dir):
        os.makedirs(prod_htmls_dir)

    semaphore = asyncio.Semaphore(10)

    async def fetch_and_save(product, semaphore):
        async with semaphore:
            url = product#['url']
            filename = get_product_filename(url)
            filepath = f"{prod_htmls_dir}/{filename}"

            content = await fetch_page_content(session, url)
            if content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                log_to_file_only(f"Saved HTML for {url} to {filepath}")
            else:
                log_to_file_only(f"Failed to fetch content for {url}")

    tasks = [fetch_and_save(product, semaphore) for product in products]
    
    # Use tqdm progress bar for async tasks
    if enable_logging and len(products) > 0:
        log_with_time(f"Downloading {len(products)} HTML files...", enable_logging)
        await atqdm.gather(*tasks, desc="Downloading HTMLs")
    else:
        await asyncio.gather(*tasks)

def parse_product_htmls(prod_htmls_dir, enable_logging=True, specific_files=None):
    """Parse product HTML files from specified directory."""
    detailed_products = []
    
    if specific_files is not None:
        html_files = specific_files
    else:
        html_files = os.listdir(prod_htmls_dir)

    total_files = len(html_files)
    if total_files == 0:
        log_with_time(f"No HTML files found in {prod_htmls_dir}.", enable_logging)
        return detailed_products

    # Prepare for multiprocessing
    num_processes = min(cpu_count(), 4)  # Limit to 4 processes or CPU count, whichever is lower

    parse_partial = partial(parse_product_html_wrapper, prod_htmls_dir=prod_htmls_dir, enable_logging=False)

    with Pool(processes=num_processes) as pool:
        # Use tqdm for progress bar
        results = list(tqdm(pool.imap_unordered(parse_partial, html_files), total=total_files, desc="Parsing HTMLs"))

    # Filter out None results and products with calories == 100500
    # detailed_products = [res for res in results if res and res.get('calories') != 100500]
    detailed_products = results # [res for res in results if res and res.get('calories') != 100500]

    return detailed_products

def parse_product_html_wrapper(filename, prod_htmls_dir, enable_logging=False):
    """Wrapper function to parse a single HTML file, for multiprocessing."""
    filepath = os.path.join(prod_htmls_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        # Reconstruct the URL
        base_url = 'https://vkusvill.ru/goods/'
        product_name = filename[:-5]  # Remove '.html' extension
        product_url = f"{base_url}{product_name}.html"
        product_data = parse_product_html(content, product_url, enable_logging=enable_logging)
        if product_data:
            product_data['html_path'] = filename
        return product_data

def parse_product_html(content, product_url, category_name=None, enable_logging=True):
    """Parse HTML content and extract product data."""
    soup = BeautifulSoup(content, 'lxml')

    # Extract basic information
    try:
        name = soup.find('h1', class_='Product__title').get_text(strip=True)
    except AttributeError:
        name = ""

    # Extract weight
    try:
        weight_text = soup.find('div', class_='ProductCard__weight').get_text(strip=True)
        weight = process_weight(weight_text)
    except AttributeError:
        weight = 1000

    # Extract price
    try:
        price = soup.find('meta', itemprop='price')['content']
    except (AttributeError, TypeError):
        price = ""

    # Extract image
    try:
        image_url = soup.find('meta', itemprop='image')['content']
    except (AttributeError, TypeError):
        image_url = ""

    # Extract description
    try:
        description = soup.find('div', class_='VV23_DetailProdPageDescription').get_text(strip=True)
        description = re.sub(r'^Описание', '', description).strip()
    except AttributeError:
        description = ""

    # Extract availability
    try:
        availability_block = soup.find('div', id='product-quantity-block')
        if availability_block and 'not_avail' not in (availability_block.get('class') or []):
            # Primary method – use the data attribute if present
            data_qty = availability_block.get('data-quantity')
            if data_qty is not None and data_qty != "":
                is_available = int(float(data_qty))
            else:
                # Fallback – extract first integer from the text content
                text_qty_match = re.search(r"(\d+)", availability_block.get_text(strip=True))
                is_available = int(text_qty_match.group(1)) if text_qty_match else 0
            
            # Check if it's "в наличии" or "завтра будет"
            # <div class="ProductLkRest rtext _desktop-sm _tablet-sm _mobile-sm" id="product-quantity-block" data-quantity="3">                  В&nbsp;наличии 3&nbsp;шт            </div>
            # <div class="ProductLkRest _tomorrow rtext _desktop-sm _tablet-sm _mobile-sm" id="product-quantity-block" data-quantity="66">                  Завтра будет 66&nbsp;шт            </div>
            # If "завтра будет" is present, set is_available to 0
            if "Завтра" in availability_block.get_text(strip=True):
                is_available = 0
        else:
            is_available = 0  # Explicitly marked as not available
    except Exception as e:
        if enable_logging:
            log_with_time(f"Error extracting availability: {e}", enable_logging)
        is_available = 0

    # Extract nutrition information
    calories, proteins, fats, carbohydrates = 0, 0, 0, 0
    try:
        nutrition_info = soup.find('div', class_='VV23_DetailProdPageAccordion__Energy')
        if nutrition_info:
            values = nutrition_info.find_all('div', class_='VV23_DetailProdPageAccordion__EnergyValue')
            descs = nutrition_info.find_all('div', class_='VV23_DetailProdPageAccordion__EnergyDesc')

            for value, desc in zip(values, descs):
                value_text = value.get_text(strip=True).replace(',', '.')
                desc_text = desc.get_text(strip=True).lower()

                try:
                    value_float = float(value_text)
                    if 'ккал' in desc_text:
                        calories = value_float
                    elif 'белки' in desc_text:
                        proteins = value_float
                    elif 'жиры' in desc_text:
                        fats = value_float
                    elif 'углеводы' in desc_text:
                        carbohydrates = value_float
                except ValueError:
                    continue

        # Alternative extraction if no values found
        if calories == 0 and proteins == 0 and fats == 0 and carbohydrates == 0:
            # Additional fallback extraction using alternative regex patterns (alt-alt extraction)
            alt_blocks = soup.find_all('div', class_='VV23_DetailProdPageInfoDescItem')
            alt_nutrition_text = None
            for block in alt_blocks:
                # The title can be either a <h4> or <div> depending on markup version
                h4 = block.find(['h4', 'div'], class_='VV23_DetailProdPageInfoDescItem__Title')
                if h4 and "Пищевая и энергетическая ценность" in h4.get_text(strip=True).replace('\xa0', ' '):
                    desc_div = block.find('div', class_='VV23_DetailProdPageInfoDescItem__Desc')
                    if desc_div:
                        alt_nutrition_text = desc_div.get_text(strip=True)
                        break

            if alt_nutrition_text:
                # 1) Пытаемся найти все подпоследовательности «белки X г … жиры Y г … Z ккал»
                triple_pattern = re.compile(
                    r'белки\s+([\d\.,]+)\s*г[^\d]*'
                    r'жиры\s+([\d\.,]+)\s*г[^\d]*'
                    r'([\d\.,]+)\s*(?:ккал|кал)',
                    re.IGNORECASE,
                )

                candidates = []  # (kcal, protein, fat, carbs)
                for m in triple_pattern.finditer(alt_nutrition_text):
                    pro_val  = float(m.group(1).replace(',', '.'))
                    fat_val  = float(m.group(2).replace(',', '.'))
                    kcal_val = float(m.group(3).replace(',', '.'))
                    candidates.append((kcal_val, pro_val, fat_val, 0.0))

                # Если ничего не нашли по «тройному» паттерну, возвращаемся к старому сплиту
                if not candidates:
                    segments = [seg.strip() for seg in re.split(r'[\.\u2026\u00A0]+', alt_nutrition_text) if seg.strip()]
                    for seg in segments:
                        kcal_m = re.search(r'([\d\.,]+)\s*(?:ккал|кал)', seg, re.IGNORECASE)
                        if not kcal_m:
                            continue
                        kcal_val = float(kcal_m.group(1).replace(',', '.'))
                        pro_m  = re.search(r'белки\s+([\d\.,]+)', seg, re.IGNORECASE)
                        fat_m  = re.search(r'жиры\s+([\d\.,]+)',  seg, re.IGNORECASE)
                        carb_m = re.search(r'углеводы\s+([\d\.,]+)', seg, re.IGNORECASE)

                        pro_val  = float(pro_m.group(1).replace(',', '.')) if pro_m else 0.0
                        fat_val  = float(fat_m.group(1).replace(',', '.')) if fat_m else 0.0
                        carb_val = float(carb_m.group(1).replace(',', '.')) if carb_m else 0.0
                        candidates.append((kcal_val, pro_val, fat_val, carb_val))

                if candidates:
                    best = sorted(candidates, key=lambda t: (-t[0], t[1]))[0]
                    calories, proteins, fats, carbohydrates = best
                    name = "!!" + name

    except Exception as e:
        if enable_logging:
            log_with_time(f"Error extracting nutrition info: {e}", enable_logging)

    # If calories are still zero but macros are present, estimate calories from macros
    if all(isinstance(val, (int, float)) for val in (calories, proteins, fats, carbohydrates)) and calories == 0:
        calories = 4 * proteins + 9 * fats + 4 * carbohydrates

    # Set macros to default if all are 0 or ""
    if (calories == 0 or calories == "") and (proteins == 0 or proteins == "") and \
       (fats == 0 or fats == "") and (carbohydrates == 0 or carbohydrates == ""):
        calories = proteins = fats = carbohydrates = ""

    # Extract composition
    try:
        composition = soup.find('div', class_='Product__text--composition').get_text(strip=True)
        composition = re.sub(r'^Состав', '', composition).strip()
    except AttributeError:
        composition = ""

    # Extract ratings
    try:
        rating_value = soup.find('div', class_='Rating__text').get_text(strip=True)
    except AttributeError:
        rating_value = ""

    try:
        rating_count = soup.find('div', class_='VV23_DetailProdPageInfoTabs__HeaderTogglerCount').get_text(strip=True)
    except AttributeError:
        rating_count = ""

    # Calculate pro/cal factor
    try:
        pro_cal_factor = float(proteins) / float(calories) if float(calories) > 0 else 0
    except (ValueError, ZeroDivisionError):
        pro_cal_factor = 0

    # Calculate price/weight ratio
    try:
        price = float(price)
        price_per_100g = price / weight
    except (ValueError, ZeroDivisionError):
        price_per_100g = 0

    # Extract category from hidden span
    try:
        category_span = soup.find('span', class_='js-datalayer-catalog-list-category')
        if category_span:
            category_text = category_span.get_text(strip=True).replace('//', '#')
        else:
            category_text = category_name or ""
    except Exception:
        category_text = category_name or ""

    product_data = {
        'url': product_url,
        'name': name,
        'pri/we': price_per_100g,
        'pro/cal': pro_cal_factor,
        'weight': weight,
        'price': price,
        'calories': calories,
        'proteins': proteins,
        'fats': fats,
        'carbohydrates': carbohydrates,
        'content': composition,
        'description': description,
        'availability': is_available,
        'last_upd_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'category': category_text,
        'average_rating': rating_value,
        'rating_count': rating_count,
        'imgUrl': image_url,
    }

    return product_data

def parse_args():
    parser = argparse.ArgumentParser(description='Scrape product information from VkusVill')
    parser.add_argument('--url', help='Single product URL to scrape')
    parser.add_argument('--category-url', help='Category URL to scrape')
    parser.add_argument('--no-logging', action='store_true', help='Disable logging')

    # Cookie management
    parser.add_argument('--setup-cookies', metavar='COOKIES_PATH', help='Open browser, log in, then save cookies to COOKIES_PATH and exit')
    parser.add_argument('--cookies', metavar='COOKIES_PATH', help='Load cookies from COOKIES_PATH instead of the default msk_v2.json')

    parser.add_argument('--generate-urls', action='store_true', help='Generate product URLs')
    parser.add_argument('--update-urls', action='store_true', help='Update existing product URLs')

    parser.add_argument('--force-refetch', action='store_true', help='Force refetch of product HTMLs')
    
    parser.add_argument('--force-reparse', action='store_true', help='Force reparse of product HTMLs')

    # New mode: check availability of products listed in a CSV file
    parser.add_argument('--check-availability', metavar='CSV_PATH', help='CSV file with "url" column to check product availability')

    return parser.parse_args()

async def main():
    args = parse_args()
    enable_logging = not args.no_logging

    log_with_time("Starting the script...", enable_logging)

    # --setup-cookies : interactive browser flow, then exit
    if args.setup_cookies:
        await async_setup_cookies(args.setup_cookies, enable_logging)
        return

    # Decide which cookie file to use when making HTTP requests
    cookie_file = args.cookies if args.cookies else "cookies.json"
    if os.path.exists(cookie_file):
        cookies = read_cookies(cookie_file)
        log_with_time(f"Loaded cookies from {cookie_file}", enable_logging)
    else:
        log_with_time(f"Cookie file {cookie_file} not found – continuing without cookies", enable_logging)
        cookies = {}

    headers = {'User-Agent': 'Mozilla/5.0'}

    async with aiohttp.ClientSession(
        cookies=cookies,
        headers=headers,
        ) as session:
        # New mode: Check availability and exit
        if args.check_availability:
            await check_availability_from_csv(session, args.check_availability, enable_logging)
            return

        if args.url:
            # Single product mode
            log_with_time(f"Fetching single product: {args.url}", enable_logging)
            content = await fetch_page_content(session, args.url)
            # Dump content to file ./single_product.html
            # with open('./single_product.html', 'w', encoding='utf-8') as f:
                # f.write(content)
            if content:
                product_data = parse_product_html(content, args.url, enable_logging=enable_logging)
                if product_data:
                    debug_print_product(product_data, enable_logging=True)  # Always print details in single product mode
        else:
            # Category mode
            category_url = args.category_url or "https://vkusvill.ru/goods/gotovaya-eda/"
            category_name = category_url.rstrip('/').split('/')[-1]  # Use the last part of the URL as category name
            log_with_time(f"Starting extraction process for category: {category_name}", enable_logging)
            start_time = time.time()

            # Create data directory if it doesn't exist
            data_dir = "./data"
            if not os.path.exists(data_dir):
                os.makedirs(data_dir)

            # Create directories and filenames based on category name
            category_dir = f"./data/{category_name}"
            if not os.path.exists(category_dir):
                os.makedirs(category_dir)

            prod_htmls_dir = f"{category_dir}/htmls"
            if not os.path.exists(prod_htmls_dir):
                os.makedirs(prod_htmls_dir)

            product_urls_csv = f"{category_dir}/{category_name}_product_urls.csv"

            # STEP 1: Prepare product URLs
            existing_products = load_product_urls(product_urls_csv)
            new_product_urls = []
            product_urls = []
            if args.generate_urls or not existing_products:
                log_with_time("Generating product URLs from the website.", enable_logging)
                product_urls = await extract_products_from_category(session, category_url, enable_logging)
                if product_urls:
                    save_product_urls(product_urls, product_urls_csv)
            elif args.update_urls:
                log_with_time("Updating existing product URLs.", enable_logging)
                # Get all currently existing product URLs, freshly from the website
                all_product_urls = await extract_products_from_category(session, category_url, enable_logging)
                # Compare with existing product URLs and update the ones that are missing
                existing_products_urls = [p['url'] for p in existing_products]
                for product in all_product_urls:
                    if product['url'] not in existing_products_urls:
                        new_product_urls.append(product)
                log_with_time(f"Found {len(new_product_urls)} new product URLs.", enable_logging)
                existing_products.extend(new_product_urls)
                save_product_urls(existing_products, product_urls_csv)
            else:
                product_urls = existing_products
                log_with_time(f"Found {len(product_urls)} existing products in {product_urls_csv}", enable_logging)
            
            # STEP 2: Save product HTMLs
            existing_htmls = os.listdir(prod_htmls_dir)
            product_urls_safenames_n_urls = [(get_product_filename(product['url']), product['url']) for product in product_urls]
            urls_to_fetch = [u for sn, u in product_urls_safenames_n_urls if sn not in existing_htmls]
            if args.force_refetch:
                urls_to_fetch = [product['url'] for product in product_urls]

            log_with_time(f"Found {len(urls_to_fetch)} new URLs to fetch.", enable_logging)
            await fetch_and_save_product_htmls(session, urls_to_fetch, prod_htmls_dir, enable_logging)

            # STEP 3: Parse the product HTML files
            output_csv = f"{category_dir}/{category_name}_detailed.csv"
            existing_products = []
            if os.path.exists(output_csv):
                try:
                    existing_products = pd.read_csv(output_csv).to_dict('records')
                    log_with_time(f"Found {len(existing_products)} existing products in {output_csv}", enable_logging)
                except pd.errors.EmptyDataError:
                    log_with_time(f"Existing CSV file {output_csv} is empty. Treating as new file.", enable_logging)
                    existing_products = []
                except Exception as e:
                    log_with_time(f"Error reading existing CSV file {output_csv}: {e}. Treating as new file.", enable_logging)
                    existing_products = []
            else:
                log_with_time(f"No existing detailed CSV found. Creating new file: {output_csv}", enable_logging)

            if args.force_reparse:
                log_with_time("Force reparse specified. Parsing all HTML files.", enable_logging)
                detailed_products = parse_product_htmls(prod_htmls_dir, enable_logging)
            else:
                # Get list of HTML files that have already been parsed
                existing_html_paths = set()
                if existing_products:
                    # Check if html_path column exists in existing data
                    if existing_products and 'html_path' in existing_products[0]:
                        existing_html_paths = {p['html_path'] for p in existing_products if p.get('html_path')}
                    else:
                        log_with_time("No html_path column found in existing CSV. This might be an older version.", enable_logging)
                
                # Get all HTML files in directory
                all_html_files = os.listdir(prod_htmls_dir)
                
                # Find HTML files that haven't been parsed yet
                new_html_files = [f for f in all_html_files if f not in existing_html_paths]
                
                log_with_time(f"Found {len(new_html_files)} HTML files to parse (out of {len(all_html_files)} total).", enable_logging)
                
                if new_html_files:
                    detailed_products = parse_product_htmls(prod_htmls_dir, enable_logging, specific_files=new_html_files)
                    log_with_time(f"Parsed {len(detailed_products)} new products.", enable_logging)
                else:
                    detailed_products = []
                    log_with_time("No new HTML files to parse.", enable_logging)

            end_time = time.time()
            log_with_time(f"Whole extraction process took {end_time - start_time:.2f} seconds.", enable_logging)

            if args.force_reparse:
                save_to_csv(detailed_products, output_csv)
                log_with_time(f"Force reparse completed. Saved {len(detailed_products)} products to {output_csv}", enable_logging)
            else:
                combined_products = existing_products + detailed_products
                save_to_csv(combined_products, output_csv)
                log_with_time(f"Extraction process completed. Appended {len(detailed_products)} new products to {output_csv}. Total: {len(combined_products)}", enable_logging)

async def check_availability_from_csv(session, csv_path, enable_logging=True):
    """Read a CSV containing a 'url' column and print <url>,<availability> for each product."""
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        log_with_time(f"Failed to read CSV file {csv_path}: {e}", enable_logging)
        return

    if 'url' not in df.columns:
        log_with_time(f"CSV file {csv_path} must contain a 'url' column.", enable_logging)
        return

    urls = df['url'].dropna().tolist()
    if not urls:
        log_with_time(f"No URLs found in the 'url' column of {csv_path}", enable_logging)
        return

    semaphore = asyncio.Semaphore(10)

    async def process_url(url):
        async with semaphore:
            availability = 0
            content = await fetch_page_content(session, url)
            if content:
                product_data = parse_product_html(content, url, enable_logging=False)
                if product_data:
                    availability = product_data.get('availability', 0)
            # Print result immediately
            print(f"{url} {availability}", flush=True)

    # Launch tasks concurrently
    tasks = [asyncio.create_task(process_url(u)) for u in urls]
    await asyncio.gather(*tasks)

# ============================================================
# Cookie setup helper (interactive – opens real browser)      
# ============================================================

async def async_setup_cookies(output_path, enable_logging=True):
    """Interactive cookie setup using Playwright.

    Opens ``https://vkusvill.ru/`` in a real (non-headless) Chromium window. The user can log in,
    select a shop / delivery address, or perform any other actions that affect the session.
    Once finished, the user presses <Enter> in the terminal and the current browser cookies are
    saved to *output_path* in Playwright ``storage_state`` JSON format (fully compatible with
    ``read_cookies``).
    """

    try:
        from playwright.async_api import async_playwright  # type: ignore
    except ImportError:
        log_with_time(
            "Playwright is not installed. Run `pip install playwright` and then `playwright install`.",
            enable_logging,
        )
        return

    log_with_time("Launching Chromium for interactive cookie setup…", enable_logging)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        # Navigate to the website so that cookies for this origin are created.
        await page.goto("https://vkusvill.ru/")

        # Let the user interact.
        log_with_time(
            "Browser window opened. Log in, set delivery address, etc. When done, return to the "
            "terminal and press <Enter> to save cookies.",
            enable_logging,
        )

        # Wait for the user to press Enter without blocking the event loop.
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: input())

        # Gather cookies and save them.
        storage_state = await context.storage_state()
        cookies = storage_state.get('cookies', [])

        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, ensure_ascii=False, indent=2)
            log_with_time(f"Saved {len(cookies)} cookies to {output_path}", enable_logging)
        except Exception as e:
            log_with_time(f"Failed to write cookies to {output_path}: {e}", enable_logging)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())