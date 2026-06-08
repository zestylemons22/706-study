"""Build the compact study dataset used by the local web app.

The app is meant to help with revision, not to mirror every slide verbatim.
This script extracts the flashcards from the Excel workbook, collects short
exam-style prompts from the supplied papers, and combines them with hand-written
topic summaries that point back to the supplied lecture sources.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
from pypdf import PdfReader


WORKSPACE = Path(__file__).resolve().parents[1]
DOWNLOADS = Path(r"C:\Users\Alex\Downloads")
THERMAL_SI_EMC = DOWNLOADS / "Kean__Thermal__SI_and_EMC__export"
DIGITAL_CONTROL = DOWNLOADS / "Salim__Digital_Control__export"


@dataclass(frozen=True)
class SourcePdf:
    """Named source PDF with a broad topic label for later citation."""

    path: Path
    area: str


SOURCE_PDFS = [
    SourcePdf(THERMAL_SI_EMC / "1 Signal Integrity.pdf", "Signal Integrity"),
    SourcePdf(THERMAL_SI_EMC / "2. Probing.pdf", "Probing"),
    SourcePdf(THERMAL_SI_EMC / "3 Electromagnetic Interference (EMI).pdf", "EMI/EMC"),
    SourcePdf(THERMAL_SI_EMC / "4 Electromagnetic Compatibility (EMC).pdf", "EMI/EMC"),
    SourcePdf(THERMAL_SI_EMC / "5 Circuit and System Design Guideline.pdf", "EMI Design"),
    SourcePdf(THERMAL_SI_EMC / "6 Grounding and EMI.pdf", "Grounding"),
    SourcePdf(THERMAL_SI_EMC / "7 Design Guidelines and Methodology - Mitigating EMI Issues.pdf", "Shielding"),
    SourcePdf(THERMAL_SI_EMC / "8. Intro to Power Electronics.pdf", "Power Electronics"),
    SourcePdf(THERMAL_SI_EMC / "9. Devices Thermal Consideration.pdf", "Thermal"),
    SourcePdf(DIGITAL_CONTROL / "MECHENG705 DC Section 1 - Introduction.pdf", "Control"),
    SourcePdf(DIGITAL_CONTROL / "MECHENG705 DC Section 2 - Continuous to Discrete Controllers.pdf", "Control"),
    SourcePdf(DIGITAL_CONTROL / "MECHENG705 DC Section 3 - Design in the Digital Domain.pdf", "Control"),
    SourcePdf(DIGITAL_CONTROL / "MECHENG705 DC Section 4 - Model Identification.pdf", "Model ID"),
    SourcePdf(DIGITAL_CONTROL / "MECHENG705 DC Section 5 - IFT.pdf", "IFT"),
    SourcePdf(DIGITAL_CONTROL / "MECHENG705 DC Section 6 - Implementation.pdf", "Control"),
]

PRACTICE_AND_EXAMS = [
    SourcePdf(DOWNLOADS / "Practice Questions.pdf", "Exam Practice"),
    SourcePdf(DOWNLOADS / "MECHENG 705 2023 Final Exam.pdf", "Past Exam"),
    SourcePdf(DOWNLOADS / "MECHENG705_S1_2024.pdf", "Past Exam"),
    SourcePdf(DOWNLOADS / "MECHENG705_S1_2025.pdf", "Past Exam"),
]

FLASHCARD_WORKBOOK = DOWNLOADS / "MECHENG705_rote_memorisation_cards.xlsx"


# AGENTS.md asks that the initial assignment document be referenced where
# relevant. It was not included in the user-supplied source list, so this
# explicit placeholder prevents the app from pretending that an unrelated
# Downloads assignment brief is authoritative.
INITIAL_ASSIGNMENT_DOCUMENT = {
    "status": "not_provided",
    "note": (
        "No initial assignment document was found in the workspace or supplied "
        "file list. Add it to SOURCE_PDFS if it should become a cited source."
    ),
}


TOPIC_SUMMARIES = [
    {
        "id": "control",
        "title": "Digital Control",
        "area": "Control",
        "whyItMatters": "Most exam questions ask you to move between continuous-time plants, sampled models, and digital controller designs without mixing the rules.",
        "keyIdeas": [
            "Choose the sample time from the design purpose: controller discretisation, direct digital design, or desired closed-loop poles.",
            "Use Euler/Tustin substitutions only when the question asks for an approximation rule; use the ZOH pulse-transfer formula for a pulse transfer function.",
            "Map stability through the z-plane: stable discrete poles must sit inside the unit circle.",
            "Always track what is being sampled and what is being held, because the physical plant remains continuous even when the controller is digital.",
        ],
        "formulas": [
            "Forward Euler: s approx (z - 1) / Ts",
            "Backward Euler: s approx (z - 1) / (z Ts)",
            "Tustin: s approx (2 / Ts) * (z - 1) / (z + 1)",
            "ZOH pulse transfer: P(z) = ((z - 1) / z) Z{G(s) / s}",
        ],
        "examMoves": [
            "Underline whether the question asks for approximation, ZOH pulse transfer, direct digital design, or pole placement.",
            "Write Ts and every continuous pole/zero before substituting.",
            "Check the final answer is in z or z^-1 form consistently.",
        ],
        "sources": [
            "MECHENG705 DC Section 1 - Introduction.pdf",
            "MECHENG705 DC Section 2 - Continuous to Discrete Controllers.pdf",
            "MECHENG705 DC Section 3 - Design in the Digital Domain.pdf",
            "MECHENG705 DC Section 6 - Implementation.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "control-loop",
    },
    {
        "id": "model-id",
        "title": "Model Identification",
        "area": "Model ID",
        "whyItMatters": "Controller performance depends on the plant model, so model identification questions usually test assumptions, parameter fitting, and validation logic.",
        "keyIdeas": [
            "The identification process has two separate jobs: choose the model structure, then estimate its parameters.",
            "A useful experiment excites the dynamics you care about while avoiding actuator saturation and unsafe operation.",
            "Validation is separate from fitting; a model that only matches the fitting dataset can still fail as a controller design model.",
            "Simple DC motor models usually connect voltage, current, back EMF, torque, inertia, and viscous friction.",
        ],
        "formulas": [
            "Model form first, parameters second",
            "Prediction error = measured output - model output",
            "Use residuals to judge whether important dynamics remain unexplained",
        ],
        "examMoves": [
            "State the modelling assumption before writing equations.",
            "Separate measured data, estimated parameters, and validation data in your answer.",
            "If a model fails, name the missing effect rather than only saying the error is high.",
        ],
        "sources": [
            "MECHENG705 DC Section 4 - Model Identification.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "model-id",
    },
    {
        "id": "ift",
        "title": "Iterative Feedback Tuning",
        "area": "IFT",
        "whyItMatters": "IFT is a data-driven tuning method, so the key is explaining what is updated, what cost is minimized, and why closed-loop data matters.",
        "keyIdeas": [
            "IFT updates controller parameters iteratively using experimental closed-loop data.",
            "The method targets a performance cost, so the chosen reference model or error signal defines what better means.",
            "Practical answers should mention noise, repeated experiments, and careful step-size selection.",
            "IFT is useful when a full accurate plant model is hard to obtain but experiments are possible.",
        ],
        "formulas": [
            "Update idea: new parameters = old parameters - step size * estimated gradient",
            "Cost is usually based on tracking error and sometimes control effort",
        ],
        "examMoves": [
            "Identify the tunable controller parameters.",
            "Define the performance objective before discussing the update.",
            "Mention practical limits: noise, safety, convergence, and experimental cost.",
        ],
        "sources": [
            "MECHENG705 DC Section 5 - IFT.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "ift",
    },
    {
        "id": "signal-integrity",
        "title": "Signal Integrity",
        "area": "Signal Integrity",
        "whyItMatters": "Signal integrity questions test whether you can connect fast digital edges to analog transmission-line behaviour.",
        "keyIdeas": [
            "Signal integrity is the ability of a signal to propagate without unacceptable distortion.",
            "Fast edges make even short PCB traces behave like transmission lines.",
            "Common symptoms are ringing, reflections, crosstalk, loss, timing errors, and ground bounce.",
            "Rise time matters more than clock frequency when deciding whether a trace is electrically long.",
        ],
        "formulas": [
            "Electrically long rule of thumb: compare trace delay with signal rise time",
            "Reflection coefficient idea: mismatch between source, line, and load impedance causes reflected energy",
        ],
        "examMoves": [
            "Name the symptom, then name the physical cause.",
            "Check whether the issue is source impedance, load impedance, return path, or coupling.",
            "Suggest a mitigation tied to the cause: termination, shorter trace, controlled impedance, or better return path.",
        ],
        "sources": [
            "1 Signal Integrity.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "trace",
    },
    {
        "id": "probing",
        "title": "Probing",
        "area": "Probing",
        "whyItMatters": "A measurement can create the fault you think you are observing, especially when probe capacitance or ground lead inductance disturbs a fast circuit.",
        "keyIdeas": [
            "The probe, ground lead, and oscilloscope input become part of the circuit under test.",
            "Long ground leads add inductance and can exaggerate ringing.",
            "Probe bandwidth and loading determine whether the displayed waveform is trustworthy.",
            "Use short ground springs or coaxial probing for high-speed measurements.",
        ],
        "formulas": [
            "Probe loading is mainly input resistance in parallel with input capacitance",
            "Shorter loop area reduces inductive pickup",
        ],
        "examMoves": [
            "State what the measurement setup adds to the circuit.",
            "For ringing measurements, question the ground lead before blaming the PCB.",
            "Match probe type to signal speed and impedance.",
        ],
        "sources": [
            "2. Probing.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "probe",
    },
    {
        "id": "emi-emc",
        "title": "EMI and EMC",
        "area": "EMI/EMC",
        "whyItMatters": "EMI/EMC questions are often solved by naming the source, coupling path, and victim, then breaking at least one part of that chain.",
        "keyIdeas": [
            "EMI is unwanted electromagnetic disturbance generated by circuits or external sources.",
            "EMC is the ability of equipment to operate acceptably in its electromagnetic environment.",
            "Every interference problem needs a source, a coupling path, and a susceptible victim.",
            "Emission, susceptibility, and immunity are related but not interchangeable terms.",
        ],
        "formulas": [
            "EMI problem chain: source -> coupling path -> victim",
            "Mitigation logic: reduce source, block path, or harden receiver",
        ],
        "examMoves": [
            "Draw the source-path-victim chain before listing fixes.",
            "Classify the coupling path as conducted, radiated, capacitive, or inductive.",
            "Do not list shielding as a generic answer; say what it shields and why.",
        ],
        "sources": [
            "3 Electromagnetic Interference (EMI).pdf",
            "4 Electromagnetic Compatibility (EMC).pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "emi-chain",
    },
    {
        "id": "emi-design",
        "title": "EMI Design Methodology",
        "area": "EMI Design",
        "whyItMatters": "Design-guideline questions reward systematic reasoning: partition the system, control sources, manage return paths, and filter or shield intentionally.",
        "keyIdeas": [
            "Partition noisy power/high-speed sections away from sensitive analog or measurement sections.",
            "Control interference at the source where possible before relying on receiver-side fixes.",
            "Minimise distribution of analog signals and keep loop areas small.",
            "Filtering, shielding, layout, and grounding must be coordinated rather than treated as separate afterthoughts.",
        ],
        "formulas": [
            "Design order: partition -> reduce source -> control path -> protect receiver -> verify",
            "Loop area reduction lowers magnetic coupling",
        ],
        "examMoves": [
            "Propose fixes in a design-flow order, not as a random list.",
            "Explain the expected mechanism for each fix.",
            "Separate board-level, cable-level, and enclosure-level controls.",
        ],
        "sources": [
            "5 Circuit and System Design Guideline.pdf",
            "7 Design Guidelines and Methodology - Mitigating EMI Issues.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "method",
    },
    {
        "id": "grounding",
        "title": "Grounding and Return Paths",
        "area": "Grounding",
        "whyItMatters": "Ground is not a magic zero-voltage node at high frequency; exam answers should discuss impedance, return current, and shared paths.",
        "keyIdeas": [
            "Good EMI grounding provides a low-impedance path for high-frequency residual signals.",
            "At high frequency, long wires and narrow traces have significant impedance.",
            "Shared ground impedance can move noise from one circuit into another.",
            "Return current follows the lowest-impedance path, which is often under the signal trace at high frequency.",
        ],
        "formulas": [
            "Impedance, not just resistance, controls high-frequency grounding behaviour",
            "Ground objective: safety plus low-impedance EMI return without channeling noise into victims",
        ],
        "examMoves": [
            "Say whether you are discussing safety ground, signal reference, chassis, or EMI return.",
            "For mixed-signal designs, identify where return currents flow.",
            "Avoid vague single-point/multi-point slogans; connect the choice to frequency and current path.",
        ],
        "sources": [
            "6 Grounding and EMI.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "ground",
    },
    {
        "id": "shielding",
        "title": "Shielding and Filtering",
        "area": "Shielding",
        "whyItMatters": "Shielding only works when it is continuous, bonded correctly, and used with filters so cables do not bypass the enclosure.",
        "keyIdeas": [
            "A shield controls field coupling by reflecting, absorbing, or redirecting electromagnetic energy.",
            "Gaps, seams, poor bonds, and unfiltered cable penetrations reduce shielding effectiveness.",
            "Filters should be placed at the boundary where the signal or power line enters the protected region.",
            "Cable shields need termination choices that match the frequency and noise mechanism.",
        ],
        "formulas": [
            "Shielding effectiveness depends on material, frequency, aperture size, and bonding",
            "Filter at the boundary so noise current is diverted before entering the victim region",
        ],
        "examMoves": [
            "Identify whether the problem is electric-field, magnetic-field, radiated, or conducted coupling.",
            "For enclosures, check apertures and cable entries.",
            "For filters, state where the unwanted current goes.",
        ],
        "sources": [
            "7 Design Guidelines and Methodology - Mitigating EMI Issues.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "shield",
    },
    {
        "id": "power-electronics",
        "title": "Power Electronics",
        "area": "Power Electronics",
        "whyItMatters": "Power electronics connects switching, heat, EMI, and control implementation, so questions often ask for side effects as well as ideal converter behaviour.",
        "keyIdeas": [
            "Switching devices reduce dissipation compared with linear operation but create fast voltage and current transitions.",
            "Fast switching edges can inject conducted and radiated EMI.",
            "Layout parasitics, diode recovery, gate drive, and snubbing affect real converter behaviour.",
            "Thermal and EMC design choices must be made early, not after the converter is built.",
        ],
        "formulas": [
            "Switching loss and conduction loss both contribute to device temperature",
            "Higher dV/dt and dI/dt generally increase EMI risk",
        ],
        "examMoves": [
            "State the ideal converter action first, then add non-ideal effects.",
            "Connect switching frequency to filtering, losses, thermal load, and EMI.",
            "Include layout parasitics when explaining unexpected waveforms.",
        ],
        "sources": [
            "8. Intro to Power Electronics.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "power",
    },
    {
        "id": "thermal",
        "title": "Thermal Design",
        "area": "Thermal",
        "whyItMatters": "Thermal questions usually reduce to a heat-flow path: generated power must move from junction to package, heatsink, and ambient air.",
        "keyIdeas": [
            "Semiconductor power loss appears as heat at the junction.",
            "High junction temperature reduces performance, lifetime, and reliability.",
            "Thermal resistance measures opposition to heat flow in degrees Celsius per watt.",
            "A thermal path can be treated like a resistance chain from junction to ambient.",
        ],
        "formulas": [
            "Temperature rise = power dissipation * thermal resistance",
            "Junction temperature = ambient temperature + total temperature rise",
            "Total thermal resistance is the sum of series thermal resistances",
        ],
        "examMoves": [
            "Draw the heat path before doing arithmetic.",
            "Keep units as W, deg C/W, and deg C.",
            "Check whether the answer asks for junction, case, heatsink, or ambient temperature.",
        ],
        "sources": [
            "9. Devices Thermal Consideration.pdf",
            "MECHENG705_rote_memorisation_cards.xlsx",
        ],
        "visual": "thermal",
    },
]


def normalize_text(text: str) -> str:
    """Collapse noisy PDF whitespace while preserving readable math symbols."""

    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def slug_topic(topic: str) -> str:
    """Map workbook topic labels to stable summary page ids."""

    mapping = {
        "Control": "control",
        "Signal Integrity": "signal-integrity",
        "Thermal": "thermal",
        "EMI/EMC": "emi-emc",
        "Shielding": "shielding",
        "Grounding": "grounding",
        "Model ID": "model-id",
        "IFT": "ift",
        "Probing": "probing",
        "Power Electronics": "power-electronics",
        "EMI Design": "emi-design",
    }
    return mapping.get(str(topic).strip(), "control")


def classify_topic(text: str) -> str:
    """Assign an exam prompt to the closest summary topic by keyword."""

    lowered = text.lower()
    keyword_map = [
        (
            "control",
            [
                "sample time",
                "pulse transfer",
                "pole placement",
                "deadbeat",
                "controller",
                "discrete",
                "digital domain",
                "z transform",
                "z-domain",
                "transfer function",
            ],
        ),
        ("model-id", ["identify", "identification", "model", "motor", "parameter"]),
        ("ift", ["iterative feedback", "ift", "gradient", "tuning"]),
        ("emi-emc", ["emi", "emc", "electromagnetic", "susceptibility", "immunity"]),
        ("signal-integrity", ["signal integrity", "ringing", "crosstalk", "reflection", "transmission line"]),
        ("thermal", ["thermal", "junction", "heat", "temperature", "heatsink"]),
        ("grounding", ["ground", "return path"]),
        ("power-electronics", ["converter", "switching", "power electronics"]),
        ("shielding", ["shield", "filter"]),
    ]
    for topic_id, keywords in keyword_map:
        if any(keyword in lowered for keyword in keywords):
            return topic_id
    return "control"


def read_pdf_pages(path: Path) -> list[str]:
    """Extract one normalized text string per PDF page."""

    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages:
        pages.append(normalize_text(page.extract_text() or ""))
    return pages


def load_flashcards() -> list[dict]:
    """Import the supplied rote-memory workbook as flashcard records."""

    df = pd.read_excel(FLASHCARD_WORKBOOK, sheet_name="Rote Cards").fillna("")
    cards: list[dict] = []
    for idx, row in df.iterrows():
        topic = str(row.get("Topic", "")).strip() or "Control"
        cards.append(
            {
                "id": f"card-{idx + 1:03d}",
                "question": str(row["Question"]).strip(),
                "answer": str(row["Answer"]).strip(),
                "topic": topic,
                "topicId": slug_topic(topic),
                "priority": str(row.get("Priority", "")).strip() or "Medium",
                "source": FLASHCARD_WORKBOOK.name,
            }
        )
    return cards


def extract_exam_prompts() -> list[dict]:
    """Collect short, question-like excerpts from the supplied practice/exams."""

    prompts: list[dict] = []
    for source in PRACTICE_AND_EXAMS:
        pages = read_pdf_pages(source.path)
        for page_number, page_text in enumerate(pages, start=1):
            # Split on Q1., Q2. etc. This avoids copying the full paper while
            # still preserving enough exam phrasing to practise planning.
            chunks = re.split(r"(?=\bQ\d+[.)])", page_text)
            for chunk in chunks:
                clean = normalize_text(chunk)
                if not re.match(r"Q\d+[.)]", clean):
                    continue
                if len(clean) < 80:
                    continue
                excerpt = clean[:900].rsplit(" ", 1)[0]
                if len(clean) > len(excerpt):
                    excerpt += " ..."
                prompts.append(
                    {
                        "id": f"exam-{len(prompts) + 1:03d}",
                        "prompt": excerpt,
                        "topicId": classify_topic(clean),
                        "source": source.path.name,
                        "sourceArea": source.area,
                        "page": page_number,
                    }
                )

    # Keep a bounded set so the app remains fast and revision-focused.
    return prompts[:36]


def source_inventory(paths: Iterable[SourcePdf]) -> list[dict]:
    """Record source availability for the app's source drawer."""

    inventory = []
    for source in paths:
        inventory.append(
            {
                "name": source.path.name,
                "area": source.area,
                "path": str(source.path),
                "exists": source.path.exists(),
            }
        )
    return inventory


