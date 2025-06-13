import csv
import sys
import os
import logging
import signal
import random
import time
from datetime import datetime

# Global flag for graceful termination
should_stop = False

def signal_handler(signum, frame):
    """Handle termination signals"""
    global should_stop
    should_stop = True
    print("Received termination signal, stopping gracefully...", file=sys.stderr)
    sys.exit(1)

def setup_logging():
    """Set up logging configuration"""
    try:
        log_file = os.path.join(os.path.dirname(__file__), 'debug.log')
        
        # Configure logging to file only
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[logging.FileHandler(log_file)],
            force=True  # Override any existing configuration
        )
        
        # Log initial setup message
        logging.info('Logging setup completed successfully')
        return True
    except Exception as e:
        print(f"Failed to setup logging: {str(e)}", file=sys.stderr)
        return False

def main():
    # Set up signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    # Setup logging
    if not setup_logging():
        print("Failed to setup logging, but continuing...", file=sys.stderr)
    
    # Log script start
    logging.info(f"Script started with arguments: {sys.argv}")
    print(f"Script started with arguments: {sys.argv}", file=sys.stderr)
    
    if len(sys.argv) != 2:
        logging.error("Usage: python script.py <csv_file>")
        print("Usage: python script.py <csv_file>", file=sys.stderr)
        sys.exit(1)
    
    csv_file = sys.argv[1]
    logging.info(f"Processing CSV file: {csv_file}")
    print(f"Processing CSV file: {csv_file}", file=sys.stderr)
    
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            logging.info(f"Successfully read {len(rows)} rows from CSV")
            print(f"Successfully read {len(rows)} rows from CSV", file=sys.stderr)
            
            # Find URL column
            url_column = None
            for col in reader.fieldnames:
                if col.lower() == 'url':
                    url_column = col
                    break
            
            if not url_column:
                logging.error("No URL column found in CSV")
                print("No URL column found in CSV", file=sys.stderr)
                sys.exit(1)
            
            logging.info(f"Found URL column: {url_column}")
            print(f"Found URL column: {url_column}", file=sys.stderr)
            
            # Process each row
            for i, row in enumerate(rows, 1):
                if should_stop:
                    logging.info("Stopping due to termination signal")
                    print("Stopping due to termination signal", file=sys.stderr)
                    sys.exit(1)
                
                url = row[url_column]
                # Simulate random availability
                availability = random.randint(0, 10)
                logging.debug(f"Processing row {i}: URL={url}, Availability={availability}")
                print(f"Processing row {i}: URL={url}, Availability={availability}", file=sys.stderr)
                
                # Update the row
                row['availability'] = str(availability)
                row['last_update'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                
                # Simulate some processing time
                time.sleep(0.1)
                
                # Emit availability info to stdout for downstream consumers
                print(f"{url} {availability}", flush=True)
            
            # Determine writer fieldnames (preserve original order, add new ones)
            writer_fieldnames = reader.fieldnames.copy()
            for extra in ("availability", "last_update"):
                if extra not in writer_fieldnames:
                    writer_fieldnames.append(extra)
            
            # Write back to CSV
            with open(csv_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=writer_fieldnames)
                writer.writeheader()
                writer.writerows(rows)
            
            logging.info("Script completed successfully")
            print("Script completed successfully", file=sys.stderr)
            
    except Exception as e:
        logging.error(f"Error processing CSV: {str(e)}")
        print(f"Error processing CSV: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 