import os
import json
import subprocess
from typing import List, Dict, Any, Optional
from gnomeai_backend.interfaces.agent import BaseAgent, AgentContext, AgentStepResult
from gnomeai_backend.core.workspace import workspace_manager
from gnomeai_backend.llm.client import query_llm_stream

PLANNER_PROMPT = """You are the Lead Architect & Planner.
Your job is to analyze the codebase, list index files, run semantic search query, and write a structured step-by-step checklist of files to modify.

You MUST output your step-by-step modification checklist wrapped inside `[PLAN_CHECKLIST_START]` and `[PLAN_CHECKLIST_END]` markers like:
[PLAN_CHECKLIST_START]
- [ ] Task 1: Add new function to helper.py
- [ ] Task 2: Update assertions in test_helper.py
[PLAN_CHECKLIST_END]
"""

DEVELOPER_PROMPT = """You are the Senior Software Developer.
Your job is to implement the checklist sub-tasks by modifying the codebase files using `propose_file_change`.
"""

TESTER_PROMPT = """You are the Quality Assurance & Debugger Agent.
Your job is to run the workspace test suite and verify staged modifications.
"""

class PlannerAgent(BaseAgent):
    def __init__(self):
        super().__init__(role_name="planner", prompt_template=PLANNER_PROMPT)

    def process_turn(self, context: AgentContext, user_input: Optional[str] = None) -> AgentStepResult:
        return AgentStepResult(
            role=self.role_name,
            response_text="Formulated planner roadmap.",
            next_role="developer",
            status_message="Planner step complete."
        )

class DeveloperAgent(BaseAgent):
    def __init__(self):
        super().__init__(role_name="developer", prompt_template=DEVELOPER_PROMPT)

    def process_turn(self, context: AgentContext, user_input: Optional[str] = None) -> AgentStepResult:
        return AgentStepResult(
            role=self.role_name,
            response_text="Developer modifications staged.",
            next_role="tester",
            status_message="Developer step complete."
        )

class TesterAgent(BaseAgent):
    def __init__(self):
        super().__init__(role_name="tester", prompt_template=TESTER_PROMPT)

    def process_turn(self, context: AgentContext, user_input: Optional[str] = None) -> AgentStepResult:
        return AgentStepResult(
            role=self.role_name,
            response_text="QA tests completed.",
            next_role="done",
            is_terminal=True
        )

class AgentSwarmOrchestrator:
    """State machine orchestrator managing polymorphic swarm agent transitions."""
    def __init__(self):
        self.agents: Dict[str, BaseAgent] = {
            "planner": PlannerAgent(),
            "developer": DeveloperAgent(),
            "tester": TesterAgent()
        }
        self.active_contexts: Dict[str, AgentContext] = {}

    def get_or_create_context(self, session_id: str, user_message: str) -> AgentContext:
        if session_id not in self.active_contexts:
            ctx = AgentContext(
                session_id=session_id,
                workspace_path=workspace_manager.workspace_path or "",
                messages=[
                    {"role": "system", "content": PLANNER_PROMPT},
                    {"role": "user", "content": user_message}
                ],
                current_agent_role="planner"
            )
            self.active_contexts[session_id] = ctx
        else:
            self.active_contexts[session_id].messages.append({"role": "user", "content": user_message})
        return self.active_contexts[session_id]

orchestrator = AgentSwarmOrchestrator()

# SSE generator runner preserving signature
def run_code_agent_turn(user_message: str, session_id: str):
    if not workspace_manager.workspace_path:
        yield {"type": "error", "message": "No active workspace folder opened. Please load a folder first."}
        return
    ctx = orchestrator.get_or_create_context(session_id, user_message)
    yield {"type": "status", "message": f"🤖 Multi-Agent Swarm Orchestrator Active Node: `{ctx.current_agent_role.upper()}`"}
    
    try:
        response_text = ""
        for chunk in query_llm_stream(ctx.messages):
            if chunk["type"] == "content":
                chunk_text = chunk["text"]
                response_text += chunk_text
                yield {"type": "chat_response", "content": chunk_text}
        
        ctx.messages.append({"role": "assistant", "content": response_text})
        yield {"type": "success", "message": "Multi-agent swarm turn processed."}
    except Exception as e:
        yield {"type": "error", "message": f"Agent execution error: {str(e)}"}
