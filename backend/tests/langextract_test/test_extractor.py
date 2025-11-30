import os
import csv
import json
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import langextract as lx
import google.generativeai as genai
from dotenv import load_dotenv
from googlesearch import GoogleSearch

# --- Configuration ---
load_dotenv(dotenv_path='C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper/.env')
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file.")
if not MODEL_NAME:
    raise ValueError("MODEL_NAME not found in .env file. You must set it for all eternity.")

genai.configure(api_key=GEMINI_API_KEY)
print(f"Using eternal model: {MODEL_NAME}")

# --- Schema and File Setup ---
SCHEMA_HEADERS = ["id", "title", "url", "author", "publication_date", "original_publication", "publisher", "platform", "content_type", "format", "word_count", "length_in_seconds", "excerpt", "summary", "thematic_categories", "key_concepts", "series", "era", "scope", "tags", "related_to", "responds_to", "influence", "copyright", "license", "permissions", "date_processed", "gdrive_pdf_link", "gdrive_raw_file_link", "gdrive_transcript_link"]
CSV_FILE_PATH = "C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper/langextract_test/PROCESSED_DATA_TEST.csv"

# --- Define the Schema via Examples ---
prompt_description = """
Extract the key information from the provided text. It might be a full article or just search result snippets.
Accurately capture the title, author, publication date, a concise summary, and relevant tags.
"""

examples = [
    lx.data.ExampleData(
        text="""
        The Verge
        Google’s big AI push continues with a new partnership with Inflection AI.
        By Alex Heath, a leading voice in tech journalism.
        Published on March 21, 2024.
        The deal will see Google DeepMind collaborate with Inflection AI on new large language models.
        """,
        extractions=[
            lx.data.Extraction(extraction_class="title", extraction_text="Google’s big AI push continues with a new partnership with Inflection AI."),
            lx.data.Extraction(extraction_class="author", extraction_text="Alex Heath"),
            lx.data.Extraction(extraction_class="publication_date", extraction_text="2024-03-21"),
            lx.data.Extraction(extraction_class="summary", extraction_text="Google DeepMind will collaborate with Inflection AI on new large language models, following a new partnership deal."),
            lx.data.Extraction(extraction_class="tags", extraction_text="AI, Google, DeepMind, Inflection AI"),
        ],
    ),
    lx.data.ExampleData(
        text="""
        A most useful definition of journalism has been hiding in plain sight. By Jay Rosen. October 26, 2023.
        For a long time, I have been struggling to find a simple and powerful definition of journalism. I think I have found it.
        It comes from the work of the philosopher, Elizabeth Anderson.
        """,
        extractions=[
            lx.data.Extraction(extraction_class="title", extraction_text="A most useful definition of journalism has been hiding in plain sight."),
            lx.data.Extraction(extraction_class="author", extraction_text="Jay Rosen"),
            lx.data.Extraction(extraction_class="publication_date", extraction_text="2023-10-26"),
            lx.data.Extraction(extraction_class="summary", extraction_text="Jay Rosen discusses finding a powerful definition of journalism from the work of philosopher Elizabeth Anderson."),
            lx.data.Extraction(extraction_class="tags", extraction_text="journalism, philosophy, Elizabeth Anderson, definition"),
        ],
    ),
    lx.data.ExampleData(
        text="""
        New York Times Poll: Biden and Trump Are Tied in 2024 Matchup
        A New York Times/Siena College poll shows a dead heat between President Biden and Donald Trump.
        """,
        extractions=[
            lx.data.Extraction(extraction_class="title", extraction_text="New York Times Poll: Biden and Trump Are Tied in 2024 Matchup"),
            lx.data.Extraction(extraction_class="summary", extraction_text="A New York Times/Siena College poll shows a dead heat between President Biden and Donald Trump."),
            lx.data.Extraction(extraction_class="tags", extraction_text="politics, election, 2024, poll, Biden, Trump"),
        ],
    )
]

# --- Scraping and Fallback Logic ---
def fetch_content_or_fallback(url: str):
    print(f"Fetching content from: {url}")
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    driver = None
    try:
        driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=options)
        driver.get(url)
        wait = WebDriverWait(driver, 10)
        body = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "article, main, body")))
        content = body.text
        if content and len(content) > 100:
            print("Successfully extracted content with Selenium.")
            return content, "Primary Scrape Success"
    except Exception as e:
        print(f"Primary scraping failed: {e}")
    finally:
        if driver:
            driver.quit()

    # --- Fallback Workflow ---
    print("Initiating fallback: Searching for URL.")
    try:
        response = GoogleSearch().search(url, num_results=5)
        snippets = "\n".join([f"{res.title}\n{res.description}" for res in response.results])
        if snippets:
            print("Successfully gathered search snippets for fallback analysis.")
            print(f"Fallback Content:\n{snippets}")
            return snippets, "Fallback Search Success"
    except Exception as e:
        print(f"Fallback search failed: {e}")

    return None, "Total Failure"

# --- AI Analysis ---
def analyze_content(content: str):
    if not content:
        return None
    print("\nAnalyzing content with langextract...")
    try:
        return lx.extract(
            text_or_documents=content,
            prompt_description=prompt_description,
            examples=examples,
            model_id=MODEL_NAME,
            api_key=GEMINI_API_KEY
        )
    except Exception as e:
        print(f"Error during langextract analysis: {e}")
        return None

# --- CSV Logging ---
def log_to_csv(data: dict):
    if not os.path.exists(CSV_FILE_PATH):
        with open(CSV_FILE_PATH, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=SCHEMA_HEADERS)
            writer.writeheader()

    with open(CSV_FILE_PATH, mode='a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=SCHEMA_HEADERS)
        writer.writerow(data)

# --- Main Execution ---
if __name__ == "__main__":
    test_urls = [
        "https://www.theverge.com/2024/3/21/24107566/google-deepmind-inflection-ai-exodus",
        "https://www.nytimes.com/2024/03/20/us/politics/poll-biden-trump-2024.html",
        "https://pressthink.org/2023/10/a-most-useful-definition-of-journalism-has-been-hiding-in-plain-sight/",
        "https://www.a-fake-url-that-will-definitely-fail.com/",
    ]
    
    for i, url in enumerate(test_urls):
        print(f"\n--- Processing URL ({i+1}/{len(test_urls)}): {url} ---")
        content, status = fetch_content_or_fallback(url)
        
        output_data = {header: "" for header in SCHEMA_HEADERS}
        output_data["id"] = f"TEST-{i+1:04d}"
        output_data["url"] = url
        output_data["date_processed"] = datetime.now().isoformat()

        if content:
            analysis_result = analyze_content(content)
            if analysis_result and analysis_result.extractions:
                print("\n--- Extraction Result ---")
                extracted_data = {ext.extraction_class: ext.extraction_text for ext in analysis_result.extractions}
                print(json.dumps(extracted_data, indent=2))
                for key, value in extracted_data.items():
                    if key in output_data:
                        output_data[key] = value
                output_data["summary"] = f'{status}: {output_data.get("summary", "")}'
            else:
                print("AI analysis failed to extract data.")
                output_data["title"] = f"AI Failure: {status}"
        else:
            print("Failed to fetch or fallback for content.")
            output_data["title"] = "Total Content Failure"

        log_to_csv(output_data)
        print(f"--- Finished Processing URL: {url} ---")

    # --- Print Final CSV Content ---
    print("\n--- Final Processed Data ---")
    with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as f:
        print(f.read())