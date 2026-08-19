import os
import json
import threading
from gnomeai_backend.core.learnings import load_learnings, save_learnings

def consolidate_learnings_from_text(user_input: str, assistant_response: str):
    """
    Extracts key user preferences, coding patterns, or explicit facts
    from conversation turns and appends them into persistent learnings.json.
    """
    try:
        keywords = ["remember that", "my preference is", "always use", "i like", "prefer", "note that"]
        lower_input = user_input.lower()
        
        for kw in keywords:
            if kw in lower_input:
                extracted_fact = user_input.strip()
                existing = load_learnings()
                if extracted_fact not in existing:
                    existing.append(extracted_fact)
                    save_learnings(existing)
                    print(f"[Learnings] Automatically learned new fact: '{extracted_fact}'")
                break
    except Exception as e:
        print(f"[Learnings] Consolidation error: {e}")
