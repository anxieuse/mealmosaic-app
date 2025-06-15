import pandas as pd
import json
import os
import asyncio
import nest_asyncio
import google.generativeai as genai
from pydantic import BaseModel, Field, ValidationError
from typing import Optional, List, Literal, Dict, Any

# Ensure asyncio compatibility
nest_asyncio.apply()

# ===== CONFIGURATION =====
API_KEY = "AIzaSyAUZzE3R_v4cst6KVlsZYRUFrXNjOXdiRs"
MODEL_NAME = "models/gemini-1.5-flash"
INPUT_CSV_FILE = "Супермаркет, готовые блюда.csv"
OUTPUT_CSV_FILE = INPUT_CSV_FILE.replace(".csv", "_enriched_v4.csv")
MAX_CONCURRENT_REQUESTS = 3
MAX_RETRIES = 3
INITIAL_DELAY = 4

# ===== SCHEMA =====
RatingField = Field(..., ge=1, le=5, description="Rating 1-5")

class MealSuitability(BaseModel):
    breakfast_rating: int = RatingField
    lunch_rating: int = RatingField
    dinner_rating: int = RatingField
    snack_rating: int = RatingField
    suitability_reasoning: str

class DietGoalRatings(BaseModel):
    weight_loss_rating: int = RatingField
    muscle_gain_rating: int = RatingField
    general_health_rating: int = RatingField
    low_calorie_snack_rating: int = RatingField
    goal_reasoning: str

EstimationLevel = Literal["Low", "Medium", "High", "Uncertain"]
PrepComplexity = Literal["Ready-to-Eat", "Requires Heating", "Minimal Prep", "Requires Cooking", "Uncertain"]
ComponentRole = Literal["Primary Protein Source", "Primary Carb Source", "Primary Fat Source", "Vegetable/Fiber Source", "Fruit/Dessert", "Condiment/Sauce", "Complete Meal", "Snack", "Drink", "Other", "Uncertain"]
FlavorProfile = Literal["Sweet", "Savory", "Spicy", "Sour", "Umami", "Bitter", "Balanced", "Neutral", "Other/Mixed", "Uncertain"]
Texture = Literal["Creamy", "Crunchy", "Chewy", "Soft", "Liquid", "Crispy", "Firm", "Tender", "Mixed", "Other", "Uncertain"]
CookingMethod = Literal["Fried", "Baked", "Steamed", "Grilled", "Boiled", "Stewed", "Roasted", "Raw/Salad", "Microwaved", "Sous-Vide", "Smoked", "Other", "N/A"]
HealthBenefitTag = Literal["Probiotic Source", "Prebiotic Source", "Antioxidant Rich", "Omega-3 Source", "High Fiber", "Good Source of Protein", "Low Glycemic Index (Estimate)", "Hydrating", "Source of Calcium", "Source of Iron", "Source of Potassium", "Source of Vitamin C", "Source of Vitamin D", "Source of B12"]

class ComprehensiveProductAnalysisV4(BaseModel):
    meal_suitability: MealSuitability
    diet_goals: DietGoalRatings
    meal_component_role: ComponentRole
    satiety_index_estimate: EstimationLevel
    nutrient_density_estimate: EstimationLevel
    fiber_level_estimate: EstimationLevel
    sodium_level_estimate: EstimationLevel
    likely_contains_added_sugar: bool
    likely_contains_whole_grains: bool
    health_benefit_tags: List[HealthBenefitTag]
    preparation_complexity: PrepComplexity
    cooking_method_guess: Optional[CookingMethod]
    primary_flavor_profile: FlavorProfile
    primary_texture: Texture
    pairing_suggestion: Optional[str]
    is_potential_source_of_calcium: bool
    is_potential_source_of_iron: bool
    is_potential_source_of_potassium: bool
    is_potential_source_of_vitamin_c: bool
    is_potential_source_of_vitamin_d: bool
    is_potential_source_of_vitamin_b12: bool
    micronutrient_comment: Optional[str]
    fodmap_rating: int = RatingField
    gluten_presence_rating: int = RatingField
    lactose_level_rating: int = RatingField
    keto_friendly_rating: int = RatingField
    paleo_friendly_rating: int = RatingField
    carnivore_friendly_rating: int = RatingField
    autoimmune_friendly_rating: int = RatingField
    fodmap_rating_reasoning: str
    gluten_presence_reasoning: str
    lactose_level_reasoning: str
    keto_friendly_reasoning: str
    paleo_friendly_reasoning: str
    carnivore_friendly_reasoning: str
    autoimmune_friendly_reasoning: str

# ===== INITIALISE GEMINI =====
try:
    genai.configure(api_key=API_KEY)
    gemini_model = genai.GenerativeModel(MODEL_NAME)
    print("✅ Gemini client initialized")
except Exception as e:
    print(f"❌ Failed to initialize Gemini: {e}")
    exit(1)

