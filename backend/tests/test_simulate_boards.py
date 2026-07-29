import asyncio

from scripts.simulate_boards import run_suite


def test_every_board_completes_offline_with_and_without_sheriff():
    results = asyncio.run(run_suite(runs=2, timeout=3.0))
    assert all(result["status"] == "ok" for result in results), results
