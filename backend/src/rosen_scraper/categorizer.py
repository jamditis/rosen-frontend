# -*- coding: utf-8 -*-
"""
This module is responsible for interacting with the Google Gemini AI to analyze,
summarize, and classify the textual content of articles based on a predefined schema.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import google.generativeai as genai
from rosen_scraper.rate_limiter import rate_limited_gemini_call

AI_DEBUG_DIR = Path("logs/ai_responses")
UNIFORM_RESPONSE_SIGNATURE = {
    "thematic_categories": ["Press & Media Criticism"],
    "key_concepts": [],
    "era": "Platform Transition & Future Models (2021-Present)",
    "scope": "Media Analysis",
    "tags": ["journalism", "media"]
}


def _to_list(value: Any) -> List[str]:
    """Normalize AI field into a list of strings."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        parts = [segment.strip() for segment in value.split(",")]
        return [segment for segment in parts if segment]
    # Fallback for unexpected iterable inputs
    try:
        return [str(item).strip() for item in value if str(item).strip()]
    except TypeError:
        return [str(value).strip()]


def _extract_taxonomy_names(taxonomy_items: Any) -> List[str]:
    """
    Extract names from taxonomy items, supporting both old and new schema formats.

    Old format: ["Press & Media Criticism", "Journalism Theory & Practice"]
    New format: [{"name": "Press & Media Criticism", "description": "..."}, ...]

    Returns a list of category/concept names.
    """
    if not taxonomy_items:
        return []

    if isinstance(taxonomy_items, list):
        if not taxonomy_items:
            return []
        # Check if first item is a dict (new format) or string (old format)
        if isinstance(taxonomy_items[0], dict):
            # New format with name/description objects
            return [item.get("name", "") for item in taxonomy_items if isinstance(item, dict) and item.get("name")]
        else:
            # Old format with simple strings
            return [str(item).strip() for item in taxonomy_items if str(item).strip()]

    return []


def _format_categories_for_prompt(taxonomy_items: Any) -> str:
    """
    Format thematic categories for the AI prompt, including descriptions if available.

    Returns a formatted string suitable for the prompt.
    """
    if not taxonomy_items:
        return "[]"

    if isinstance(taxonomy_items, list) and taxonomy_items:
        if isinstance(taxonomy_items[0], dict):
            # New format with descriptions - format as bulleted list
            formatted = []
            for item in taxonomy_items:
                if isinstance(item, dict) and item.get("name"):
                    name = item.get("name")
                    description = item.get("description", "")
                    if description:
                        formatted.append(f"      • {name}: {description}")
                    else:
                        formatted.append(f"      • {name}")
            return "\n" + "\n".join(formatted) if formatted else "[]"
        else:
            # Old format - just list the names
            return str([str(item).strip() for item in taxonomy_items if str(item).strip()])

    return "[]"


def _dump_ai_debug(payload: str, reason: str) -> None:
    """Persist raw AI output to disk for inspection."""
    try:
        AI_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        safe_reason = reason.replace(" ", "_")
        target = AI_DEBUG_DIR / f"{timestamp}_{safe_reason}.json"
        target.write_text(payload, encoding="utf-8")
        print(f"  [AI] DEBUG: Saved Gemini response snapshot to {target}")
    except OSError as exc:
        print(f"  [AI] WARNING: Unable to write AI debug dump ({exc})")


def _matches_uniform_signature(ai_data: Dict[str, Any]) -> bool:
    """Detect the previously observed uniform failure pattern."""
    thematic = ai_data.get("thematic_categories") or []
    key_concepts = ai_data.get("key_concepts") or []
    era = ai_data.get("era")
    scope = (ai_data.get("scope") or "").strip()
    tags = [tag.strip().lower() for tag in (ai_data.get("tags") or [])]

    signature_tags = [tag.lower() for tag in UNIFORM_RESPONSE_SIGNATURE["tags"]]
    return (
        [item.strip() for item in thematic] == UNIFORM_RESPONSE_SIGNATURE["thematic_categories"]
        and not key_concepts
        and era == UNIFORM_RESPONSE_SIGNATURE["era"]
        and scope.lower() == UNIFORM_RESPONSE_SIGNATURE["scope"].lower()
        and tags == signature_tags
    )