# ===== PROMPT =====
def build_system_prompt() -> str:
    return """
Ты — зарегистрированный диетолог и эксперт русской кухни ВкусВилл и Озон. Анализируй продукт и верни СТРОГО JSON по этой структуре:

{
  "meal_suitability": {
    "breakfast_rating": 1-5,
    "lunch_rating": 1-5,
    "dinner_rating": 1-5,
    "snack_rating": 1-5,
    "suitability_reasoning": "текст"
  },
  "diet_goals": {
    "weight_loss_rating": 1-5,
    "muscle_gain_rating": 1-5,
    "general_health_rating": 1-5,
    "low_calorie_snack_rating": 1-5,
    "goal_reasoning": "текст"
  },
  "meal_component_role": "ОДИН ИЗ: Primary Protein Source, Primary Carb Source, Primary Fat Source, Vegetable/Fiber Source, Fruit/Dessert, Condiment/Sauce, Complete Meal, Snack, Drink, Other, Uncertain",
  "satiety_index_estimate": "ОДИН ИЗ: Low, Medium, High, Uncertain",
  "nutrient_density_estimate": "ОДИН ИЗ: Low, Medium, High, Uncertain",
  "fiber_level_estimate": "ОДИН ИЗ: Low, Medium, High, Uncertain",
  "sodium_level_estimate": "ОДИН ИЗ: Low, Medium, High, Uncertain",
  "likely_contains_added_sugar": true/false,
  "likely_contains_whole_grains": true/false,
  "health_benefit_tags": ["список из: Probiotic Source, Prebiotic Source, Antioxidant Rich, Omega-3 Source, High Fiber, Good Source of Protein, Low Glycemic Index (Estimate), Hydrating, Source of Calcium, Source of Iron, Source of Potassium, Source of Vitamin C, Source of Vitamin D, Source of B12"],
  "preparation_complexity": "ОДИН ИЗ: Ready-to-Eat, Requires Heating, Minimal Prep, Requires Cooking, Uncertain",
  "cooking_method_guess": "ОДИН ИЗ: Fried, Baked, Steamed, Grilled, Boiled, Stewed, Roasted, Raw/Salad, Microwaved, Sous-Vide, Smoked, Other, N/A или null",
  "primary_flavor_profile": "ОДИН ИЗ: Sweet, Savory, Spicy, Sour, Umami, Bitter, Balanced, Neutral, Other/Mixed, Uncertain",
  "primary_texture": "ОДИН ИЗ: Creamy, Crunchy, Chewy, Soft, Liquid, Crispy, Firm, Tender, Mixed, Other, Uncertain",
  "pairing_suggestion": "текст или null",
  "is_potential_source_of_calcium": true/false,
  "is_potential_source_of_iron": true/false,
  "is_potential_source_of_potassium": true/false,
  "is_potential_source_of_vitamin_c": true/false,
  "is_potential_source_of_vitamin_d": true/false,
  "is_potential_source_of_vitamin_b12": true/false,
  "micronutrient_comment": "текст или null",
  "fodmap_rating": 1-5,
  "gluten_presence_rating": 1-5,
  "lactose_level_rating": 1-5,
  "keto_friendly_rating": 1-5,
  "paleo_friendly_rating": 1-5,
  "carnivore_friendly_rating": 1-5,
  "autoimmune_friendly_rating": 1-5,
  "fodmap_rating_reasoning": "текст",
  "gluten_presence_reasoning": "текст",
  "lactose_level_reasoning": "текст",
  "keto_friendly_reasoning": "текст",
  "paleo_friendly_reasoning": "текст",
  "carnivore_friendly_reasoning": "текст",
  "autoimmune_friendly_reasoning": "текст"
}

ВАЖНО: Используй ТОЧНО эти английские значения для enum полей. НЕ добавляй лишние поля типа product_name.
"""

