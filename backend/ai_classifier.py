"""
AI-powered product classification using LiteLLM.
Supports multiple LLM providers (Anthropic, OpenAI, Google, etc.).
Extracts category, unit, service type, and description from product names.
"""

from litellm import acompletion
from litellm.exceptions import APIError
import json
import logging
from typing import Optional, Dict, Any
from config import settings

logger = logging.getLogger(__name__)


class AIClassificationError(Exception):
    """Raised when AI classification fails"""
    pass


SYSTEM_PROMPT = """You are a product classification expert for inventory management systems. Given a product name, you must respond with ONLY a valid JSON object (no markdown, no explanation).

Your task:
1. Determine the most appropriate category for the product
2. Suggest the best unit of measurement (e.g., pcs, kg, liters, box, session, hours)
3. Identify if it's a service (non-physical) or a physical product
4. Write a concise 1-2 sentence description including features, use cases, and any storage/handling notes

Categories should be broad but specific (e.g., "Electronics", "Beverages", "Services", "Office Supplies", "Food Items", "Cleaning Products", "Hardware Tools", "Furniture", "Textiles", "Medical Supplies").

Response format (JSON only):
{
  "category": "Category Name",
  "unit": "unit_name",
  "is_service": false,
  "description": "Brief product description with features and use cases.",
  "confidence": "high"
}

Confidence levels:
- "high": Clear, unambiguous product
- "medium": Reasonable guess with some uncertainty
- "low": Vague name, generic fallback used

Examples:
Input: "MacBook Pro 16-inch"
Output: {"category": "Electronics", "unit": "pcs", "is_service": false, "description": "High-performance laptop computer ideal for professional work, content creation, and development. Handle with care and store in a cool, dry place.", "confidence": "high"}

Input: "Fresh Orange Juice"
Output: {"category": "Beverages", "unit": "liters", "is_service": false, "description": "Freshly squeezed orange juice rich in vitamin C. Store refrigerated and consume within 48 hours for best quality.", "confidence": "high"}

Input: "IT Consultation"
Output: {"category": "Services", "unit": "hours", "is_service": true, "description": "Professional IT consulting service for business technology solutions, system architecture, and technical advisory. Billed hourly.", "confidence": "high"}

Input: "USB-C Cable 2m"
Output: {"category": "Electronics", "unit": "pcs", "is_service": false, "description": "2-meter USB Type-C cable for charging and data transfer. Compatible with modern smartphones, tablets, and laptops.", "confidence": "high"}

Input: "Cleaning Service"
Output: {"category": "Services", "unit": "session", "is_service": true, "description": "Professional cleaning service for residential or commercial spaces. Typically covers dusting, vacuuming, and sanitization.", "confidence": "high"}

Remember: ONLY return valid JSON, nothing else."""


async def classify_product(product_name: str) -> Dict[str, Any]:
    """
    Classify a product using LiteLLM (supports multiple AI providers).

    Args:
        product_name: Name of the product to classify

    Returns:
        Dictionary with category, unit, is_service, description, confidence

    Raises:
        AIClassificationError: If API call fails or response is invalid
    """
    if not settings.AI_CLASSIFICATION_ENABLED:
        raise AIClassificationError("AI classification is disabled")

    if not settings.ANTHROPIC_API_KEY:
        raise AIClassificationError("API key not configured")

    try:
        response = await acompletion(
            model=settings.AI_MODEL,  # e.g., "anthropic/claude-haiku-4-5-20251001"
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": product_name}
            ],
            max_tokens=settings.AI_MAX_TOKENS,
            api_key=settings.ANTHROPIC_API_KEY,  # LiteLLM auto-routes based on model
            timeout=10.0  # 10 second timeout
        )

        # Extract text from response
        response_text = response.choices[0].message.content.strip()
        logger.info(f"AI raw response for '{product_name}': {response_text}")

        # Parse JSON response
        try:
            classification = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
                classification = json.loads(response_text)
            else:
                raise

        # Validate response structure
        required_fields = ["category", "unit", "is_service", "description", "confidence"]
        if not all(field in classification for field in required_fields):
            raise ValueError(f"Missing required fields in AI response: {classification}")

        # Normalize and validate values
        classification["category"] = classification["category"].strip()[:50]
        classification["unit"] = classification["unit"].strip().lower()[:30]
        classification["is_service"] = bool(classification["is_service"])
        classification["description"] = classification["description"].strip()[:500]
        classification["confidence"] = classification.get("confidence", "medium")

        if not classification["category"]:
            classification["category"] = "General"
            classification["confidence"] = "low"

        if not classification["unit"]:
            classification["unit"] = "pcs"
            classification["confidence"] = "low"

        logger.info(f"Successfully classified '{product_name}': {classification}")
        return classification

    except APIError as e:
        logger.error(f"LiteLLM API error: {e}")
        raise AIClassificationError(f"AI service error: {str(e)}")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {response_text}")
        raise AIClassificationError("AI returned invalid response format")
    except Exception as e:
        logger.error(f"Unexpected error in AI classification: {e}")
        raise AIClassificationError(f"Classification failed: {str(e)}")


def get_fallback_classification(product_name: str) -> Dict[str, Any]:
    """
    Provide a simple fallback classification when AI is unavailable.
    Uses basic keyword matching.
    """
    name_lower = product_name.lower()

    # Simple keyword-based classification
    if any(word in name_lower for word in ["service", "consultation", "repair", "maintenance", "cleaning"]):
        return {
            "category": "Services",
            "unit": "session",
            "is_service": True,
            "description": f"{product_name} - professional service offering.",
            "confidence": "low"
        }

    return {
        "category": "General",
        "unit": "pcs",
        "is_service": False,
        "description": product_name,
        "confidence": "low"
    }
