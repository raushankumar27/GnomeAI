import json
from typing import Dict, Any, Optional
from gnomeai_backend.interfaces.agent import BaseAgent, AgentContext, AgentStepResult
from gnomeai_backend.config import app_settings
from gnomeai_backend.llm.client import query_llm
from gnomeai_backend.tools.registry import execute_tool, parse_tool_call

class SubAgentWorker(BaseAgent):
    """Concrete BaseAgent worker class executing background subtasks."""

    def __init__(self, instruction: str):
        prompt = (
            "You are GnomeAI-Subagent, a focused background execution agent.\n"
            f"Your task is: {instruction}\n"
            "Analyze requirements, invoke tools when needed, and provide technical result."
        )
        super().__init__(role_name="subagent_worker", prompt_template=prompt)
        self.instruction = instruction

    def process_turn(self, context: AgentContext, user_input: Optional[str] = None) -> AgentStepResult:
        messages = [
            {"role": "system", "content": self.prompt_template},
            {"role": "user", "content": f"Begin work on the subtask: {self.instruction}"}
        ]
        res_text = query_llm(messages, model_name=app_settings.get("fast_model_name"))
        tool_call, thought = parse_tool_call(res_text)
        return AgentStepResult(
            role=self.role_name,
            response_text=res_text,
            tool_call=tool_call,
            is_terminal=(tool_call is None)
        )

def run_subagent(instruction: str, parent_session_id=None, status_callback=None):
    worker = SubAgentWorker(instruction)
    print(f"[Subagent] Summoned SubAgentWorker for task: '{instruction}'")
    if status_callback:
        status_callback({"type": "dag_step", "step": "initialized", "node": "Input", "details": instruction})
    
    messages = [
        {"role": "system", "content": worker.prompt_template},
        {"role": "user", "content": f"Begin work on the subtask: {instruction}"}
    ]
    max_turns = 10
    execution_log = []
    
    for turn in range(1, max_turns + 1):
        try:
            res_text = query_llm(messages, model_name=app_settings.get("fast_model_name"))
            messages.append({"role": "assistant", "content": res_text})
            tool_call, thought = parse_tool_call(res_text)
            if tool_call:
                t_name = tool_call.get("tool")
                t_args = tool_call.get("arguments", {})
                log_msg = f"Turn {turn}: Calling tool '{t_name}' with args {t_args}"
                execution_log.append(log_msg)
                if status_callback:
                    status_callback({"type": "dag_step", "step": "tool_exec", "node": t_name, "details": log_msg})
                res = execute_tool(t_name, t_args)
                res_str = json.dumps(res) if isinstance(res, dict) else str(res)
                messages.append({"role": "user", "content": f"Tool execution result:\n{res_str}"})
            else:
                if status_callback:
                    status_callback({"type": "dag_step", "step": "completed", "node": "Output", "details": res_text})
                return {"success": True, "result": res_text, "log": "\n".join(execution_log)}
        except Exception as e:
            return {"success": False, "error": f"Subagent error: {str(e)}", "log": "\n".join(execution_log)}
            
    return {"success": False, "error": f"Subagent exceeded maximum turns ({max_turns})", "log": "\n".join(execution_log)}
