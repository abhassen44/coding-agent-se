import asyncio
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv("c:/Users/Abhas/OneDrive/Desktop/coding/coding_Agent/coding-agent/backend/.env")
api_key = os.getenv("GEMINI_API_KEY")

async def main():
    try:
        client = genai.Client(api_key=api_key)
        history = [
            types.Content(role="user", parts=[types.Part.from_text(text="Hello, my name is John")]),
            types.Content(role="model", parts=[types.Part.from_text(text="Hello John, nice to meet you!")]),
        ]
        
        chat = client.aio.chats.create(
            model="gemini-3-flash-preview", 
            config=types.GenerateContentConfig(
                system_instruction="You are nice."
            )
        )
        # how to set history?
        # Maybe client.aio.chats.create(history=history)?
        chat_with_history = client.aio.chats.create(
            model="gemini-3-flash-preview",
            config=types.GenerateContentConfig(
                system_instruction="You are nice."
            )
        )
        # Actually in the new SDK it seems chats.create(history=...) is not available or wait, let's try it.
        chat_with_history = client.aio.chats.create(
            model="gemini-3-flash-preview",
            config=types.GenerateContentConfig(
                system_instruction="You are nice."
            ),
            history=history
        )
        response = await chat_with_history.send_message("What is my name?")
        print("Response:", response.text)
        
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
