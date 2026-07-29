from scripts.evaluate_ai_scenarios import run_offline


def test_ai_scenario_prompts_and_information_boundaries():
    results = run_offline()
    assert all(result["status"] == "ok" for result in results), results
