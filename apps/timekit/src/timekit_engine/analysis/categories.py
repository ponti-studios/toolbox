"""Rule-based event category classification."""

from __future__ import annotations

import re

# keyword → category, checked against lowercased title + notes
CATEGORY_RULES: list[tuple[str, list[str]]] = [
    ("meal", [
        r"\b(lunch|dinner|breakfast|brunch|coffee|tea|cafe|restaurant|eat|food|"
        r"pizza|sushi|tacos|bbq|grill|dining|happy hour)\b",
    ]),
    ("travel", [
        r"\b(flight|airport|hotel|airbnb|uber|lyft|train|amtrak|bus|drive|depart|"
        r"arrive|boarding|check.?in|check.?out|transit|commute)\b",
    ]),
    ("health", [
        r"\b(doctor|dentist|therapy|therapist|counseling|appointment|checkup|"
        r"physio|physical|prescription|hospital|clinic|urgent care|wellness)\b",
    ]),
    ("exercise", [
        r"\b(gym|workout|run|running|yoga|swim|swimming|bike|cycling|tennis|golf|"
        r"hike|hiking|crossfit|pilates|lift|lifting|spin|class|training)\b",
    ]),
    ("social", [
        r"\b(birthday|party|wedding|engagement|anniversary|celebration|bridal|"
        r"baby shower|graduation|reunion|gala|fundraiser|happy hour|drinks|"
        r"hangout|catch up|catchup)\b",
    ]),
    ("holiday", [
        r"\b(christmas|thanksgiving|halloween|easter|passover|hanukkah|eid|"
        r"new year|independence day|memorial day|labor day|mlk|veterans day|"
        r"mothers day|mother\'s day|fathers day|father\'s day|juneteenth|"
        r"cinco de mayo|presidents day|columbus day|flag day|earth day)\b",
    ]),
    ("work", [
        r"\b(standup|stand.?up|meeting|review|sync|sprint|demo|interview|"
        r"onboarding|offsite|1.?on.?1|one.?on.?one|planning|retro|retrospective|"
        r"kickoff|kick.?off|all.?hands|town.?hall|presentation|workshop|"
        r"conference|summit|hackathon|debrief|briefing|check.?in)\b",
    ]),
    ("focus", [
        r"\b(focus|deep work|no meetings|block|blocked|heads.?down|writing|"
        r"research|study|reading)\b",
    ]),
    ("personal", [
        r"\b(personal|private|family|kids?|school|pickup|drop.?off|errand|"
        r"chore|haircut|car|auto|taxes?)\b",
    ]),
]


def classify(title: str, notes: str | None = None) -> list[tuple[str, float]]:
    """Return list of (category, confidence) pairs for an event.

    Uses rule-based matching. Returns only categories with at least one match.
    Confidence is 0.9 for a title match, 0.6 for a notes-only match.
    """
    text_title = title.lower() if title else ""
    text_notes = (notes or "").lower()

    results: list[tuple[str, float]] = []

    for category, patterns in CATEGORY_RULES:
        for pattern in patterns:
            if re.search(pattern, text_title):
                results.append((category, 0.9))
                break
            elif re.search(pattern, text_notes):
                results.append((category, 0.6))
                break

    return results
