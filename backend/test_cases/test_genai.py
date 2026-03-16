from google import genai

try:
    print(dir(genai))
    client = genai.Client()
    print("Client created")
except Exception as e:
    print("Error:", e)
