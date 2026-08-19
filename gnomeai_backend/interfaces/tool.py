from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Type

class BaseTool(ABC):
    """Abstract Base Class for all system tools executable by GnomeAI agents."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for the tool."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description for prompt engineering."""
        pass

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        """JSON Schema dictionary describing expected input parameters."""
        return {}

    @abstractmethod
    def execute(self, **kwargs: Any) -> Dict[str, Any]:
        """Executes tool logic and returns standardized output dictionary."""
        pass

class ToolRegistry:
    """Polymorphic container and decorator registry for tools (Open/Closed Principle)."""

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}

    def register(self, tool_class: Type[BaseTool]):
        """Decorator or method to register a BaseTool class or instance."""
        if isinstance(tool_class, type):
            instance = tool_class()
        else:
            instance = tool_class
        self._tools[instance.name] = instance
        return tool_class

    def get_tool(self, name: str) -> Optional[BaseTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters_schema
            }
            for t in self._tools.values()
        ]

    def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        tool = self.get_tool(tool_name)
        if not tool:
            return {"error": f"Tool '{tool_name}' is not registered."}
        try:
            return tool.execute(**args)
        except Exception as e:
            return {"error": f"Execution error in tool '{tool_name}': {str(e)}"}

# Global tool registry instance
tool_registry = ToolRegistry()