def _validate_ai_payload(ai_data: Dict[str, Any], schema: Dict[str, Any], raw_payload: str) -> Optional[Dict[str, Any]]:
    """
    Ensure Gemini output adheres to taxonomy expectations and reject suspicious results.

    Returns the sanitized payload or None if the response must be discarded.
    """
    taxonomy = schema.get("taxonomy", {})
    allowed_categories = set(_extract_taxonomy_names(taxonomy.get("thematic_categories", [])))
    allowed_concepts = set(taxonomy.get("key_concepts", []))
    allowed_eras = set(_extract_taxonomy_names(taxonomy.get("era", [])))
    allowed_scopes = set(taxonomy.get("scope", []))

    ai_data["thematic_categories"] = [item for item in _to_list(ai_data.get("thematic_categories")) if item in allowed_categories]
    ai_data["key_concepts"] = [item for item in _to_list(ai_data.get("key_concepts")) if item in allowed_concepts]
    ai_data["tags"] = _to_list(ai_data.get("tags"))

    # Normalize scalar fields
    if isinstance(ai_data.get("era"), list):
        ai_data["era"] = ai_data["era"][0] if ai_data["era"] else None
    if isinstance(ai_data.get("scope"), list):
        ai_data["scope"] = ai_data["scope"][0] if ai_data["scope"] else None

    critical_issues: List[str] = []

    if ai_data.get("era") not in allowed_eras:
        critical_issues.append(f"invalid era '{ai_data.get('era')}'")
        ai_data["era"] = None

    if ai_data.get("scope") not in allowed_scopes:
        critical_issues.append(f"invalid scope '{ai_data.get('scope')}'")
        ai_data["scope"] = None

    if not ai_data["thematic_categories"]:
        critical_issues.append("missing thematic_categories")

    if not ai_data["key_concepts"]:
        critical_issues.append("missing key_concepts")

    if len(ai_data["tags"]) < 3:
        critical_issues.append("insufficient tag diversity")

    if _matches_uniform_signature(ai_data):
        critical_issues.append("uniform_response_signature_detected")

    if critical_issues:
        print(f"  [AI] WARNING: Gemini response failed validation: {', '.join(critical_issues)}")
        _dump_ai_debug(raw_payload, "validation_failure")
        return None

    return ai_data


@rate_limited_gemini_call
def _call_gemini_for_classification(model, prompt):
    """
    Make a rate-limited call to Gemini API for content classification.
    
    This function is decorated with rate limiting to prevent API throttling.
    
    Args:
        model: Gemini model instance
        prompt: The prompt to send
        
    Returns:
        The API response object
    """
    response = model.generate_content(prompt)
    return response