def build_dataset() -> dict:
    """Assemble the complete JSON payload consumed by src/app.js."""

    flashcards = load_flashcards()
    exams = extract_exam_prompts()
    topics = TOPIC_SUMMARIES
    return {
        "metadata": {
            "generatedBy": "tools/extract_study_data.py",
            "course": "MECHENG 705 study support",
            "initialAssignmentDocument": INITIAL_ASSIGNMENT_DOCUMENT,
            "counts": {
                "topics": len(topics),
                "flashcards": len(flashcards),
                "examPrompts": len(exams),
            },
            "sources": source_inventory(SOURCE_PDFS + PRACTICE_AND_EXAMS)
            + [
                {
                    "name": FLASHCARD_WORKBOOK.name,
                    "area": "Flashcards",
                    "path": str(FLASHCARD_WORKBOOK),
                    "exists": FLASHCARD_WORKBOOK.exists(),
                }
            ],
        },
        "topics": topics,
        "flashcards": flashcards,
        "examPrompts": exams,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the study dataset from source files.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite data/study-data.json. Without this, existing manual edits are preserved.",
    )
    args = parser.parse_args()
    data_dir = WORKSPACE / "data"
    data_dir.mkdir(exist_ok=True)
    primary_path = data_dir / "study-data.json"
    output_path = primary_path if args.force or not primary_path.exists() else data_dir / "study-data.generated.json"
    output_path.write_text(
        json.dumps(build_dataset(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if output_path != primary_path:
        print(f"Preserved manual edits in {primary_path}")
        print("Run with --force to overwrite the live dataset intentionally.")
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
