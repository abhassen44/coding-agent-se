"""Full chain test with qwen3.5:9b — verify iterative tool calling works."""
import asyncio
from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing import Annotated, TypedDict

@tool
def get_weather(location: str) -> str:
    """Get the weather for a specific location."""
    return f"It's 25°C and sunny in {location}."

@tool
def get_population(city: str) -> str:
    """Get the population of a city."""
    return f"{city} has a population of about 9 million people."

tools = [get_weather, get_population]
tool_node = ToolNode(tools)

model = ChatOllama(model="qwen3.5:9b", temperature=0).bind_tools(tools)

class State(TypedDict):
    messages: Annotated[list, add_messages]

async def call_model(state: State):
    response = await model.ainvoke(state["messages"])
    # Clean think tags
    import re
    if response.content:
        response.content = re.sub(r'<think>.*?</think>', '', response.content, flags=re.DOTALL).strip()
    tc = len(response.tool_calls) if response.tool_calls else 0
    print(f"  [agent] content={bool(response.content)} tool_calls={tc}")
    if response.content:
        print(f"  [agent] -> {response.content[:200]}")
    return {"messages": [response]}

def should_continue(state: State):
    last = state["messages"][-1]
    if last.tool_calls:
        print(f"  [route] -> tools")
        return "tools"
    print(f"  [route] -> END")
    return END

workflow = StateGraph(State)
workflow.add_node("agent", call_model)
workflow.add_node("tools", tool_node)
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")
app = workflow.compile()

async def main():
    print("=== Full chain test with qwen3.5:9b ===\n")
    result = await app.ainvoke({
        "messages": [
            SystemMessage(content="You have tools to get weather and population. Use them to answer. After using tools, give a final text summary."),
            HumanMessage(content="Tell me about London - weather and population.")
        ]
    })
    print("\n=== FINAL RESPONSE ===")
    from langchain_core.messages import AIMessage
    for msg in result["messages"]:
        if isinstance(msg, AIMessage) and msg.content and not msg.tool_calls:
            print(msg.content)
            break

asyncio.run(main())
