
import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get the API key from the environment
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

# Configure the Gemini API
genai.configure(api_key=GEMINI_API_KEY)

def extract_article_data_from_url(url):
    """
    Uses the Gemini API with URL context to extract the main article content from a URL.
    """
    try:
        # Create a generative model instance
        model = genai.GenerativeModel('gemini-1.5-pro-latest')

        # Use the generate_content method with the URL
        # The prompt is simple: just the URL
        response = model.generate_content(f"Extract the main article text and title from the following URL: {url}")

        return response.text
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

if __name__ == '__main__':
    # Sample URL for testing
    sample_url = "https://pressthink.org/2023/10/a-current-list-of-my-top-problems-in-pressthink-may-2021/"

    # Extract the article data
    article_data = extract_article_data_from_url(sample_url)

    # Print the result
    if article_data:
        print(article_data)
