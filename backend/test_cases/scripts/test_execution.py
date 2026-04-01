"""Test script for Phase 4 Execution Engine API endpoints."""
import asyncio
import httpx

BASE = "http://localhost:8000/api/v1"

# Update these with valid credentials
EMAIL = "test@test.com"
PASSWORD = "test1234"


async def get_token():
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if resp.status_code != 200:
            print(f"Login failed: {resp.status_code} {resp.text}")
            return None
        return resp.json()["access_token"]


async def test_execute_python(token: str):
    print("\n=== Test 1: Execute Python (success) ===")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BASE}/execute/run",
            json={"code": 'print("Hello from ICA sandbox!")', "language": "python"},
            headers={"Authorization": f"Bearer {token}"},
        )
        data = resp.json()
        print(f"Status: {resp.status_code}")
        print(f"Execution status: {data.get('status')}")
        print(f"stdout: {data.get('stdout', '').strip()}")
        print(f"stderr: {data.get('stderr', '').strip()}")
        print(f"exit_code: {data.get('exit_code')}")
        print(f"execution_time_ms: {data.get('execution_time_ms')}")
        assert data["status"] == "success", f"Expected success, got {data['status']}"
        assert "Hello from ICA sandbox!" in (data.get("stdout") or ""), "Output mismatch"
        print("✅ PASSED")
        return data.get("id")


async def test_execute_error(token: str):
    print("\n=== Test 2: Execute Python (error) ===")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BASE}/execute/run",
            json={"code": "print(undefined_var)", "language": "python"},
            headers={"Authorization": f"Bearer {token}"},
        )
        data = resp.json()
        print(f"Status: {resp.status_code}")
        print(f"Execution status: {data.get('status')}")
        print(f"stderr: {data.get('stderr', '').strip()[:200]}")
        assert data["status"] == "error", f"Expected error, got {data['status']}"
        assert data.get("stderr"), "Expected non-empty stderr"
        print("✅ PASSED")
        return data.get("id")


async def test_history(token: str):
    print("\n=== Test 3: Execution History ===")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{BASE}/execute/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        data = resp.json()
        print(f"Status: {resp.status_code}")
        print(f"Total executions: {data.get('total')}")
        print(f"Returned: {len(data.get('executions', []))}")
        assert data["total"] >= 2, f"Expected at least 2, got {data['total']}"
        print("✅ PASSED")


async def test_diagnose(token: str, execution_id: int):
    print(f"\n=== Test 4: Diagnose Execution #{execution_id} ===")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BASE}/execute/{execution_id}/diagnose",
            headers={"Authorization": f"Bearer {token}"},
        )
        data = resp.json()
        print(f"Status: {resp.status_code}")
        print(f"Diagnostic preview: {data.get('diagnostic', '')[:200]}...")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data.get("diagnostic"), "Expected non-empty diagnostic"
        print("✅ PASSED")


async def main():
    print("Phase 4 — Execution Engine Tests")
    print("=" * 40)

    token = await get_token()
    if not token:
        print("❌ Could not get auth token. Make sure backend is running and credentials are correct.")
        return

    print(f"✅ Authenticated")

    try:
        success_id = await test_execute_python(token)
        error_id = await test_execute_error(token)
        await test_history(token)
        if error_id:
            await test_diagnose(token, error_id)
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")

    print("\n" + "=" * 40)
    print("All tests completed!")


if __name__ == "__main__":
    asyncio.run(main())
