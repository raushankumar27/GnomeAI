import re
from typing import List, Tuple

# Devanagari Unicode range regex pattern
# Preserves consonants, vowels, combining matras (\u093e-\u094c, \u0962-\u0963), virama/halant (\u094d), anusvara/visarga (\u0901-\u0903)
DEVANAGARI_SYLLABLE_PATTERN = re.compile(
    r'(?:[\u0900-\u097F][\u093E-\u094D\u0951-\u0954\u0962-\u0963]*)+|[\s\w\d.,!?]+',
    re.UNICODE
)

class IndicStreamBuffer:
    """
    Accumulates text tokens during real-time LLM streaming.
    Ensures Devanagari words and syllable clusters are never broken
    across chunk boundaries before dispatching to TTS synthesis.
    """
    def __init__(self, min_dispatch_length: int = 25):
        self.buffer = ""
        self.min_dispatch_length = min_dispatch_length

    def add_token(self, token: str) -> List[str]:
        """
        Appends token and returns any safe-to-synthesize sentence/phrase chunks.
        """
        self.buffer += token
        return self._flush_safe_chunks()

    def _flush_safe_chunks(self) -> List[str]:
        chunks = []
        # Punctuation boundary match (sentence end or pause)
        punctuation_match = re.split(r'([.!?\n|]+)', self.buffer)
        
        if len(punctuation_match) > 1:
            # We have at least one complete sentence/clause
            complete_text = "".join(punctuation_match[:-1])
            self.buffer = punctuation_match[-1]
            
            # Validate Unicode grapheme integrity
            if complete_text.strip():
                chunks.append(complete_text.strip())
        elif len(self.buffer) >= self.min_dispatch_length:
            # If buffer is long enough, split at last space or word boundary
            space_idx = max(self.buffer.rfind(" "), self.buffer.rfind("।"))
            if space_idx > 0:
                safe_part = self.buffer[:space_idx]
                self.buffer = self.buffer[space_idx+1:]
                if safe_part.strip():
                    chunks.append(safe_part.strip())
                    
        return chunks

    def finalize(self) -> List[str]:
        """
        Flushes remaining content in buffer when generation finishes.
        """
        final_chunk = self.buffer.strip()
        self.buffer = ""
        return [final_chunk] if final_chunk else []
