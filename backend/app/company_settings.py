"""
Company settings (Section 59.9.1): read bonus labour rate from public.company_settings.
Used by bonus calculation; fallback to env BONUS_LABOUR_RATE then 35.0.
"""
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_BONUS_LABOUR_RATE = 35.0


def get_bonus_labour_rate(supabase: Any) -> float:
    """
    Read bonus labour rate from public.company_settings (id=1).
    Fallback: env BONUS_LABOUR_RATE (float), then 35.0.
    """
    try:
        resp = (
            supabase.table("company_settings")
            .select("bonus_labour_rate")
            .eq("id", 1)
            .limit(1)
            .execute()
        )
        rows = resp.data if hasattr(resp, "data") else []
        if rows and rows[0].get("bonus_labour_rate") is not None:
            try:
                return float(rows[0]["bonus_labour_rate"])
            except (TypeError, ValueError):
                pass
    except Exception as e:
        logger.debug("company_settings bonus_labour_rate read failed: %s", e)

    raw = os.environ.get("BONUS_LABOUR_RATE", "").strip()
    if raw:
        try:
            rate = float(raw)
            logger.info("Using BONUS_LABOUR_RATE from env: %s", rate)
            return rate
        except ValueError:
            pass

    logger.info("Using default bonus labour rate: %s", DEFAULT_BONUS_LABOUR_RATE)
    return DEFAULT_BONUS_LABOUR_RATE
