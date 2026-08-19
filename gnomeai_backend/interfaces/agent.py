from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

class AgentContext(BaseModel):
    session_id: str
    workspace_path: str
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    checklist: List[str] = Field(default_factory=list)
    staged_changes: Dict[str, str] = Field(default_factory=dict)
    test_reports: List[str] = Field(default_factory=list)
    current_agent_role: str = "planner"
    hitl_approved: bool = False
    validation_attempts: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)

class AgentStepResult(BaseModel):
    role: str
    response_text: str
    next_role: Optional[str] = None
    tool_call: Optional[Dict[str, Any]] = None
    status_message: Optional[str] = None
    is_terminal: bool = False

class BaseAgent(ABC):
    """Abstract Base Class for autonomous agents in the GnomeAI swarm system."""

    def __init__(self, role_name: str, prompt_template: str):
        self._role_name = role_name
        self._prompt_template = prompt_template

    @property
    def role_name(self) -> str:
        return self._role_name

    @property
    def prompt_template(self) -> str:
        return self._prompt_template

    @abstractmethod
    def process_turn(self, context: AgentContext, user_input: Optional[str] = None) -> AgentStepResult:
        """Processes a single turn of reasoning/action for this agent node."""
        pass
