import asyncio
import sys

# Add backend directory to path so imports work
sys.path.append('c:/Users/Abhas/OneDrive/Desktop/coding/coding_Agent/coding-agent/backend')

from app.services.gemini_service import get_gemini_service

async def main():
    try:
        service = get_gemini_service()
        response = await service.generate_response("Hi there, just testing.")
        with open("c:/Users/Abhas/OneDrive/Desktop/coding/coding_Agent/coding-agent/response_out.txt", "w", encoding="utf-8") as f:
            f.write(response)
    except Exception as e:
        with open("c:/Users/Abhas/OneDrive/Desktop/coding/coding_Agent/coding-agent/response_out.txt", "w", encoding="utf-8") as f:
            f.write(f"Error during testing: {repr(e)}")

if __name__ == "__main__":
    asyncio.run(main())