# ===== GEMINI CALL =====
async def get_analysis(row: pd.Series, sem: asyncio.Semaphore) -> tuple[str | None, dict | None]:
    name = row.get("name", "N/A")
    category = row.get("category", "N/A")
    ingredients = str(row.get("content", ""))[:1200]
    url = row.get("url")
    
    if not url:
        return None, None

    system_prompt = build_system_prompt()
    macronutrients = f"Белки: {row.get('proteins', 'N/A')} г\nЖиры: {row.get('fats', 'N/A')} г\nУглеводы: {row.get('carbohydrates', 'N/A')} г"
    user_prompt = f"Название: {name}\nКатегория: {category}\nСостав: {ingredients}\nМакроэлементы: {macronutrients}\n\nВерни JSON по схеме."

    attempt, delay = 0, INITIAL_DELAY
    async with sem:
        while attempt < MAX_RETRIES:
            try:
                response = await asyncio.to_thread(
                    gemini_model.generate_content,
                    f"{system_prompt}\n\n{user_prompt}",
                    generation_config={
                        "temperature": 0.1, 
                        "max_output_tokens": 1024,
                        "response_mime_type": "application/json"
                    },
                )
                
                if not response.candidates or not response.candidates[0].content.parts:
                    raise ValueError(f"Empty response from Gemini (finish_reason: {response.candidates[0].finish_reason if response.candidates else 'unknown'})")
                
                raw_text = response.text.strip()
                
                # Extract JSON (should be clean with JSON mode, but just in case)
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("\n", 1)[1]
                if raw_text.endswith("```"):
                    raw_text = raw_text.rsplit("```", 1)[0]

                json_start = raw_text.find("{")
                json_end = raw_text.rfind("}")
                if json_start == -1 or json_end == -1 or json_end <= json_start:
                    raise ValueError("JSON braces not found in model output")

                json_str = raw_text[json_start:json_end + 1]
                analysis_obj = ComprehensiveProductAnalysisV4.model_validate_json(json_str)
                return url, analysis_obj.model_dump()

            except (ValidationError, json.JSONDecodeError) as ve:
                # Try one self-correction
                if attempt + 1 < MAX_RETRIES:
                    print(f"Schema validation failed for {name}. Asking model to correct…")
                    correction_prompt = (
                        f"⚠️ Предыдущее сообщение не соответствует требуемой JSON-схеме. Ошибка валидации: {ve}.\n"
                        "Пожалуйста, пришли СТРОГО ИСПРАВЛЕННЫЙ JSON, удовлетворяющий схеме. Без объяснений."
                    )
                    full_prompt = f"{system_prompt}\n\n{user_prompt}\n\n{correction_prompt}"
                    try:
                        response = await asyncio.to_thread(
                            gemini_model.generate_content,
                            full_prompt,
                            generation_config={
                                "temperature": 0.1, 
                                "max_output_tokens": 1024,
                                "response_mime_type": "application/json"
                            },
                        )
                        
                        if not response.candidates or not response.candidates[0].content.parts:
                            raise ValueError("Empty correction response from Gemini")
                            
                        txt = response.text.strip()
                        if txt.startswith("```"):
                            txt = txt.split("\n", 1)[1]
                        if txt.endswith("```"):
                            txt = txt.rsplit("```", 1)[0]
                        js_s = txt[txt.find("{"): txt.rfind("}") + 1]
                        analysis_obj = ComprehensiveProductAnalysisV4.model_validate_json(js_s)
                        return url, analysis_obj.model_dump()
                    except Exception as inner_e:
                        print(f"Correction attempt failed for {name}: {inner_e}")
                print(f"⚠️ Schema validation failed for {name}: {ve}")
                return url, None
            except Exception as e:
                retry_sec = getattr(e, "retry_delay", None)
                if retry_sec and hasattr(retry_sec, "seconds"):
                    wait_time = retry_sec.seconds + 1
                else:
                    wait_time = delay
                    delay *= 2
                print(f"Retry {attempt+1}/{MAX_RETRIES} for {name}: {e}. Waiting {wait_time}s")
                await asyncio.sleep(wait_time)
                attempt += 1

    return url, None

# ===== FLATTEN FUNCTION =====
def flatten_analysis(analysis: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
    """Recursively flatten nested dict into flat columns with prefixes."""
    flat = {}
    for key, value in analysis.items():
        new_key = f"{prefix}_{key}" if prefix else key
        if isinstance(value, dict):
            flat.update(flatten_analysis(value, new_key))
        elif isinstance(value, list):
            flat[new_key] = ";".join(map(str, value))
        else:
            flat[new_key] = value
    return flat

# ===== MAIN FUNCTION =====
async def main():
    print(f"🧬 VkusVill Data Enrichment (Standalone)")
    
    # Load CSV
    if not os.path.exists(INPUT_CSV_FILE):
        print(f"❌ Input file {INPUT_CSV_FILE} not found")
        return
    
    df = pd.read_csv(INPUT_CSV_FILE)
    print(f"📊 Loaded {len(df)} items from {INPUT_CSV_FILE}")
    
    # Setup async processing
    sem = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    tasks = [asyncio.create_task(get_analysis(row, sem)) for _, row in df.iterrows()]
    
    enriched_map: Dict[str, Dict[str, Any]] = {}
    processed = 0
    
    print(f"🚀 Processing {len(tasks)} items with {MAX_CONCURRENT_REQUESTS} concurrent requests...")
    
    for coro in asyncio.as_completed(tasks):
        url, analysis = await coro
        processed += 1
        
        if analysis:
            enriched_map[url] = analysis
            print(f"✅ {processed}/{len(tasks)} | Success")
        else:
            print(f"❌ {processed}/{len(tasks)} | Failed")
    
    print(f"🎯 Enrichment complete: {len(enriched_map)} successful out of {len(tasks)}")
    
    # Create output DataFrame with flattened columns
    output_rows = []
    for _, row in df.iterrows():
        row_dict = row.to_dict()
        
        # Add flattened enrichment data if available
        analysis = enriched_map.get(row.get("url"))
        if analysis:
            flat_analysis = flatten_analysis(analysis)
            row_dict.update(flat_analysis)
        
        output_rows.append(row_dict)
    
    # Save to CSV
    output_df = pd.DataFrame(output_rows)
    output_df.to_csv(OUTPUT_CSV_FILE, index=False)
    print(f"💾 Saved enriched data to {OUTPUT_CSV_FILE}")
    print(f"📈 Added {len([col for col in output_df.columns if col not in df.columns])} new enrichment columns")

if __name__ == "__main__":
    asyncio.run(main()) 