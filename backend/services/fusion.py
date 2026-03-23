from typing import Dict, List, Any

def generate_fusion_report(text_summary: Dict[str, Any], media_reports: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Combine the text verification summary and media detection reports into a final multimodal verdict."""
    
    # Text Analysis
    total_claims = text_summary.get("total", 0)
    true_claims = text_summary.get("true", 0)
    false_claims = text_summary.get("false", 0)
    
    text_is_reliable = false_claims == 0 and true_claims > 0
    text_is_misleading = false_claims > 0
    text_is_mixed = (true_claims > 0 and false_claims > 0) or text_summary.get("partial", 0) > 0
    
    # Media Analysis
    total_images = len(media_reports)
    ai_generated_count = sum(1 for m in media_reports if m.get("label") == "LIKELY_AI_GENERATED")
    assisted_count = sum(1 for m in media_reports if m.get("label") == "AI_ASSISTED")
    real_count = sum(1 for m in media_reports if m.get("label") == "LIKELY_REAL")
    
    media_is_synthetic = ai_generated_count > 0
    media_is_reliable = total_images > 0 and real_count == total_images
    media_is_absent = total_images == 0
    
    # Calculate unified confidence (simple weighted average)
    text_confidence = text_summary.get("overallScore", 0)
    media_confidence_reduction = (ai_generated_count * 20) + (assisted_count * 10)
    
    unified_confidence = max(0, text_confidence - media_confidence_reduction) if not media_is_absent else text_confidence
    
    # Fusion Logic Matrix
    final_verdict = "UNVERIFIABLE"
    explanation = "System could not definitively classify the trust score of the content."
    
    if media_is_absent:
        if text_is_misleading:
            final_verdict = "MISLEADING_CONTENT"
            explanation = f"Contains {false_claims} demonstrably false claims. No images were analyzed."
        elif text_is_reliable:
            final_verdict = "TRUSTED_CONTENT"
            explanation = f"All {true_claims} claims appear factually correct. No images were analyzed."
        elif text_is_mixed:
            final_verdict = "PARTIALLY_TRUE"
            explanation = "Content contains a mix of true and false/partially true claims."
    else:
        # Multimodal rules
        if text_is_misleading and media_is_synthetic:
            final_verdict = "HIGHLY_MISLEADING_CONTENT"
            unified_confidence = 0
            explanation = f"Content is highly deceptive: it contains {false_claims} false claims alongside {ai_generated_count} AI-generated manipulated images."
            
        elif text_is_misleading and media_is_reliable:
            final_verdict = "MISLEADING_CONTENT"
            unified_confidence = min(unified_confidence, 40)
            explanation = f"The {total_images} analyzed images appear real, but the text contains {false_claims} false claims misrepresenting the context."
            
        elif text_is_reliable and media_is_synthetic:
            final_verdict = "MISLEADING_MEDIA"
            unified_confidence = min(unified_confidence, 50)
            explanation = f"The text claims appear accurate, but the article uses {ai_generated_count} synthetic or AI-generated images to illustrate them."
            
        elif text_is_reliable and media_is_reliable:
            final_verdict = "TRUSTED_CONTENT"
            explanation = f"All claims are supported by evidence, and the {total_images} analyzed images exhibit no signs of AI manipulation."
            
        elif text_is_mixed:
            final_verdict = "PARTIALLY_TRUE_MIXED_MEDIA"
            explanation = f"Text is partially true. Identified {ai_generated_count} synthetic images and {real_count} real images."
            
    return {
        "final_verdict": final_verdict,
        "unified_confidence": unified_confidence,
        "explanation": explanation,
        "media_stats": {
            "total": total_images,
            "ai_generated": ai_generated_count,
            "real": real_count
        }
    }
