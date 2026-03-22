import asyncio
import os
import httpx
from app.core.database import async_session_maker
from app.models.user import User
from sqlalchemy import select
from app.core.security import create_access_token

async def test():
    async with async_session_maker() as db:
        user = (await db.execute(select(User).limit(1))).scalar_one()
        token = create_access_token(user.id)
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://localhost:8000/api/v1/workspace/create",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"repo_id": 1}
        )
        print(f"Status: {resp.status_code}")
        print(f"Body: {resp.text}")

if __name__ == "__main__":
    asyncio.run(test())
