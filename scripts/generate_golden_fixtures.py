"""
Generates golden regression fixtures by running the ALREADY-VALIDATED
prototype/pergola_engine.py against a representative set of inputs for
Vision and Brera. The TypeScript port in ../src/engine.ts is asserted to
reproduce these exact numeric outputs — the Python engine is the source of
truth being ported, not re-derived by hand.

Run with: python scripts/generate_golden_fixtures.py
(from the pergolando-shared repo root)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "prototype"))

from pergola_engine import ConfiguratoreError, PergolaEngine  # noqa: E402

FIXTURES_DIR = REPO_ROOT / "fixtures"


def run_cases(engine: PergolaEngine, cases: list[dict]) -> list[dict]:
    results = []
    for case in cases:
        params = case["input"]
        try:
            cfg = engine.configura(**params)
            results.append(
                {
                    "name": case["name"],
                    "input": params,
                    "expected": {
                        "success": True,
                        "output": {
                            "sotto_modello": cfg.sotto_modello,
                            "variante_montaggio": cfg.variante_montaggio,
                            "opzione_tecnica": cfg.opzione_tecnica,
                            "orientamento_crescita": cfg.orientamento_crescita,
                            "n_moduli": cfg.n_moduli,
                            "L_modulo_cm": cfg.L_modulo_cm,
                            "P_modulo_cm": cfg.P_modulo_cm,
                            "L_totale_effettiva_cm": cfg.L_totale_effettiva_cm,
                            "P_totale_effettiva_cm": cfg.P_totale_effettiva_cm,
                            "n_lame": cfg.n_lame,
                            "voci_costo": [
                                {"descrizione": v.descrizione, "importo_eur": v.importo_eur}
                                for v in cfg.voci_costo
                            ],
                            "avvisi_count": len(cfg.avvisi),
                            "prezzo_totale_eur": cfg.prezzo_totale_eur,
                        },
                    },
                }
            )
        except ConfiguratoreError as exc:
            results.append(
                {
                    "name": case["name"],
                    "input": params,
                    "expected": {
                        "success": False,
                        "error_message": str(exc),
                    },
                }
            )
    return results


VISION_CASES = [
    {
        "name": "single module, exact matrix hit, no supplements",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=190,
            L_richiesta_cm=200,
            colore_struttura="RAL 9010 Bianco semilucido",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
        ),
    },
    {
        "name": "2 moduli, supplemento colore + supplemento montante",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=900,
            colore_struttura="Tiger Coating Colours Class 2",
            colore_plastica="Grigio",
            altezza_montanti_cm=260,
        ),
    },
    {
        "name": "4 moduli near max L",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=400,
            L_richiesta_cm=1950,
            colore_struttura="Corten",
            colore_plastica="Corten",
            altezza_montanti_cm=240,
        ),
    },
    {
        "name": "explicit opzione_tecnica and n_moduli",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=250,
            L_richiesta_cm=450,
            colore_struttura="Grigio ferro",
            colore_plastica="Grigio ferro",
            altezza_montanti_cm=180,
            opzione_tecnica="standard",
            n_moduli=1,
        ),
    },
    {
        "name": "row with montante_intermedio flag (P >= 630)",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=640,
            L_richiesta_cm=300,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
        ),
    },
    {
        "name": "error: altezza exceeds H_max_cm",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=400,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=280,
        ),
    },
    {
        "name": "error: L exceeds max for 4 moduli",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=2100,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
        ),
    },
    {
        "name": "error: invalid colore_struttura",
        "input": dict(
            sotto_modello="standard",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=400,
            colore_struttura="Colore Inesistente",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
        ),
    },
    {
        "name": "error: invalid sotto_modello",
        "input": dict(
            sotto_modello="premium",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=400,
            colore_struttura="Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
        ),
    },
]

BRERA_CASES = [
    {
        "name": "Brera P, 01L, H20 explicit, 1 modulo",
        "input": dict(
            sotto_modello="P",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=200,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
            opzione_tecnica="H20",
        ),
    },
    {
        "name": "Brera P, 01L, auto opzione tecnica (forces H30), 2 moduli",
        "input": dict(
            sotto_modello="P",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=900,
            colore_struttura="RAL 1013 Avorio sablé",
            colore_plastica="Avorio",
            altezza_montanti_cm=220,
        ),
    },
    {
        "name": "Brera P, 02L (muro lato L), 3 moduli, H20 explicit",
        "input": dict(
            sotto_modello="P",
            variante_montaggio="02L",
            P_richiesta_cm=300,
            L_richiesta_cm=1000,
            colore_struttura="RAL 9006 Grigio sablé",
            colore_plastica="Grigio",
            altezza_montanti_cm=200,
            opzione_tecnica="H20",
        ),
    },
    {
        "name": "Brera P, 01P (crescita su P, min 2 moduli), H20 explicit",
        "input": dict(
            sotto_modello="P",
            variante_montaggio="01P",
            P_richiesta_cm=1000,
            L_richiesta_cm=300,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
            opzione_tecnica="H20",
        ),
    },
    {
        "name": "Brera S, 01L, H20 explicit",
        "input": dict(
            sotto_modello="S",
            variante_montaggio="01L",
            P_richiesta_cm=260,
            L_richiesta_cm=300,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
            opzione_tecnica="H20",
        ),
    },
    {
        "name": "Brera S, 03P (muro lato P, min 2 moduli), H30 explicit",
        "input": dict(
            sotto_modello="S",
            variante_montaggio="03P",
            P_richiesta_cm=900,
            L_richiesta_cm=350,
            colore_struttura="RAL 9006 Alluminio brillante opaco",
            colore_plastica="Grigio ferro",
            altezza_montanti_cm=260,
            opzione_tecnica="H30",
        ),
    },
    {
        "name": "error: altezza exceeds H_max_cm for Brera S (270)",
        "input": dict(
            sotto_modello="S",
            variante_montaggio="01L",
            P_richiesta_cm=260,
            L_richiesta_cm=300,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=290,
            opzione_tecnica="H20",
        ),
    },
    {
        "name": "error: L per modulo exceeds H20 L_max_cm (350)",
        "input": dict(
            sotto_modello="P",
            variante_montaggio="01L",
            P_richiesta_cm=300,
            L_richiesta_cm=400,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
            opzione_tecnica="H20",
            n_moduli=1,
        ),
    },
    {
        "name": "error: invalid variante_montaggio",
        "input": dict(
            sotto_modello="P",
            variante_montaggio="99Z",
            P_richiesta_cm=300,
            L_richiesta_cm=300,
            colore_struttura="RAL 9016 Bianco sablé",
            colore_plastica="Bianco",
            altezza_montanti_cm=200,
        ),
    },
]


def main() -> None:
    vision_engine = PergolaEngine.from_files(
        FIXTURES_DIR / "vision" / "database.json",
        FIXTURES_DIR / "vision" / "price_matrices.json",
    )
    brera_engine = PergolaEngine.from_files(
        FIXTURES_DIR / "brera" / "database.json",
        FIXTURES_DIR / "brera" / "price_matrices.json",
    )

    vision_results = run_cases(vision_engine, VISION_CASES)
    brera_results = run_cases(brera_engine, BRERA_CASES)

    (FIXTURES_DIR / "vision" / "golden_cases.json").write_text(
        json.dumps(vision_results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (FIXTURES_DIR / "brera" / "golden_cases.json").write_text(
        json.dumps(brera_results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(vision_results)} Vision cases and {len(brera_results)} Brera cases.")


if __name__ == "__main__":
    main()