def summarize_and_classify(text_content, schema):
    """
    Uses the Gemini API to extract metadata, generate a summary, and classify an article.

    This function takes the text content of an article and a classification schema,
    constructs a detailed prompt, and sends it to the Gemini 1.5 Flash model. It then
    parses the JSON response and returns the structured data.

    Args:
        text_content (str): The raw text content of the article to be analyzed.
        schema (dict): A dictionary containing the taxonomy for classification,
                       including thematic categories, key concepts, era, and scope.

    Returns:
        dict: A dictionary containing the AI-generated analysis of the article,
              structured according to the format requested in the prompt.
              Returns None if the API key is not found or if an error occurs
              during the API call.
    """
    # Retrieve the Gemini API key from environment variables for secure access.
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        # Early exit if the API key is not configured.
        print("  [AI] ERROR: GEMINI_API_KEY not found.")
        return None

    # Configure the generative AI model with the retrieved API key.
    genai.configure(api_key=api_key)
    # Initialize the specific Gemini model to be used for content generation.
    model = genai.GenerativeModel('gemini-2.0-flash')

    # Extract the taxonomy from the provided schema to guide the AI's classification.
    taxonomy = schema.get("taxonomy", {})

    # Construct a detailed, multi-part prompt for the AI.
    # This prompt includes specific instructions, the classification taxonomy,
    # the article text to analyze, and the desired JSON output format.
    prompt = f"""
    **INSTRUCTIONS:**
    You are a specialized AI assistant for the Jay Rosen Digital Archive. Analyze the following article text and return a structured JSON object. The text may contain formatting artifacts; interpret it as best you can.

    **TAXONOMY FOR CLASSIFICATION (Choose the most relevant from these lists):**
    - Thematic Categories: {_format_categories_for_prompt(taxonomy.get('thematic_categories', []))}
    - Key Concepts: {taxonomy.get('key_concepts', [])}
    - Era: {_format_categories_for_prompt(taxonomy.get('era', []))}
    - Scope: {taxonomy.get('scope', [])}

    **FEW-SHOT EXAMPLES:**

    **Example 1:**
    **Text:** "The internet has democratized publishing, giving a voice to the voiceless. But it has also created a chaotic media landscape where misinformation thrives. The challenge for journalists is to navigate this new environment and provide reliable information to the public."
    **JSON Output:**
    {{
        "summary": "The internet has democratized publishing, but it has also created a chaotic media landscape where misinformation thrives. The challenge for journalists is to navigate this new environment and provide reliable information to the public.",
        "excerpt": "The challenge for journalists is to navigate this new environment and provide reliable information to the public.",
        "pull_quote": "The internet has democratized publishing, giving a voice to the voiceless.",
        "thematic_categories": ["Technology & Digital Media", "Journalism Theory & Practice"],
        "key_concepts": ["The People Formerly Known as the Audience"],
        "era": "Peak Blogging & Citizen Journalism (2005-2009)",
        "scope": "Commentary/Critique",
        "tags": ["internet", "media", "journalism", "misinformation", "publishing"]
    }}

    **Example 2:**
    **Text:** "The concept of 'the view from nowhere' is a seductive one for journalists. It promises objectivity and neutrality, but it can also lead to a kind of moral blindness. By refusing to take a stand, journalists can become complicit in the face of injustice."
    **JSON Output:**
    {{
        "summary": "The concept of 'the view from nowhere' is a seductive one for journalists, but it can also lead to a kind of moral blindness. By refusing to take a stand, journalists can become complicit in the face of injustice.",
        "excerpt": "By refusing to take a stand, journalists can become complicit in the face of injustice.",
        "pull_quote": "The concept of 'the view from nowhere' is a seductive one for journalists.",
        "thematic_categories": ["Press & Media Criticism", "Journalism Theory & Practice"],
        "key_concepts": ["View from Nowhere"],
        "era": "Social Media & Financial Crisis (2010-2015)",
        "scope": "Theoretical",
        "tags": ["objectivity", "neutrality", "journalism", "ethics", "moral blindness"]
    }}

    **ARTICLE TEXT TO ANALYZE:**
    ---
    {text_content[:12000]}
    ---

    **REQUIRED JSON OUTPUT FORMAT (extract from the text):**
    {{
      "title": "The full title of the article. If not found, return null.",
      "author": "The author's name. If not found, return null.",
      "publication_date": "The date of publication in YYYY-MM-DD format. If not found, return null.",
      "original_publication": "The name of the original publication if mentioned (e.g., 'The New York Times'). If the article appears to be self-published on a platform like Substack or a personal blog, state the name of that platform. If it cannot be determined, return null.",
      "summary": "A concise, one-paragraph summary of the article's main argument. If not found, return null.",
      "excerpt": "A short, compelling quote from the text that captures the essence of the article. If not found, return null.",
      "pull_quote": "A single, impactful, and verbatim quote from the article that is particularly catchy or central to the main point. If not found, return null.",
      "thematic_categories": ["List of 1-3 relevant categories from the taxonomy provided. If not found, return null."],
      "key_concepts": ["List of 1-2 key concepts from the taxonomy if they are explicitly discussed. If not found, return null."],
      "era": "The single most relevant era from the taxonomy. If not found, return null.",
      "scope": "The single most relevant scope from the taxonomy. If not found, return null.",
      "tags": ["A list of 5-7 relevant keywords or tags not included in the taxonomy. If not found, return null."]
    }}
    """

    try:
        # Send the request to the Gemini API and await the response.
        print("  [AI] Sending request to Gemini API for analysis...")
        response = _call_gemini_for_classification(model, prompt)
        
        # Clean up the response text to ensure it's valid JSON.
        # This involves removing markdown code block delimiters.
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '').strip()
        
        # Parse the cleaned JSON string into a Python dictionary.
        ai_data = json.loads(cleaned_response)
        ai_data = _validate_ai_payload(ai_data, schema, cleaned_response)
        if ai_data is None:
            print("  [AI] ERROR: Discarding Gemini output due to validation failure.")
            return None

        print("  [AI] Successfully received, validated, and parsed AI analysis.")
        return ai_data

    except Exception as e:
        # Handle potential errors during the API call or JSON parsing.
        print(f"  [AI] ERROR: An error occurred during Gemini API call: {e}")
        # Log the raw response to aid in debugging.
        raw_response = response.text if 'response' in locals() else 'No response'
        print(f"  [AI] Raw response was: {raw_response}")
        if raw_response and raw_response != 'No response':
            _dump_ai_debug(raw_response, "api_exception")
        return None
